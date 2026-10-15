import type { Color, Vector3 } from 'three';
import type { MissionId } from '../game/settings';
import { type Airport, runwayLocal } from './airports';

export type ScenarioId = 'alps' | 'fjord' | 'nyc';

export interface RingCourseDef {
  start: Vector3;
  heading: number;
  rings: Vector3[];
}

/** A landscape: terrain, colours, airfields, decoration and which missions make sense there. */
export interface Scenario {
  id: ScenarioId;
  name: string;
  /** natural ground height (m) before airfields are flattened in; < 0 is under water */
  rawHeight(x: number, z: number): number;
  /** ground colour for a terrain vertex (ny = normal.y) */
  color(x: number, z: number, h: number, ny: number, out: Color): Color;
  /** airports[0] is the home field */
  airports: Airport[];
  /** goal of the cross-country mission */
  destination: Airport | null;
  missions: MissionId[];
  /** where trees may grow (null = no trees) */
  trees: { center: Vector3; radius: number; ok(x: number, z: number, h: number, slope: number): boolean } | null;
  cloudBase: number;
  waterColor: number;
  ringCourse(height: (x: number, z: number) => number): RingCourseDef;
  /** extra solid height, e.g. building roofs (collision), or -Infinity */
  obstacleHeight?(x: number, z: number): number;
  /** start of the ditching mission */
  ditchingStart?: { position: Vector3; heading: number };
}

let active: Scenario | null = null;

export function scenario(): Scenario {
  if (!active) throw new Error('no scenario selected');
  return active;
}

export function setScenario(s: Scenario): void {
  active = s;
}

export function home(): Airport {
  return scenario().airports[0];
}

export function airportAt(x: number, z: number): Airport | null {
  for (const a of scenario().airports) {
    const p = runwayLocal(a, x, z);
    if (Math.abs(p.along) <= a.length / 2 && Math.abs(p.lateral) <= a.width / 2) return a;
  }
  return null;
}
