import { Vector3 } from 'three';
import { rawHeight } from './noise';

const DEG = Math.PI / 180;

export interface Airport {
  id: string;
  name: string;
  /** runway centre; y = elevation */
  center: Vector3;
  /** heading of runway "A" in degrees (the direction you fly when landing on it) */
  heading: number;
  length: number;
  width: number;
  /** forward unit vector of runway A */
  f: Vector3;
  /** right unit vector of runway A */
  r: Vector3;
  labelA: string;
  labelB: string;
  buildings: boolean;
}

function runwayLabel(headingDeg: number): string {
  const n = Math.round((((headingDeg % 360) + 360) % 360) / 10);
  return String(n === 0 ? 36 : n).padStart(2, '0');
}

function makeAirport(id: string, name: string, x: number, z: number, elevation: number, heading: number, length: number, width: number, buildings: boolean): Airport {
  const h = heading * DEG;
  return {
    id,
    name,
    center: new Vector3(x, elevation, z),
    heading,
    length,
    width,
    f: new Vector3(Math.sin(h), 0, -Math.cos(h)),
    r: new Vector3(Math.cos(h), 0, Math.sin(h)),
    labelA: runwayLabel(heading),
    labelB: runwayLabel(heading + 180),
    buildings,
  };
}

/** Finds a plausible mountain plateau for the second airfield (deterministic). */
function findMountainSite(): { x: number; z: number; elevation: number; heading: number } {
  let best = { x: 6000, z: -6000, elevation: 300, heading: 90, score: -Infinity };
  const len = 900;
  for (let gx = -9000; gx <= 9000; gx += 500) {
    for (let gz = -9000; gz <= 9000; gz += 500) {
      const d = Math.hypot(gx, gz);
      if (d < 5000 || d > 9000) continue;
      for (const heading of [0, 45, 90, 135]) {
        const h = heading * DEG;
        const fx = Math.sin(h);
        const fz = -Math.cos(h);
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (let i = 0; i <= 8; i++) {
          const s = (i / 8 - 0.5) * len;
          const y = rawHeight(gx + fx * s, gz + fz * s);
          min = Math.min(min, y);
          max = Math.max(max, y);
          sum += y;
        }
        const mean = sum / 9;
        if (mean < 220 || mean > 650 || max - min > 110) continue;
        const score = mean - (max - min) * 2;
        if (score > best.score) best = { x: gx, z: gz, elevation: Math.round(mean), heading, score };
      }
    }
  }
  return best;
}

const site = findMountainSite();

export const HOME = makeAirport('home', 'Talflugplatz', 0, 0, 30, 0, 1200, 30, true);
export const MOUNTAIN = makeAirport('mountain', 'Bergflugplatz', site.x, site.z, site.elevation, site.heading, 900, 25, false);
export const AIRPORTS: Airport[] = [HOME, MOUNTAIN];

/** Position relative to the runway: along runway A's direction and to its right. */
export function runwayLocal(a: Airport, x: number, z: number): { along: number; lateral: number } {
  const dx = x - a.center.x;
  const dz = z - a.center.z;
  return { along: dx * a.f.x + dz * a.f.z, lateral: dx * a.r.x + dz * a.r.z };
}

/** World point from runway coordinates. */
export function runwayPoint(a: Airport, along: number, lateral: number, height = 0, out = new Vector3()): Vector3 {
  return out
    .copy(a.center)
    .addScaledVector(a.f, along)
    .addScaledVector(a.r, lateral)
    .setY(a.center.y + height);
}

export function airportAt(x: number, z: number): Airport | null {
  for (const a of AIRPORTS) {
    const p = runwayLocal(a, x, z);
    if (Math.abs(p.along) <= a.length / 2 && Math.abs(p.lateral) <= a.width / 2) return a;
  }
  return null;
}
