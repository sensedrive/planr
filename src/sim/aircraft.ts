import { MathUtils, type Object3D, Quaternion, Vector3 } from 'three';
import type { ControlState } from '../core/input';
import { computeAero, createAeroOut } from './aero';
import { airDensity, RHO0 } from './atmosphere';
import type { PowerPlant } from './engine';
import { computeGround, type HeightFn } from './ground';
import { C172, type AircraftType } from './types';

const GRAVITY = 9.81;
const RAD2DEG = 180 / Math.PI;
const MS_TO_KT = 1.943844;
const M_TO_FT = 3.28084;
const NO_WIND = new Vector3();

export interface StartSpot {
  position: Vector3;
  /** degrees, 0 = north (-Z) */
  heading: number;
  /** airborne start speed in m/s (0 = standing on the ground) */
  speed?: number;
  /** flight-path angle in degrees for airborne starts (negative = descending) */
  pathDeg?: number;
  flaps?: number;
  spool?: number;
}

export interface Touchdown {
  position: Vector3;
  /** vertical speed at first wheel contact (ft/min, negative = sinking) */
  vsFpm: number;
  bankDeg: number;
  airspeedKt: number;
  headingDeg: number;
}

/** 6-DOF rigid-body aircraft. Body axes: +X right, +Y up, -Z forward. */
export class Aircraft {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly quat = new Quaternion();
  /** body-frame angular velocity (rad/s) */
  readonly omega = new Vector3();
  type: AircraftType = C172;
  engine: PowerPlant = C172.createEngine();
  readonly aero = createAeroOut();
  /** landing gear position: 0 retracted … 1 down */
  gear = 1;

  private readonly prevPos = new Vector3();
  private readonly prevQuat = new Quaternion();

  /** semi-realistic extras: prop torque/P-factor and stall asymmetry/spins */
  realistic = true;
  flaps = 0;
  thrust = 0;
  onGround = true;
  airTime = 0;
  crashed = false;
  crashReason = '';
  /** set on the step the wheels first touch after flight; consumers clear it */
  touchdown: Touchdown | null = null;

  private readonly vBody = new Vector3();
  private readonly forceW = new Vector3();
  private readonly torqueW = new Vector3();
  private readonly momentB = new Vector3();
  private readonly tmp = new Vector3();
  private readonly invQuat = new Quaternion();
  private readonly dq = new Quaternion();

  setType(type: AircraftType): void {
    if (type === this.type) return;
    this.type = type;
    this.engine = type.createEngine();
  }

  reset(spot: StartSpot): void {
    this.pos.copy(spot.position);
    this.gear = 1;
    this.quat.setFromAxisAngle(new Vector3(0, 1, 0), (-spot.heading * Math.PI) / 180);
    this.omega.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.engine.reset();
    this.flaps = spot.flaps ?? 0;
    this.crashed = false;
    this.crashReason = '';
    this.touchdown = null;
    const speed = spot.speed ?? 0;
    this.onGround = speed === 0;
    this.airTime = 0;
    if (speed > 0) {
      if (this.type.retractableGear) this.gear = 0;
      const path = ((spot.pathDeg ?? 0) * Math.PI) / 180;
      this.vel.set(0, Math.sin(path) * speed, -Math.cos(path) * speed).applyQuaternion(this.quat);
      this.engine.spool = spot.spool ?? 0.65;
    }
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  step(dt: number, c: ControlState, height: HeightFn, wind: Vector3 = NO_WIND): void {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (this.crashed) return;

    const t = this.type;
    this.flaps += MathUtils.clamp(c.flaps - this.flaps, -dt * 0.3, dt * 0.3);
    if (t.retractableGear) {
      // weight on wheels blocks retraction; a full cycle takes ~6 s
      const target = this.onGround ? 1 : c.gear >= 0.5 ? 1 : 0;
      this.gear += MathUtils.clamp(target - this.gear, -dt / 6, dt / 6);
    } else this.gear = 1;

    this.invQuat.copy(this.quat).invert();
    this.vBody.copy(this.vel).sub(wind).applyQuaternion(this.invQuat);
    const rho = airDensity(this.pos.y);

    const wingHeight = this.pos.y - Math.max(0, height(this.pos.x, this.pos.z)) - t.restHeight;
    const aero = computeAero(t.aero, this.vBody, this.omega, c, this.flaps, this.gear, rho, this.aero, this.realistic, wingHeight);
    this.thrust = this.engine.update(dt, c.throttle, aero.airspeed, rho);

    // forces: body → world
    this.forceW.copy(aero.force);
    this.forceW.z -= this.thrust;
    this.forceW.applyQuaternion(this.quat);
    this.forceW.y -= t.mass * GRAVITY;
    this.torqueW.set(0, 0, 0);

    const ground = computeGround(t.contacts, this.gear, this.pos, this.vel, this.quat, this.omega, c, height, this.forceW, this.torqueW);
    if (ground.crash) {
      this.crashed = true;
      this.crashReason = ground.crash;
      this.vel.set(0, 0, 0);
      this.omega.set(0, 0, 0);
      return;
    }
    if (ground.onGround && !this.onGround && this.airTime > 2) {
      this.touchdown = {
        position: this.pos.clone(),
        vsFpm: this.verticalSpeedFpm,
        bankDeg: this.rollDeg,
        airspeedKt: this.airspeedKt,
        headingDeg: this.headingDeg,
      };
    }
    this.onGround = ground.onGround;
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    this.momentB.copy(this.torqueW).applyQuaternion(this.invQuat).add(aero.moment);
    if (this.realistic && t.propeller) {
      // slipstream + P-factor yaw the nose left (more at high angle of attack), engine torque rolls left;
      // on the ground the nose wheel takes most of it
      this.momentB.y += this.thrust * (0.1 + 2 * Math.max(0, aero.alpha)) * (this.onGround ? 0.1 : 1);
      this.momentB.z += this.engine.torque * (rho / RHO0);
    }

    // linear (semi-implicit Euler)
    this.vel.addScaledVector(this.forceW, dt / t.mass);
    this.pos.addScaledVector(this.vel, dt);

    // angular: I·ω' = M − ω × (I·ω)
    const w = this.omega;
    const I = t.inertia;
    this.tmp.set(I.x * w.x, I.y * w.y, I.z * w.z);
    this.tmp.crossVectors(w, this.tmp);
    w.x += ((this.momentB.x - this.tmp.x) / I.x) * dt;
    w.y += ((this.momentB.y - this.tmp.y) / I.y) * dt;
    w.z += ((this.momentB.z - this.tmp.z) / I.z) * dt;

    // numerical safety net: rotation rates beyond ~570°/s are not physical here
    if (w.lengthSq() > 100) w.setLength(10);
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + w.x + w.y + w.z)) {
      this.crashed = true;
      this.crashReason = 'Flugzustand außer Kontrolle';
      this.pos.copy(this.prevPos);
      this.vel.set(0, 0, 0);
      w.set(0, 0, 0);
      return;
    }
    const angle = w.length() * dt;
    if (angle > 1e-9) {
      this.tmp.copy(w).normalize();
      this.dq.setFromAxisAngle(this.tmp, angle);
      this.quat.multiply(this.dq).normalize();
    }
  }

  /** Writes a render pose interpolated between the last two physics states. */
  interpolate(t: number, target: Object3D): void {
    target.position.lerpVectors(this.prevPos, this.pos, t);
    target.quaternion.slerpQuaternions(this.prevQuat, this.quat, t);
  }

  // ---- telemetry -----------------------------------------------------------

  get airspeedKt(): number {
    return this.aero.airspeed * MS_TO_KT;
  }

  get altitudeFt(): number {
    return this.pos.y * M_TO_FT;
  }

  get verticalSpeedFpm(): number {
    return this.vel.y * M_TO_FT * 60;
  }

  get headingDeg(): number {
    const f = this.tmp.set(0, 0, -1).applyQuaternion(this.quat);
    const h = Math.atan2(f.x, -f.z) * RAD2DEG;
    return (h + 360) % 360;
  }

  get pitchDeg(): number {
    const f = this.tmp.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.asin(MathUtils.clamp(f.y, -1, 1)) * RAD2DEG;
  }

  get rollDeg(): number {
    const rightY = this.tmp.set(1, 0, 0).applyQuaternion(this.quat).y;
    const upY = this.tmp.set(0, 1, 0).applyQuaternion(this.quat).y;
    return Math.atan2(-rightY, upY) * RAD2DEG;
  }

  get stallWarning(): boolean {
    return !this.onGround && !this.crashed && this.aero.airspeed > 8 && this.aero.alpha > this.aero.stallAngle - 4 / RAD2DEG;
  }
}
