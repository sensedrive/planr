import * as THREE from 'three';
import { makeAirport } from '../airports';
import { noiseA, noiseB, noiseC, noiseD } from '../noise';
import type { Scenario } from '../scenario';
import { smooth, valleyCourse } from './common';

/**
 * Norwegian-style fjord coast: open sea with skerries in the west, a 600–1200 m high plateau in the
 * east, cut by long winding U-shaped fjords that reach below sea level.
 */

function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noiseA(x * freq + 31.7, z * freq - 12.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

const FJORD_WIDTH = 0.2; // in channel-noise units (≈ 600 m half width)

/** x where the coast lies for a given z (sea to the west). */
const coastX = (z: number) => -3500 + 1200 * noiseB(z * 0.00018, 7.3);

/** Channel noise: its zero lines are the fjord axes (stretched east–west, domain-warped). */
function channel(x: number, z: number): number {
  const wx = x + 900 * noiseC(x * 0.0003 + 5.1, z * 0.0003);
  const wz = z + 900 * noiseD(x * 0.0003, z * 0.0003 - 2.7);
  return noiseB(wx * 0.00009 + 17.3, wz * 0.00022 - 4.2);
}

/** 1 near the coast, fading to 0 where the fjords end (14 km inland). */
const fjordReach = (inland: number) => 1 - smooth(inland, 9000, 14000);

function fjordHeight(x: number, z: number): number {
  const inland = x - coastX(z);
  const landMask = smooth(inland, -1200, 2600);
  const m = fbm(x * 0.00035, z * 0.00035, 5);
  const ridge = 1 - Math.abs(noiseC(x * 0.0006, z * 0.0006));
  const high = 640 + m * 330 + ridge * ridge * 260;
  let h = -60 + (high + 60) * landMask;

  // skerries and islands off the coast
  if (inland < 1500) {
    const isl = noiseC(x * 0.0016 + 3.3, z * 0.0016) - 0.5;
    if (isl > 0) h = Math.max(h, -60 + isl * 420 * smooth(inland, -7000, -2000));
  }

  // carve the fjords: flat deep floor, steep walls
  const reach = fjordReach(inland);
  if (reach > 0) {
    const v = Math.abs(channel(x, z)) / FJORD_WIDTH;
    if (v < 1) {
      const wall = Math.pow(smooth(v, 0.5, 0.97), 0.75);
      const floor = -110;
      const carved = floor + (h - floor) * wall;
      h = h + (carved - h) * reach;
    }
  }
  return h;
}

const C_ROCK = new THREE.Color(0x5f625f);
const C_DARKROCK = new THREE.Color(0x45474a);
const C_MEADOW = new THREE.Color(0x6a8f3e);
const C_FOREST = new THREE.Color(0x24432a);
const C_HEATH = new THREE.Color(0x7a7550);
const C_SNOW = new THREE.Color(0xeef2f5);

function fjordColor(x: number, z: number, h: number, ny: number, out: THREE.Color): THREE.Color {
  const n = noiseD(x * 0.005, z * 0.005);
  out.copy(C_MEADOW);
  out.lerp(C_FOREST, smooth(h + n * 40, 25, 90));
  out.lerp(C_HEATH, smooth(h + n * 60, 420, 560));
  out.lerp(C_ROCK, smooth(h + n * 80, 650, 800));
  out.lerp(C_SNOW, smooth(h + n * 90, 880, 980) * smooth(ny, 0.6, 0.8));
  // cliffs
  out.lerp(C_DARKROCK, smooth(1 - ny, 0.3, 0.55));
  // bare rock right at the shoreline
  out.lerp(C_ROCK, 1 - smooth(h, 1, 6));
  return out.multiplyScalar(0.9 + noiseC(x * 0.03, z * 0.03) * 0.1);
}

/** Fjord-head site: a point deep inland on a fjord axis, runway aligned with the fjord. */
function findFjordHead(): { x: number; z: number; heading: number } {
  let best = { x: 8000, z: 0, heading: 90, score: -Infinity };
  for (let x = 6000; x <= 10500; x += 250) {
    for (let z = -9000; z <= 9000; z += 250) {
      const inland = x - coastX(z);
      if (fjordReach(inland) < 0.85) continue;
      const c = channel(x, z);
      if (Math.abs(c) > 0.02) continue;
      // fjord direction = perpendicular to the channel gradient
      const e = 20;
      const gx = channel(x + e, z) - channel(x - e, z);
      const gz = channel(x, z + e) - channel(x, z - e);
      // tangent (−gz, gx); heading h has forward (sin h, −cos h)
      const dir = Math.atan2(-gz, -gx);
      const fx = Math.sin(dir);
      const fz = -Math.cos(dir);
      let worst = 0;
      for (let s = -700; s <= 700; s += 100) worst = Math.max(worst, Math.abs(channel(x + fx * s, z + fz * s)));
      if (worst > FJORD_WIDTH * 0.35) continue;
      const score = inland - worst * 20000 - Math.abs(z) * 0.2;
      if (score > best.score) best = { x, z, heading: ((dir * 180) / Math.PI + 360) % 360, score };
    }
  }
  return best;
}

export function createFjord(): Scenario {
  const head = findFjordHead();
  const home = makeAirport('home', 'Fjordflugplatz', head.x, head.z, 6, Math.round(head.heading), 1100, 30, {
    buildings: true,
    flatten: { lateral: 70, along: 160, blend: 450 },
  });
  // island strip off the coast, level with the home field in z
  const islandZ = head.z + 2500;
  const island = makeAirport('island', 'Inselflugplatz', coastX(islandZ) - 2600, islandZ, 9, 0, 900, 25, {
    flatten: { lateral: 90, along: 220, blend: 650 },
  });
  const s: Scenario = {
    id: 'fjord',
    name: 'Fjordküste',
    rawHeight: fjordHeight,
    color: fjordColor,
    airports: [home, island],
    destination: island,
    missions: ['free', 'airstart', 'landing', 'rings', 'crosscountry'],
    trees: {
      center: new THREE.Vector3(head.x, 0, head.z),
      radius: 5000,
      ok: (_x, _z, h, slope) => h > 5 && h < 430 && slope < 9,
    },
    cloudBase: 1450,
    waterColor: 0x1f4c5a,
    ringCourse: (height) => valleyCourse(height, home, 777),
  };
  return s;
}
