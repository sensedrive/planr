import * as THREE from 'three';
import { type Airport, runwayPoint } from '../airports';
import type { RingCourseDef } from '../scenario';
import { mulberry32 } from '../noise';

/** Highest ground along a straight segment (sampled), never below sea level. */
function maxGround(height: (x: number, z: number) => number, a: THREE.Vector3, b: THREE.Vector3): number {
  let m = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    m = Math.max(m, height(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
  }
  return Math.max(m, 0);
}

/** Generates a deterministic ring course that follows low ground (valleys, fjords) from beyond the home runway. */
export function valleyCourse(height: (x: number, z: number) => number, homeField: Airport, seed: number, count = 10): RingCourseDef {
  const rand = mulberry32(seed);
  const start = runwayPoint(homeField, homeField.length / 2 + 1500, 0);
  start.y = Math.max(height(start.x, start.z), 0) + 220;
  let heading = homeField.heading;
  let prev = start.clone();
  const rings: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    let best: { p: THREE.Vector3; h: number; score: number } | null = null;
    for (const off of [-55, -30, -12, 0, 12, 30, 55]) {
      const h = heading + off + (rand() - 0.5) * 6;
      const r = (h * Math.PI) / 180;
      const dist = i === 0 ? 900 : 850;
      const p = new THREE.Vector3(prev.x + Math.sin(r) * dist, 0, prev.z - Math.cos(r) * dist);
      const ground = Math.max(height(p.x, p.z), 0);
      const score = -ground - Math.abs(off) * 1.5;
      if (!best || score > best.score) best = { p, h, score };
    }
    const p = best!.p;
    const ground = Math.max(height(p.x, p.z), 0);
    p.y = Math.max(ground + 70, maxGround(height, prev, p) + 45);
    p.y = Math.min(p.y, prev.y + 140);
    p.y = Math.max(p.y, ground + 40);
    rings.push(p);
    heading = best!.h;
    prev = p;
  }
  return { start, heading: homeField.heading, rings };
}

export const smooth = THREE.MathUtils.smoothstep;
