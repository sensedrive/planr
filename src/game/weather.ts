import { Vector3 } from 'three';
import { createNoise2D } from 'simplex-noise';

export type WindSetting = 'calm' | 'light' | 'strong' | 'gusty';

const KT = 0.514444;

const PRESETS: Record<WindSetting, { speedKt: number; gust: number; turbulence: number }> = {
  calm: { speedKt: 0, gust: 0, turbulence: 0 },
  light: { speedKt: 6, gust: 0.1, turbulence: 0.3 },
  strong: { speedKt: 16, gust: 0.2, turbulence: 1.0 },
  gusty: { speedKt: 12, gust: 0.5, turbulence: 1.8 },
};

/** Wind with gusts and turbulence; `current` is the air velocity in m/s (world frame). */
export class Weather {
  readonly current = new Vector3();
  /** direction the wind comes FROM, degrees */
  fromDeg = 0;
  baseKt = 0;
  private gust = 0;
  private turbulence = 0;
  private t = 0;
  private readonly noise = createNoise2D(Math.random);

  /** Picks a wind roughly against runway `headingDeg`, with some crosswind. */
  configure(setting: WindSetting, headingDeg: number, random = Math.random): void {
    const p = PRESETS[setting];
    this.baseKt = p.speedKt;
    this.gust = p.gust;
    this.turbulence = p.turbulence;
    this.fromDeg = (((headingDeg + (random() - 0.5) * 120) % 360) + 360) % 360;
    this.t = random() * 1000;
    this.current.set(0, 0, 0);
  }

  get speedKt(): number {
    return Math.hypot(this.current.x, this.current.z) / KT;
  }

  update(dt: number, heightAboveGround: number): void {
    this.t += dt;
    const n = this.noise;
    const t = this.t;
    // wind grows a little with height above ground
    const shear = 0.75 + 0.25 * Math.min(1, Math.max(0, heightAboveGround) / 150);
    const gustFactor = 1 + this.gust * (0.6 * n(t * 0.15, 1) + 0.4 * n(t * 0.6, 2));
    const speed = Math.max(0, this.baseKt * KT * shear * gustFactor);
    const to = ((this.fromDeg + 180) * Math.PI) / 180 + 0.12 * this.gust * n(t * 0.1, 3);
    const turb = this.turbulence * Math.min(1, Math.max(0.2, heightAboveGround / 30));
    this.current.set(
      Math.sin(to) * speed + turb * n(t * 1.3, 4),
      turb * 0.6 * n(t * 1.1, 5),
      -Math.cos(to) * speed + turb * n(t * 1.2, 6),
    );
  }
}
