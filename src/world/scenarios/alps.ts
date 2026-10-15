import * as THREE from 'three';
import { makeAirport } from '../airports';
import { noiseC, noiseD, rawHeight } from '../noise';
import type { Scenario } from '../scenario';
import { smooth, valleyCourse } from './common';

const DEG = Math.PI / 180;

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

const C_SAND = new THREE.Color(0xc9b98a);
const C_GRASS = new THREE.Color(0x5d8a3a);
const C_GRASS2 = new THREE.Color(0x7c9a45);
const C_FOREST = new THREE.Color(0x355e2b);
const C_ROCK = new THREE.Color(0x7a746b);
const C_SNOW = new THREE.Color(0xf2f4f6);

export function createAlps(): Scenario {
  const site = findMountainSite();
  const home = makeAirport('home', 'Talflugplatz', 0, 0, 30, 0, 1200, 30, { buildings: true });
  const mountain = makeAirport('mountain', 'Bergflugplatz', site.x, site.z, site.elevation, site.heading, 900, 25);
  const s: Scenario = {
    id: 'alps',
    name: 'Alpental',
    rawHeight,
    color(x, z, h, ny, out) {
      const field = noiseD(x * 0.004, z * 0.004);
      out.copy(C_GRASS).lerp(C_GRASS2, field * 0.5 + 0.5);
      out.lerp(C_FOREST, smooth(h + field * 40, 140, 260));
      out.lerp(C_ROCK, smooth(h, 420, 560));
      out.lerp(C_ROCK, smooth(1 - ny, 0.25, 0.45));
      out.lerp(C_SNOW, smooth(h + field * 60, 760, 860) * smooth(ny, 0.7, 0.85));
      out.lerp(C_SAND, 1 - smooth(h, 1, 4));
      return out.multiplyScalar(0.92 + noiseC(x * 0.02, z * 0.02) * 0.08);
    },
    airports: [home, mountain],
    destination: mountain,
    missions: ['free', 'airstart', 'landing', 'rings', 'crosscountry'],
    trees: { center: new THREE.Vector3(0, 0, 0), radius: 3500, ok: (_x, _z, h, slope) => h > 4 && h < 320 && slope < 6 },
    cloudBase: 1100,
    waterColor: 0x2f6f8f,
    ringCourse: (height) => valleyCourse(height, home, 2024),
  };
  return s;
}
