import * as THREE from 'three';
import { makeAirport } from '../airports';
import { noiseA, noiseB, noiseC, noiseD } from '../noise';
import type { Scenario } from '../scenario';
import { smooth, valleyCourse } from './common';

const DEG = Math.PI / 180;

/**
 * Valley line of the main trough (x of its axis at z). Modelled on the Achensee: a long glacial
 * trough running north–south with a lake north of the home field, limestone walls on both sides.
 */
function valleyX(z: number): number {
  return 650 * Math.sin(z * 0.00019 + 0.6) + 400 * noiseB(z * 0.00011, 3.7) - 650 * Math.sin(0.6) - 400 * noiseB(0, 3.7);
}

/** 0 on a valley floor of half-width `half`, rising as a U-shaped trough over `wall` metres to 1. */
function trough(d: number, half: number, wall: number): number {
  const t = Math.min(1, Math.max(0, (d - half) / wall));
  // concave foot (scree and fans), steep middle, gentler shoulder (the Almen)
  return t * t * (3 - 2 * t);
}

/** Ridged multifractal on a warped domain: sharp crests and arêtes, smooth valleys between them. */
function ridges(x: number, z: number): number {
  const wx = x + 900 * noiseC(x * 0.00012, z * 0.00012);
  const wz = z + 900 * noiseC(x * 0.00012 + 31.7, z * 0.00012 - 11.3);
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1 / 6500;
  let w = 1;
  for (let i = 0; i < 7; i++) {
    let n = 1 - Math.abs(noiseA(wx * freq, wz * freq));
    n *= n * w;
    w = Math.min(1, n * 2.6);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

const LAKE_N = -11500;
const LAKE_S = -2700;

/** Natural ground height of the Alpine valley before the airfields are flattened in. */
export function alpineHeight(x: number, z: number): number {
  const vx = valleyX(z);
  const d = Math.abs(x - vx);
  // valley floor: 30 m at the field, down to the lake shore to the north, gently falling south
  let floor = 6 + 24 * smooth(z, LAKE_S - 900, LAKE_S + 900);
  if (z > 2500) floor = Math.max(12, floor - (z - 2500) * 0.004);
  floor += 3 * noiseD(x * 0.002, z * 0.002);
  // the lake fills a narrower trough, its walls drop straight into the water; a delta fan juts out
  // from the west shore (like Pertisau)
  const lake = smooth(z, LAKE_N, LAKE_N + 900) * (1 - smooth(z, LAKE_S - 400, LAKE_S));
  const fan = 1 - smooth(Math.hypot((x - vx + 520) * 0.8, z + 6800), 150, 600);
  const lakeHalf = 750 + (380 + 170 * noiseC(z * 0.0004, 1.3) - 750) * lake;
  const half = lakeHalf + 500 * fan;
  const shore = d + 90 * noiseC(x * 0.0021, z * 0.0021) - (lakeHalf - 120) + 700 * fan;
  if (lake > 0) floor += (-55 - floor) * lake * (1 - smooth(shore, -60, 140));
  // side valleys branch off as a network (|noise| near zero), hanging above the main floor
  const sx = x + 1200 * noiseC(z * 0.0002 + 5, x * 0.0002);
  const sv = Math.abs(noiseB(sx * 0.0001 + 7.1, z * 0.0001 - 3.3)) * 6000;
  const mask = Math.min(trough(d, half, 1800), 0.35 + 0.65 * trough(sv, 80, 1400));
  // mountains: distinct massifs with summits, lower ridges between them
  const mass = 0.62 + 0.38 * noiseD(x * 0.00006 + 2.2, z * 0.00006 - 4.1);
  const r = ridges(x, z);
  // a concave profile: gentle foot, walls steepening upward into sharp summits
  let above = 2200 * Math.pow(mass * (0.32 + 0.68 * r) * mask, 1.45);
  // limestone strata: cliff bands with ledges, folded so they cut across the contours
  const tilt = noiseD(x * 0.00035, z * 0.00035) * 1.6;
  const f = above / 150 + tilt;
  const i = Math.floor(f);
  const terraced = (i + smooth(f - i, 0.5, 0.9) - tilt) * 150;
  above += (terraced - above) * 0.25 * smooth(above, 150, 420) * (1 - smooth(above, 1150, 1450));
  // rock rubble and gullies on the walls
  above += (22 * noiseC(x * 0.0045, z * 0.0045) + 7 * noiseA(x * 0.013, z * 0.013)) * smooth(above, 20, 200);
  return floor + above;
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
          const y = alpineHeight(gx + fx * s, gz + fz * s);
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
const C_FOREST = new THREE.Color(0x2a4b26);
const C_ROCK = new THREE.Color(0x8a857c);
// Karwendel limestone: pale grey walls, lighter scree below them, alpine pasture above the trees
const C_LIME = new THREE.Color(0xa29d93);
const C_SCREE = new THREE.Color(0xb3ada2);
const C_ALM = new THREE.Color(0x7f8f4a);
const C_SNOW = new THREE.Color(0xf2f4f6);
// valley floor patchwork: hay, fields, darker pasture
const C_HAY = new THREE.Color(0x9c9a52);
const C_FIELD = new THREE.Color(0x7d6a45);
const C_PASTURE = new THREE.Color(0x456f2f);

export function createAlps(): Scenario {
  const site = findMountainSite();
  const home = makeAirport('home', 'Talflugplatz', 0, 0, 30, 0, 1200, 30, { buildings: true });
  const mountain = makeAirport('mountain', 'Bergflugplatz', site.x, site.z, site.elevation, site.heading, 900, 25);
  const s: Scenario = {
    id: 'alps',
    name: 'Alpental',
    rawHeight: alpineHeight,
    color(x, z, h, ny, out) {
      const field = noiseD(x * 0.004, z * 0.004);
      out.copy(C_GRASS).lerp(C_GRASS2, field * 0.5 + 0.5);
      // fields on the flatter, lower ground in blocky patches
      const lowland = (1 - smooth(h, 120, 220)) * smooth(ny, 0.94, 0.99);
      const cell = noiseC(Math.floor(x / 180) * 1.7, Math.floor(z / 240) * 1.3);
      if (cell > 0.35) out.lerp(C_HAY, lowland * 0.7);
      else if (cell < -0.4) out.lerp(C_FIELD, lowland * 0.6);
      else if (cell < -0.1) out.lerp(C_PASTURE, lowland * 0.5);
      // mountain forest on the slopes up to the tree line, pasture and dwarf pine above it
      const slopeF = smooth(1 - ny, 0.02, 0.08);
      out.lerp(C_FOREST, smooth(h + field * 30, 12, 50) * Math.max(slopeF, smooth(h + field * 40, 50, 130)) * (1 - smooth(h + field * 80, 820, 940)));
      out.lerp(C_ALM, smooth(h + field * 80, 860, 960) * smooth(ny, 0.86, 0.95) * 0.8);
      // limestone above the pasture and on every steep wall; scree on the moderately steep high ground
      const strata = noiseC(x * 0.0009, h * 0.02);
      out.lerp(C_SCREE, smooth(h, 700, 900) * smooth(1 - ny, 0.12, 0.2) * 0.8);
      out.lerp(strata > 0 ? C_LIME : C_ROCK, Math.max(smooth(h + field * 80, 1050, 1220), smooth(1 - ny, 0.2, 0.32)));
      out.lerp(C_SNOW, smooth(h + field * 60, 1280, 1400) * smooth(ny, 0.72, 0.86));
      out.lerp(C_SAND, 1 - smooth(h, 1, 4));
      return out.multiplyScalar(0.92 + noiseC(x * 0.02, z * 0.02) * 0.08);
    },
    airports: [home, mountain],
    destination: mountain,
    missions: ['free', 'airstart', 'landing', 'rings', 'crosscountry'],
    trees: { center: new THREE.Vector3(0, 0, 0), radius: 3500, ok: (_x, _z, h, slope) => h > 4 && h < 900 && slope < 13 },
    cloudBase: 1100,
    waterColor: 0x2f6f8f,
    ringCourse: (height) => valleyCourse(height, home, 2024),
  };
  return s;
}
