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
  /** thermals need sunshine */
  thermals = true;
  cloudBase = 1200;
  /** vertical air movement (m/s) from ridge lift and thermals at the last update */
  lift = 0;

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

  /** Real wind from a METAR: direction it comes from, mean speed and gusts (kt). */
  configureLive(fromDeg: number, speedKt: number, gustKt: number): void {
    this.baseKt = speedKt;
    this.fromDeg = fromDeg;
    this.gust = speedKt > 0 ? Math.max(0, gustKt - speedKt) / Math.max(speedKt, 1) : 0;
    this.turbulence = Math.min(2, 0.2 + speedKt * 0.06 + this.gust);
    this.current.set(0, 0, 0);
  }

  /**
   * Ridge lift (wind deflected up a slope) and thermals (rising columns on a 1.8 km grid)
   * at a point; `height` gives the terrain height.
   */
  private liftAt(x: number, z: number, agl: number, alt: number, height: (x: number, z: number) => number): number {
    const e = 60;
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    // wind towards rising ground is forced upwards
    const ridge = Math.max(0, Math.min(6, (this.current.x * gx + this.current.z * gz) * 1.2)) * Math.exp(-Math.max(0, agl) / 300);
    let thermal = 0;
    if (this.thermals && alt < this.cloudBase) {
      const cell = 1800;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx;
          const iz = cz + dz;
          const hsh = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
          const r1 = hsh - Math.floor(hsh);
          const r2 = (r1 * 9301 + 0.49) % 1;
          if (r1 < 0.35) continue; // not every cell has a thermal
          const tx = (ix + 0.2 + r1 * 0.6) * cell;
          const tz = (iz + 0.2 + r2 * 0.6) * cell;
          const radius = 160 + r2 * 120;
          const d2 = (x - tx) ** 2 + (z - tz) ** 2;
          // updraft core with a ring of sink around it; weak near the ground
          const core = (1.3 + r1 * 2.2) * Math.exp(-d2 / (radius * radius));
          const sink = 0.6 * Math.exp(-d2 / (radius * radius * 4)) - 0.6 * Math.exp(-d2 / (radius * radius));
          thermal += (core - sink * 0.5) * Math.min(1, Math.max(0, agl) / 120);
        }
    }
    return ridge + thermal;
  }

  update(dt: number, heightAboveGround: number, pos?: { x: number; y: number; z: number }, height?: (x: number, z: number) => number): void {
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
    this.lift = pos && height ? this.liftAt(pos.x, pos.z, heightAboveGround, pos.y, height) : 0;
    this.current.y += this.lift;
  }
}
