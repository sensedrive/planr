import type { VisionEffects } from '../engine/render/renderer';

/**
 * Comfort vignette: darkens the periphery while the aircraft rotates quickly, plus the G effects
 * (tunnel vision and blackout, red-out). The renderer draws it head-locked in every mode.
 */
export class ComfortVignette {
  enabled = true;
  readonly effects: VisionEffects = { comfort: 0, blackout: 0, redout: 0 };
  private k = 0;

  /**
   * `rate` = angular speed of the aircraft in rad/s; `blackout` and `redout` (0…1) are shown even
   * with the comfort vignette switched off.
   */
  update(dt: number, rate: number, active: boolean, blackout = 0, redout = 0): void {
    const target = this.enabled && active ? Math.min(1, Math.max(0, (rate - 0.3) / 0.9)) : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 6 : 2));
    this.effects.comfort = this.k;
    this.effects.blackout = blackout;
    this.effects.redout = redout;
  }
}
