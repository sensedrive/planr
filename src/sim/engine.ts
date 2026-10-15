import { clamp } from '../core/input';
import { RHO0 } from './atmosphere';

/** Common interface of the engines; `rpm` is propeller rpm, jet N1 % or turboprop torque %. */
export interface PowerPlant {
  spool: number;
  rpm: number;
  failed: boolean;
  /** false until started (cold & dark) or after fuel starvation / shutdown */
  running: boolean;
  /** shaft torque (N·m) reacting on the airframe */
  readonly torque: number;
  reset(running?: boolean): void;
  /** Returns thrust in newtons. */
  update(dt: number, throttle: number, airspeed: number, rho: number): number;
  /** Starter engaged (key in START): spins up and starts the engine if it can run. */
  crank(dt: number, canRun: boolean): void;
}

export interface PistonParams {
  /** total shaft power (W) of all engines */
  power: number;
  /** total static thrust (N) */
  staticThrust: number;
  idleRpm?: number;
  maxRpm?: number;
  propEfficiency?: number;
}

/** Fixed-pitch piston engine(s) + propeller. */
export class Engine implements PowerPlant {
  /** spooled throttle 0…1, lags the lever */
  spool = 0;
  rpm: number;
  failed = false;
  running = true;
  private readonly idle: number;
  private readonly range: number;
  private crankTime = 0;

  constructor(private readonly p: PistonParams = { power: 118_000, staticThrust: 2900 }) {
    this.idle = p.idleRpm ?? 650;
    this.range = (p.maxRpm ?? 2500) - this.idle;
    this.rpm = this.idle;
  }

  reset(running = true): void {
    this.spool = 0;
    this.running = running;
    this.rpm = running ? this.idle : 0;
    this.failed = false;
    this.crankTime = 0;
  }

  get torque(): number {
    return this.running ? (this.spool * this.p.power) / 260 : 0;
  }

  crank(dt: number, canRun: boolean): void {
    if (this.running) return;
    this.crankTime += dt;
    this.rpm = Math.min(this.rpm + dt * 500, 300);
    if (canRun && this.crankTime > 1.2) {
      this.running = true;
      this.crankTime = 0;
    }
  }

  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    const on = this.running && !this.failed;
    const lever = on ? clamp(throttle, 0, 1) : 0;
    this.spool += (lever - this.spool) * Math.min(1, dt * (on ? 1.8 : 0.8));
    // windmilling adds a little rpm with airspeed; a stopped engine only windmills
    const windmill = Math.min(airspeed, 75) * (on ? 5 : 14);
    const target = on ? this.idle + this.spool * this.range + windmill : windmill;
    this.rpm += (target - this.rpm) * Math.min(1, dt * (on ? 6 : 1.5));
    if (!on) return 0;
    const eta = this.p.propEfficiency ?? 0.78;
    const available = Math.min(this.p.staticThrust, (eta * this.p.power) / Math.max(airspeed, 1));
    return this.spool * available * (rho / RHO0);
  }
}

/** Turboprop: slow spool like a turbine, propeller thrust like a piston; `rpm` shows torque %. */
export class Turboprop implements PowerPlant {
  spool = 0;
  rpm = 0;
  failed = false;
  running = true;
  private ng = 0.62;
  private crankTime = 0;

  constructor(
    private readonly power: number,
    private readonly staticThrust: number,
  ) {}

  reset(running = true): void {
    this.running = running;
    this.ng = running ? 0.62 : 0;
    this.spool = 0;
    this.rpm = 0;
    this.failed = false;
    this.crankTime = 0;
  }

  get torque(): number {
    return this.running ? (this.spool * this.power) / 180 : 0;
  }

  crank(dt: number, canRun: boolean): void {
    if (this.running) return;
    this.crankTime += dt;
    this.ng = Math.min(0.62, this.ng + dt * 0.12);
    if (canRun && this.crankTime > 4) this.running = true;
  }

  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    const on = this.running && !this.failed;
    const target = on ? 0.62 + 0.38 * clamp(throttle, 0, 1) : 0;
    this.ng += clamp(target - this.ng, -0.25 * dt, 0.45 * dt);
    this.spool = clamp((this.ng - 0.62) / 0.38, 0, 1);
    this.rpm = on ? 8 + this.spool * 92 : 0;
    if (!on) return 0;
    const available = Math.min(this.staticThrust, (0.8 * this.power) / Math.max(airspeed, 1));
    return (0.04 + 0.96 * this.spool) * available * Math.pow(rho / RHO0, 0.8);
  }
}

const N1_IDLE = 0.55;

/** Turbofan/turbojet(s): slow spool-up, thrust nearly independent of speed, optional afterburner. */
export class JetEngine implements PowerPlant {
  /** N1 fraction */
  private n1 = N1_IDLE;
  spool = 0;
  rpm = N1_IDLE * 100;
  failed = false;
  running = true;
  /** afterburner lit (throttle above 95 %) */
  reheat = false;
  private crankTime = 0;

  constructor(
    private readonly maxThrust: number = 16_900,
    private readonly afterburner = 0,
  ) {}

  reset(running = true): void {
    this.running = running;
    this.n1 = running ? N1_IDLE : 0;
    this.spool = 0;
    this.rpm = this.n1 * 100;
    this.failed = false;
    this.reheat = false;
    this.crankTime = 0;
  }

  get torque(): number {
    return 0;
  }

  crank(dt: number, canRun: boolean): void {
    if (this.running) return;
    this.crankTime += dt;
    this.n1 = Math.min(0.25, this.n1 + dt * 0.06);
    this.rpm = this.n1 * 100;
    if (canRun && this.crankTime > 5) this.running = true;
  }

  update(dt: number, throttle: number, airspeed: number, rho: number): number {
    const on = this.running && !this.failed;
    const lever = clamp(throttle, 0, 1);
    const target = on ? N1_IDLE + (1 - N1_IDLE) * Math.min(1, lever / 0.95) : Math.min(0.25, airspeed / 400);
    // spooling is slow from idle and quicker near full power
    const rate = this.n1 < 0.75 ? 0.35 : 0.7;
    this.n1 += clamp(target - this.n1, -rate * dt, rate * dt);
    this.rpm = this.n1 * 100;
    this.spool = clamp((this.n1 - N1_IDLE) / (1 - N1_IDLE), 0, 1);
    this.reheat = on && this.afterburner > 0 && lever > 0.95 && this.spool > 0.95;
    if (!on) return 0;
    const lapse = 1 - 0.25 * Math.min(1, airspeed / 300);
    const dry = 0.024 * this.maxThrust + this.maxThrust * Math.pow(this.spool, 1.6);
    return (this.reheat ? this.afterburner : dry) * lapse * Math.pow(rho / RHO0, 0.7);
  }
}

/** Gliders. */
export class NoEngine implements PowerPlant {
  spool = 0;
  rpm = 0;
  failed = false;
  running = false;
  readonly torque = 0;
  reset(): void {}
  crank(): void {}
  update(): number {
    return 0;
  }
}
