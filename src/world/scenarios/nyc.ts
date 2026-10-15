import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeAirport } from '../airports';
import { City } from '../city';
import { noiseC } from '../noise';
import type { Scenario } from '../scenario';

interface Meta {
  origin: { lat: number; lon: number };
  metersPerDegree: { lat: number; lon: number };
  grid: { nx: number; nz: number; x0: number; z0: number; cell: number; heightScale: number };
  cover: { urban: number; park: number; water: number };
  attribution: string;
}

export interface NycWorld {
  scenario: Scenario;
  city: City;
  /** bridges, statue, spires */
  landmarks: THREE.Group;
  attribution: string;
}

const C_URBAN = new THREE.Color(0x77736c);
const C_PARK = new THREE.Color(0x4f7d38);
const C_SHORE = new THREE.Color(0x6b6a66);

/** Loads the prepared New York data (public/data/nyc) and builds the scenario. */
export async function loadNyc(): Promise<NycWorld> {
  const base = `${import.meta.env.BASE_URL}data/nyc/`;
  const [meta, heightBuf, coverBuf, bldgBuf] = await Promise.all([
    fetch(base + 'meta.json').then((r) => r.json() as Promise<Meta>),
    fetch(base + 'height.i16').then((r) => r.arrayBuffer()),
    fetch(base + 'cover.u8').then((r) => r.arrayBuffer()),
    fetch(base + 'buildings.bin').then((r) => r.arrayBuffer()),
  ]);
  const g = meta.grid;
  const heights = new Int16Array(heightBuf);
  const cover = new Uint8Array(coverBuf);
  const ll = (lat: number, lon: number): [number, number] => [
    (lon - meta.origin.lon) * meta.metersPerDegree.lon,
    -(lat - meta.origin.lat) * meta.metersPerDegree.lat,
  ];

  const sample = (x: number, z: number): number => {
    const fx = (x - g.x0) / g.cell;
    const fz = (z - g.z0) / g.cell;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.nz - 1) return -8;
    const ax = fx - i;
    const az = fz - j;
    const k = j * g.nx + i;
    const h00 = heights[k];
    const h10 = heights[k + 1];
    const h01 = heights[k + g.nx];
    const h11 = heights[k + g.nx + 1];
    return ((h00 * (1 - ax) + h10 * ax) * (1 - az) + (h01 * (1 - ax) + h11 * ax) * az) * g.heightScale;
  };
  const coverAt = (x: number, z: number): number => {
    const i = Math.round((x - g.x0) / g.cell);
    const j = Math.round((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return meta.cover.water;
    return cover[j * g.nx + i];
  };

  const city = new City(bldgBuf, sample);

  // LaGuardia (true headings; labels use the magnetic runway numbers)
  const runway = (id: string, name: string, a: [number, number], b: [number, number], width: number, label: number) => {
    const [ax, az] = ll(...a);
    const [bx, bz] = ll(...b);
    const heading = ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
    return makeAirport(id, name, (ax + bx) / 2, (az + bz) / 2, 6, heading, Math.hypot(bx - ax, bz - az), width, {
      labelHeading: label,
      flatten: { lateral: 25, along: 60, blend: 220 },
    });
  };
  const lga04 = runway('lga04', 'LaGuardia', [40.7693, -73.8846], [40.7856, -73.8699], 45, 40);
  const lga13 = runway('lga13', 'LaGuardia', [40.7826, -73.8791], [40.7696, -73.8569], 45, 130);

  const pt = (lat: number, lon: number, y: number) => {
    const [x, z] = ll(lat, lon);
    return new THREE.Vector3(x, y, z);
  };

  const scenario: Scenario = {
    id: 'nyc',
    name: 'New York',
    rawHeight: (x, z) => (coverAt(x, z) === meta.cover.water ? Math.min(sample(x, z), -6) : Math.max(sample(x, z), 0.8)),
    color(x, z, h, ny, out) {
      const c = coverAt(x, z);
      out.copy(c === meta.cover.park ? C_PARK : C_URBAN);
      if (h < 2.5) out.lerp(C_SHORE, 0.6);
      out.lerp(C_SHORE, THREE.MathUtils.smoothstep(1 - ny, 0.3, 0.6));
      return out.multiplyScalar(0.9 + noiseC(x * 0.05, z * 0.05) * 0.1);
    },
    airports: [lga13, lga04],
    destination: null,
    missions: ['free', 'airstart', 'landing', 'rings', 'ditching'],
    trees: {
      center: pt(40.7812, -73.9665, 0),
      radius: 2200,
      ok: (x, z, h, slope) => coverAt(x, z) === meta.cover.park && h > 2 && slope < 8,
    },
    cloudBase: 1250,
    waterColor: 0x34586a,
    obstacleHeight: (x, z) => city.roofAt(x, z),
    // sightseeing tour: down the Hudson, round the Statue of Liberty, up the East River to Central Park
    ringCourse: () => ({
      start: pt(40.812, -73.968, 320),
      heading: 205,
      rings: [
        pt(40.795, -73.982, 280),
        pt(40.772, -73.999, 240),
        pt(40.75, -74.011, 220),
        pt(40.725, -74.016, 200),
        pt(40.703, -74.025, 170),
        pt(40.6885, -74.0405, 140),
        pt(40.6955, -74.022, 150),
        pt(40.7045, -73.9955, 150),
        pt(40.728, -73.972, 160),
        pt(40.752, -73.9605, 190),
        pt(40.77, -73.951, 230),
        pt(40.787, -73.961, 260),
      ],
    }),
    ditchingStart: { position: pt(40.826, -73.958, 850), heading: 205 },
  };

  return { scenario, city, landmarks: landmarks(pt, sample, coverAt, meta.cover.water), attribution: meta.attribution };
}

// ---------------------------------------------------------------------------------------------

const stone = new THREE.MeshLambertMaterial({ color: 0xb9b3a6, flatShading: true });
const steel = new THREE.MeshLambertMaterial({ color: 0x6c7480, flatShading: true });
const copper = new THREE.MeshLambertMaterial({ color: 0x5fa38c, flatShading: true });
const gold = new THREE.MeshLambertMaterial({ color: 0xffc94a, emissive: 0x996600 });
const cableMat = new THREE.LineBasicMaterial({ color: 0x9aa3ad });

type Pt = (lat: number, lon: number, y: number) => THREE.Vector3;

function landmarks(pt: Pt, ground: (x: number, z: number) => number, coverAt: (x: number, z: number) => number, WATER: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'landmarks';

  // spires on top of the buildings from the footprint data
  const spire = (lat: number, lon: number, from: number, to: number, r: number) => {
    const p = pt(lat, lon, 0);
    const base = ground(p.x, p.z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r, to - from, 8), steel);
    m.position.set(p.x, base + (from + to) / 2, p.z);
    g.add(m);
  };
  spire(40.74844, -73.98566, 375, 443, 2.2); // Empire State Building
  spire(40.71274, -74.01338, 410, 541, 2.8); // One World Trade Center
  spire(40.75162, -73.97545, 300, 319, 3.5); // Chrysler Building crown tip

  // Statue of Liberty on Liberty Island
  {
    const p = pt(40.68925, -74.0445, 0);
    const y = ground(p.x, p.z);
    const fort = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 8, 11), stone);
    fort.position.set(p.x, y + 4, p.z);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 38, 4).rotateY(Math.PI / 4), stone);
    pedestal.position.set(p.x, y + 8 + 19, p.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 6.5, 34, 8), copper);
    body.position.set(p.x, y + 46 + 17, p.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), copper);
    head.position.set(p.x, y + 46 + 36, p.z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3, 7), copper);
    crown.position.set(p.x, y + 46 + 39, p.z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 14, 6), copper);
    arm.position.set(p.x + 3.5, y + 46 + 38, p.z);
    arm.rotation.z = -0.25;
    const torch = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8).rotateX(Math.PI), gold);
    torch.position.set(p.x + 5.3, y + 46 + 46.5, p.z);
    g.add(fort, pedestal, body, head, crown, arm, torch);
  }

  // bridges: deck from shore to shore, towers placed where the line meets the water
  const bridge = (a: [number, number], b: [number, number], deck: number, tower: number, suspension: boolean) => {
    const A = pt(a[0], a[1], 0);
    const B = pt(b[0], b[1], 0);
    const len = A.distanceTo(B);
    const dir = B.clone().sub(A).normalize();
    const steps = Math.ceil(len / 15);
    let first = -1;
    let last = -1;
    for (let i = 0; i <= steps; i++) {
      const p = A.clone().addScaledVector(dir, (i / steps) * len);
      if (coverAt(p.x, p.z) === WATER) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first < 0) return;
    const sFirst = (first / steps) * len;
    const sLast = (last / steps) * len;
    const heightAt = (s: number) => {
      // ramps on land up to the deck height
      const ramp = 350;
      const t = Math.min(1, Math.min(Math.max(0, s - (sFirst - ramp)), Math.max(0, sLast + ramp - s)) / ramp);
      const p = A.clone().addScaledVector(dir, s);
      return THREE.MathUtils.lerp(Math.max(ground(p.x, p.z), 1), deck, THREE.MathUtils.smoothstep(t, 0, 1));
    };
    const segs = Math.ceil(len / 40);
    for (let i = 0; i < segs; i++) {
      const s0 = (i / segs) * len;
      const s1 = ((i + 1) / segs) * len;
      const p0 = A.clone().addScaledVector(dir, s0).setY(heightAt(s0));
      const p1 = A.clone().addScaledVector(dir, s1).setY(heightAt(s1));
      const seg = new THREE.Mesh(new THREE.BoxGeometry(24, 2.5, p0.distanceTo(p1) + 0.5), steel);
      seg.position.copy(p0).add(p1).multiplyScalar(0.5);
      seg.lookAt(p1);
      g.add(seg);
    }
    const towers = [sFirst + 20, sLast - 20].map((s) => A.clone().addScaledVector(dir, s));
    for (const t of towers) {
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(6, tower, 8), suspension ? stone : steel);
        const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * 11);
        leg.position.copy(t).add(off).setY(tower / 2);
        leg.rotation.y = Math.atan2(dir.x, dir.z);
        g.add(leg);
      }
    }
    if (suspension) {
      // main cables: anchor – tower – sag – tower – anchor, both sides
      for (const side of [-1, 1]) {
        const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * 11);
        const pts: THREE.Vector3[] = [];
        const anchorA = A.clone().addScaledVector(dir, Math.max(0, sFirst - 250)).setY(deck);
        const anchorB = A.clone().addScaledVector(dir, Math.min(len, sLast + 250)).setY(deck);
        const tA = towers[0].clone().setY(tower);
        const tB = towers[1].clone().setY(tower);
        pts.push(anchorA, tA);
        for (let i = 1; i < 12; i++) {
          const t = i / 12;
          pts.push(tA.clone().lerp(tB, t).setY(tower - (tower - deck - 4) * Math.sin(t * Math.PI)));
        }
        pts.push(tB, anchorB);
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => p.add(off))), cableMat));
      }
    }
  };
  bridge([40.7115, -74.0045], [40.7006, -73.99], 41, 84, true); // Brooklyn Bridge
  bridge([40.7155, -73.9945], [40.6995, -73.987], 42, 102, true); // Manhattan Bridge
  bridge([40.7183, -73.9858], [40.7105, -73.961], 41, 100, true); // Williamsburg Bridge
  bridge([40.7605, -73.964], [40.751, -73.942], 40, 105, false); // Queensboro Bridge

  return mergeByMaterial(g);
}

/** Bakes all parts into one mesh per material (and one line set) to keep draw calls low. */
function mergeByMaterial(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const segments: number[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      const list = byMat.get(o.material as THREE.Material) ?? [];
      list.push(geo);
      byMat.set(o.material as THREE.Material, list);
    } else if (o instanceof THREE.Line) {
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i + 1 < pos.count; i++) segments.push(pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
    }
  });
  const out = new THREE.Group();
  out.name = 'landmarks';
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  if (segments.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    out.add(new THREE.LineSegments(lg, cableMat));
  }
  return out;
}
