/** Unified pilot inputs, written by keyboard, gamepad or the VR cockpit. */
export interface ControlState {
  /** -1 push (nose down) … +1 pull (nose up) */
  pitch: number;
  /** -1 left … +1 right */
  roll: number;
  /** rudder, -1 left … +1 right */
  yaw: number;
  /** 0 … 1 */
  throttle: number;
  /** 0 … 1 */
  brake: number;
  /** target flap setting 0 … 1 in FLAP_STEPS steps */
  flaps: number;
  /** pitch trim -1 (nose down) … +1 (nose up) */
  trim: number;
}

export const FLAP_STEPS = 3;

export interface Actions {
  reset(airStart?: boolean): void;
  toggleCamera(): void;
  recenter(): void;
  togglePause(): void;
  toggleMute(): void;
  toggleHelp(): void;
}

export function createControlState(): ControlState {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0, flaps: 0, trim: 0 };
}

export function clamp(v: number, min = -1, max = 1): number {
  return v < min ? min : v > max ? max : v;
}

export function stepFlaps(c: ControlState, dir: number): void {
  c.flaps = clamp(Math.round(c.flaps * FLAP_STEPS) + dir, 0, FLAP_STEPS) / FLAP_STEPS;
}

/** Moves `v` toward `target`, faster when returning to center (keyboard-style axis). */
export function approachAxis(v: number, target: number, dt: number, rate = 2.5, returnRate = 4): number {
  const r = target === 0 ? returnRate : rate;
  const d = target - v;
  const step = r * dt;
  return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
}

export function deadzone(v: number, dz = 0.1): number {
  const a = Math.abs(v);
  return a < dz ? 0 : (Math.sign(v) * (a - dz)) / (1 - dz);
}
