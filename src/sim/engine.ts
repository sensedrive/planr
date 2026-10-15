import { clamp } from '../core/input';
import { RHO0 } from './atmosphere';

/** Common interface of the engines; `rpm` is propeller rpm or jet N1 in percent. */
export interface PowerPlant {
  spool: number;
  rpm: number;
  failed: boolean;
  /** shaft torque (N·m) reacting on the airframe */
  readonly torque: number;
  reset(): void;
  /** Returns thrust in newtons. */
  update(dt: number, throttle: number, airspeed: number, rho: number): number;
}

const IDLE_RPM = 650;
const RPM_RANGE = 1850;
const STATIC_THRUST = 2900; // N
const POWER = 118_000; // W (≈160 hp)
const PROP_EFFICIENCY = 0.78;

/** Fixed-pitch piston engine + propeller, roughly a Cessna 172. */
export class Engine implements PowerPlant {
  /** spooled throttle 0…1, lags the lever */
  spool = 0;
  rpm = IDLE_RPM;
  failed = false;

  reset(): void {
    this.spool = 0;
    this.rpm = IDLE_RPM;
    this.failed = false;
  }

  get torque(): number {
    return this.spool * 450;
  }

  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    const lever = this.failed ? 0 : clamp(throttle, 0, 1);
    this.spool += (lever - this.spool) * Math.min(1, dt * (this.failed ? 0.8 : 1.8));
    // windmilling adds a little rpm with airspeed; a failed engine only windmills
    const windmill = Math.min(airspeed, 75) * (this.failed ? 14 : 5);
    this.rpm = this.failed ? Math.max(this.spool * 2000, windmill) : IDLE_RPM + this.spool * RPM_RANGE + windmill;
    const available = Math.min(STATIC_THRUST, (PROP_EFFICIENCY * POWER) / Math.max(airspeed, 1));
    return this.spool * available * (rho / RHO0);
  }
}

const JET_MAX_THRUST = 16_900; // N
const N1_IDLE = 0.55;

/** Small turbofan: slow spool-up, thrust nearly independent of speed. */
export class JetEngine implements PowerPlant {
  /** N1 fraction */
  private n1 = N1_IDLE;
  spool = 0;
  rpm = N1_IDLE * 100;
  failed = false;

  reset(): void {
    this.n1 = N1_IDLE;
    this.spool = 0;
    this.rpm = this.n1 * 100;
    this.failed = false;
  }

  get torque(): number {
    return 0;
  }

  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    const target = this.failed ? Math.min(0.25, airspeed / 400) : N1_IDLE + (1 - N1_IDLE) * clamp(throttle, 0, 1);
    // spooling is slow from idle and quicker near full power
    const rate = this.n1 < 0.75 ? 0.35 : 0.7;
    this.n1 += clamp(target - this.n1, -rate * dt, rate * dt);
    this.rpm = this.n1 * 100;
    this.spool = clamp((this.n1 - N1_IDLE) / (1 - N1_IDLE), 0, 1);
    if (this.failed) return 0;
    const lapse = 1 - 0.25 * Math.min(1, airspeed / 300);
    return (400 + JET_MAX_THRUST * Math.pow(this.spool, 1.6)) * lapse * Math.pow(rho / RHO0, 0.7);
  }
}
