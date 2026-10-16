import { Quaternion, Vector3 } from 'three';

/** One recorded moment of the player's flight: everything the model needs to look the same. */
export interface ReplayFrame {
  /** flight time (s) */
  t: number;
  pos: Vector3;
  quat: Quaternion;
  /** stick, rudder and throttle as the pilot held them */
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  /** actual surface positions (0…1) */
  flaps: number;
  gear: number;
  /** propeller rpm, or N1/torque % for turbines */
  rpm: number;
  spool: number;
  /** m/s */
  airspeed: number;
  /** load factor (g), bends the wings */
  gLoad: number;
  onGround: boolean;
  engineRunning: boolean;
  reheat: boolean;
  /** lights as bit flags, see LIGHT */
  lights: number;
}

export const LIGHT = { power: 1, nav: 2, strobe: 4, beacon: 8, landing: 16 } as const;

/** numbers per frame in the ring buffer */
const STRIDE = 21;
const BOOL = { onGround: 1, engineRunning: 2, reheat: 4 } as const;

export function createFrame(): ReplayFrame {
  return {
    t: 0,
    pos: new Vector3(),
    quat: new Quaternion(),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0,
    flaps: 0,
    gear: 1,
    rpm: 0,
    spool: 0,
    airspeed: 0,
    gLoad: 1,
    onGround: false,
    engineRunning: false,
    reheat: false,
    lights: 0,
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Flight recorder: samples the aircraft at a fixed rate into a ring buffer holding the last
 * few minutes, and reads it back at any time in between with interpolation.
 * Plain typed arrays, so recording allocates nothing.
 */
export class FlightRecorder {
  readonly capacity: number;
  private readonly data: Float64Array;
  /** index of the oldest frame */
  private head = 0;
  private count = 0;
  /** time the next frame is due; keeps the average rate even when render frames do not divide it */
  private due = 0;
  private readonly qa = new Quaternion();
  private readonly qb = new Quaternion();

  constructor(
    /** frames per second */
    readonly rate = 20,
    /** seconds kept */
    seconds = 180,
  ) {
    this.capacity = Math.ceil(rate * seconds);
    this.data = new Float64Array(this.capacity * STRIDE);
  }

  get length(): number {
    return this.count;
  }

  get startTime(): number {
    return this.count ? this.data[this.offset(0)] : 0;
  }

  get endTime(): number {
    return this.count ? this.data[this.offset(this.count - 1)] : 0;
  }

  get duration(): number {
    return this.endTime - this.startTime;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.due = 0;
  }

  /** Buffer offset of the i-th oldest frame. */
  private offset(i: number): number {
    return ((this.head + i) % this.capacity) * STRIDE;
  }

  /**
   * Stores the frame if at least one sample interval passed since the last one (or `force`).
   * Returns whether it was stored. Time going backwards (a new flight) starts over.
   */
  record(f: ReplayFrame, force = false): boolean {
    if (this.count) {
      const last = this.endTime;
      if (f.t < last) this.clear();
      else if (f.t === last || (!force && f.t < this.due - 1e-9)) return false;
    }
    const interval = 1 / this.rate;
    // a long gap (pause) does not cause a burst of catch-up frames
    this.due = this.count && f.t - this.due < interval ? this.due + interval : f.t + interval;
    let i: number;
    if (this.count < this.capacity) {
      i = this.offset(this.count);
      this.count++;
    } else {
      // full: overwrite the oldest
      i = this.head * STRIDE;
      this.head = (this.head + 1) % this.capacity;
    }
    const d = this.data;
    d[i] = f.t;
    d[i + 1] = f.pos.x;
    d[i + 2] = f.pos.y;
    d[i + 3] = f.pos.z;
    d[i + 4] = f.quat.x;
    d[i + 5] = f.quat.y;
    d[i + 6] = f.quat.z;
    d[i + 7] = f.quat.w;
    d[i + 8] = f.pitch;
    d[i + 9] = f.roll;
    d[i + 10] = f.yaw;
    d[i + 11] = f.throttle;
    d[i + 12] = f.flaps;
    d[i + 13] = f.gear;
    d[i + 14] = f.rpm;
    d[i + 15] = f.spool;
    d[i + 16] = f.airspeed;
    d[i + 17] = f.gLoad;
    d[i + 18] = (f.onGround ? BOOL.onGround : 0) | (f.engineRunning ? BOOL.engineRunning : 0) | (f.reheat ? BOOL.reheat : 0);
    d[i + 19] = f.lights;
    d[i + 20] = 0;
    return true;
  }

  /** Index of the last frame at or before `t` (binary search; times are increasing). */
  private indexAt(t: number): number {
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.data[this.offset(mid)] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * The state at time `t`, clamped to the recorded range: positions and controls are
   * interpolated linearly, the attitude by slerp, switches and flags come from the earlier frame.
   */
  sample(t: number, out: ReplayFrame = createFrame()): ReplayFrame {
    if (!this.count) return out;
    const d = this.data;
    const ia = this.indexAt(t);
    const ib = Math.min(ia + 1, this.count - 1);
    const a = this.offset(ia);
    const b = this.offset(ib);
    const span = d[b] - d[a];
    const k = span > 0 ? Math.min(1, Math.max(0, (t - d[a]) / span)) : 0;
    out.t = lerp(d[a], d[b], k);
    out.pos.set(lerp(d[a + 1], d[b + 1], k), lerp(d[a + 2], d[b + 2], k), lerp(d[a + 3], d[b + 3], k));
    this.qa.set(d[a + 4], d[a + 5], d[a + 6], d[a + 7]);
    this.qb.set(d[b + 4], d[b + 5], d[b + 6], d[b + 7]);
    out.quat.slerpQuaternions(this.qa, this.qb, k);
    out.pitch = lerp(d[a + 8], d[b + 8], k);
    out.roll = lerp(d[a + 9], d[b + 9], k);
    out.yaw = lerp(d[a + 10], d[b + 10], k);
    out.throttle = lerp(d[a + 11], d[b + 11], k);
    out.flaps = lerp(d[a + 12], d[b + 12], k);
    out.gear = lerp(d[a + 13], d[b + 13], k);
    out.rpm = lerp(d[a + 14], d[b + 14], k);
    out.spool = lerp(d[a + 15], d[b + 15], k);
    out.airspeed = lerp(d[a + 16], d[b + 16], k);
    out.gLoad = lerp(d[a + 17], d[b + 17], k);
    const flags = d[a + 18];
    out.onGround = (flags & BOOL.onGround) !== 0;
    out.engineRunning = (flags & BOOL.engineRunning) !== 0;
    out.reheat = (flags & BOOL.reheat) !== 0;
    out.lights = d[a + 19];
    return out;
  }
}
