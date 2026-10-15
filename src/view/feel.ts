import * as THREE from 'three';
import type { Aircraft } from '../sim/aircraft';

/** smooth 1-D value noise in -1…1 */
function noise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number) => {
    const x = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** G tolerance before the vision greys out: trained pilots, and a g-suit in the fighter */
function tolerance(ac: Aircraft): number {
  return ac.type.id === 'f16' ? 7.5 : ac.type.id === 'extra' ? 5.5 : 4.5;
}

/**
 * What makes flying feel physical: runway rumble, turbulence jolts, stall buffet, engine
 * vibration and the touchdown bump shake the pilot's head; sustained G drains the vision
 * (grey-out / black-out, red-out under negative G). Outputs are read by the camera,
 * the vignette and the controller haptics.
 */
export class FlightFeel {
  enabled = true;
  /** head offset in aircraft axes (m) */
  readonly offset = new THREE.Vector3();
  /** small head rotation (rad) */
  readonly tilt = new THREE.Euler();
  /** 0…1 strength of the vibration, for haptics */
  rumble = 0;
  /** 0…1 tunnel vision from positive G, 0…1 red-out from negative G */
  blackout = 0;
  redout = 0;
  private t = 0;
  private nSlow = 1;
  private sideSlow = 0;
  private bump = 0;
  private stress = 0;
  private negStress = 0;
  private lastTouchdown: Aircraft['touchdown'] = null;

  update(dt: number, ac: Aircraft, active: boolean): void {
    this.offset.set(0, 0, 0);
    this.tilt.set(0, 0, 0);
    if (!active || dt <= 0) {
      this.rumble = 0;
      this.blackout += (0 - this.blackout) * Math.min(1, dt * 2);
      this.redout += (0 - this.redout) * Math.min(1, dt * 2);
      return;
    }
    this.t += dt;
    const t = this.t;
    const n = Number.isFinite(ac.gLoad) ? ac.gLoad : 1;
    const side = Number.isFinite(ac.gSide) ? ac.gSide : 0;
    // jolts: the fast part of the load factor (gusts, bumps)
    const jolt = THREE.MathUtils.clamp(Math.abs(n - this.nSlow), 0, 2);
    this.nSlow += (n - this.nSlow) * Math.min(1, dt * 4);
    this.sideSlow += (side - this.sideSlow) * Math.min(1, dt * 4);

    if (ac.touchdown && ac.touchdown !== this.lastTouchdown) this.bump = Math.max(this.bump, Math.min(1, Math.abs(ac.touchdown.vsFpm) / 500) * 0.8 + 0.2);
    this.lastTouchdown = ac.touchdown;
    this.bump *= Math.exp(-dt * 7);

    const groundSpeed = Math.hypot(ac.vel.x, ac.vel.z);
    const runway = ac.onGround ? Math.min(1, groundSpeed / 30) * 0.6 + (groundSpeed > 0.5 ? 0.08 : 0) : 0;
    const a = ac.aero;
    const buffet = a.stallAngle > 0 ? THREE.MathUtils.clamp((a.alpha - a.stallAngle * 0.78) / (a.stallAngle * 0.22), 0, 1) * Math.min(1, a.airspeed / 15) : 0;
    const engine = ac.engine.running ? 0.05 + 0.1 * ac.engine.spool : 0;
    const turb = Math.min(1, jolt * 1.5);
    this.rumble = Math.min(1, runway + buffet * 0.8 + turb * 0.6 + this.bump + (ac.type.propeller ? engine * 0.5 : 0));

    if (this.enabled) {
      // amplitudes in metres, frequencies in Hz
      const r = runway * 0.004 + this.bump * 0.012;
      const b = buffet * 0.006;
      const e = engine * 0.0006;
      const j = turb * 0.006;
      this.offset.set(
        noise(t * 13, 1) * (r + b) + noise(t * 31, 2) * e + noise(t * 6, 3) * j,
        noise(t * 15, 4) * (r * 1.5 + b) + noise(t * 33, 5) * e + noise(t * 7, 6) * j * 1.5 - this.bump * 0.015,
        noise(t * 11, 7) * b * 0.5,
      );
      this.tilt.set(noise(t * 9, 8) * (b + r) * 0.8, 0, noise(t * 8, 9) * (b + r + j) * 0.8);
      // the head sinks under G and swings out in skids
      this.offset.y -= THREE.MathUtils.clamp((this.nSlow - 1) * 0.012, -0.04, 0.06);
      this.offset.x -= THREE.MathUtils.clamp(this.sideSlow * 0.03, -0.04, 0.04);
    }

    // G-induced vision loss builds up over a few seconds and recovers slowly
    const tol = tolerance(ac);
    this.stress = THREE.MathUtils.clamp(this.stress + (this.nSlow > tol ? (this.nSlow - tol) * 0.35 : -0.35) * dt, 0, 1.2);
    this.negStress = THREE.MathUtils.clamp(this.negStress + (this.nSlow < -2 ? (-2 - this.nSlow) * 0.5 : -0.5) * dt, 0, 1);
    const grey = THREE.MathUtils.clamp((this.nSlow - (tol - 1)) / 3, 0, 0.5);
    this.blackout = Math.min(1, Math.max(grey, this.stress));
    this.redout = this.negStress;
  }
}
