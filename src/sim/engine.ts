import { clamp } from '../core/input';
import { RHO0 } from './atmosphere';

const IDLE_RPM = 650;
const RPM_RANGE = 1850;
const STATIC_THRUST = 2900; // N
const POWER = 118_000; // W (≈160 hp)
const PROP_EFFICIENCY = 0.78;

/** Fixed-pitch piston engine + propeller, roughly a Cessna 172. */
export class Engine {
  /** spooled throttle 0…1, lags the lever */
  spool = 0;
  rpm = IDLE_RPM;

  reset(): void {
    this.spool = 0;
    this.rpm = IDLE_RPM;
  }

  /** Returns thrust in newtons. */
  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    this.spool += (clamp(throttle, 0, 1) - this.spool) * Math.min(1, dt * 1.8);
    // windmilling adds a little rpm with airspeed
    this.rpm = IDLE_RPM + this.spool * RPM_RANGE + Math.min(airspeed, 75) * 5;
    const available = Math.min(STATIC_THRUST, (PROP_EFFICIENCY * POWER) / Math.max(airspeed, 1));
    return this.spool * available * (rho / RHO0);
  }
}
