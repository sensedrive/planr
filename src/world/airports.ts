import { Vector3 } from 'three';

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
  /** terrain flattening around the runway: flat margin beside / beyond it and blend distance (m) */
  flatten: { lateral: number; along: number; blend: number };
}

function runwayLabel(headingDeg: number): string {
  const n = Math.round((((headingDeg % 360) + 360) % 360) / 10);
  return String(n === 0 ? 36 : n).padStart(2, '0');
}

export function makeAirport(
  id: string,
  name: string,
  x: number,
  z: number,
  elevation: number,
  heading: number,
  length: number,
  width: number,
  options: { buildings?: boolean; flatten?: Airport['flatten']; labelHeading?: number } = {},
): Airport {
  const h = (heading * Math.PI) / 180;
  const lh = options.labelHeading ?? heading;
  return {
    id,
    name,
    center: new Vector3(x, elevation, z),
    heading,
    length,
    width,
    f: new Vector3(Math.sin(h), 0, -Math.cos(h)),
    r: new Vector3(Math.cos(h), 0, Math.sin(h)),
    labelA: runwayLabel(lh),
    labelB: runwayLabel(lh + 180),
    buildings: options.buildings ?? false,
    flatten: options.flatten ?? { lateral: 150, along: 300, blend: 1000 },
  };
}

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
