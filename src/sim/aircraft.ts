import { MathUtils, type Object3D, Quaternion, Vector3 } from 'three';
import type { ControlState } from '../core/input';
import { computeAero, createAeroOut } from './aero';
import { airDensity } from './atmosphere';
import { Engine } from './engine';
import { computeGround, type HeightFn } from './ground';

const MASS = 1000; // kg
const INERTIA = new Vector3(1825, 2667, 1285); // about body X (pitch), Y (yaw), Z (roll)
const GRAVITY = 9.81;
const RAD2DEG = 180 / Math.PI;
const MS_TO_KT = 1.943844;
const M_TO_FT = 3.28084;

export interface StartSpot {
  position: Vector3;
  heading: number; // radians, 0 = north (-Z)
}

/** 6-DOF rigid-body aircraft. Body axes: +X right, +Y up, -Z forward. */
export class Aircraft {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly quat = new Quaternion();
  /** body-frame angular velocity (rad/s) */
  readonly omega = new Vector3();
  readonly engine = new Engine();

  private readonly prevPos = new Vector3();
  private readonly prevQuat = new Quaternion();

  flaps = 0;
  thrust = 0;
  onGround = true;
  crashed = false;
  crashReason = '';
  readonly aero = createAeroOut();

  private readonly vBody = new Vector3();
  private readonly forceW = new Vector3();
  private readonly torqueW = new Vector3();
  private readonly momentB = new Vector3();
  private readonly tmp = new Vector3();
  private readonly invQuat = new Quaternion();
  private readonly dq = new Quaternion();

  reset(spot: StartSpot, airStart = false): void {
    this.pos.copy(spot.position);
    this.quat.setFromAxisAngle(new Vector3(0, 1, 0), -spot.heading);
    this.omega.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.engine.reset();
    this.flaps = 0;
    this.crashed = false;
    this.crashReason = '';
    this.onGround = !airStart;
    if (airStart) {
      this.pos.y += 600;
      this.vel.set(0, 0, -55).applyQuaternion(this.quat);
      this.engine.spool = 0.65;
    }
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  step(dt: number, c: ControlState, height: HeightFn): void {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (this.crashed) return;

    this.flaps += MathUtils.clamp(c.flaps - this.flaps, -dt * 0.3, dt * 0.3);

    this.invQuat.copy(this.quat).invert();
    this.vBody.copy(this.vel).applyQuaternion(this.invQuat);
    const rho = airDensity(this.pos.y);

    const aero = computeAero(this.vBody, this.omega, c, this.flaps, rho, this.aero);
    this.thrust = this.engine.update(dt, c.throttle, aero.airspeed, rho);

    // forces: body → world
    this.forceW.copy(aero.force);
    this.forceW.z -= this.thrust;
    this.forceW.applyQuaternion(this.quat);
    this.forceW.y -= MASS * GRAVITY;
    this.torqueW.set(0, 0, 0);

    const ground = computeGround(this.pos, this.vel, this.quat, this.omega, c, height, this.forceW, this.torqueW);
    this.onGround = ground.onGround;
    if (ground.crash) {
      this.crashed = true;
      this.crashReason = ground.crash;
      this.vel.set(0, 0, 0);
      this.omega.set(0, 0, 0);
      return;
    }

    this.momentB.copy(this.torqueW).applyQuaternion(this.invQuat).add(aero.moment);

    // linear (semi-implicit Euler)
    this.vel.addScaledVector(this.forceW, dt / MASS);
    this.pos.addScaledVector(this.vel, dt);

    // angular: I·ω' = M − ω × (I·ω)
    const w = this.omega;
    this.tmp.set(INERTIA.x * w.x, INERTIA.y * w.y, INERTIA.z * w.z);
    this.tmp.crossVectors(w, this.tmp);
    w.x += ((this.momentB.x - this.tmp.x) / INERTIA.x) * dt;
    w.y += ((this.momentB.y - this.tmp.y) / INERTIA.y) * dt;
    w.z += ((this.momentB.z - this.tmp.z) / INERTIA.z) * dt;

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
