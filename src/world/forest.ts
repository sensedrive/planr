import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runwayLocal } from './airports';
import { mulberry32, noiseD } from './noise';
import { scenario } from './scenario';
import { terrainHeight } from './terrain';

const TILE = 1500;
const RADIUS = 1; // tiles around the aircraft tile
const MAX_PER_TILE = 900;

function coloured(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Spruce: two stacked cones on a trunk, 1 unit ≈ 1 m, base at y = 0. */
function conifer(): THREE.BufferGeometry {
  return mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.25, 0.35, 3, 4, 1, true).translate(0, 1.5, 0), 0x4a3828),
    coloured(new THREE.ConeGeometry(3.2, 8, 6, 1, true).translate(0, 6, 0), 0x2d4d2c),
    coloured(new THREE.ConeGeometry(2.3, 6, 6, 1, true).translate(0, 10.5, 0), 0x335a32),
  ])!;
}

/** Broadleaf: round crown on a trunk. */
function broadleaf(): THREE.BufferGeometry {
  const crown = new THREE.IcosahedronGeometry(3.6, 0);
  crown.scale(1, 0.85, 1).translate(0, 7.5, 0);
  return mergeGeometries([coloured(new THREE.CylinderGeometry(0.3, 0.45, 5, 4, 1, true).translate(0, 2.5, 0), 0x4f3b2a), coloured(crown, 0x4b7a34)])!;
}

const GEOS = { conifer: conifer(), broadleaf: broadleaf() };
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Tile {
  meshes: THREE.InstancedMesh[];
}

/** Instanced forests in the 3 × 3 terrain tiles around the aircraft, placed by the scenario's rules. */
export class Forest {
  readonly group = new THREE.Group();
  private readonly tiles = new Map<string, Tile>();
  private centre = '';
  private queue: [number, number][] = [];
  /** fraction of trees drawn (lower in VR) */
  density = 1;

  constructor() {
    this.group.name = 'forest';
  }

  reset(): void {
    for (const t of this.tiles.values()) for (const m of t.meshes) this.group.remove(m);
    this.tiles.clear();
    this.centre = '';
    this.queue = [];
  }

  update(x: number, z: number, budgetMs = 3): void {
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    const key = `${tx},${tz}`;
    if (key !== this.centre) {
      this.centre = key;
      const wanted = new Set<string>();
      this.queue = [];
      for (let dz = -RADIUS; dz <= RADIUS; dz++)
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const k = `${tx + dx},${tz + dz}`;
          wanted.add(k);
          if (!this.tiles.has(k)) this.queue.push([tx + dx, tz + dz]);
        }
      this.queue.sort((a, b) => Math.hypot(a[0] - tx, a[1] - tz) - Math.hypot(b[0] - tx, b[1] - tz));
      for (const [k, t] of this.tiles) {
        if (wanted.has(k)) continue;
        for (const m of t.meshes) this.group.remove(m);
        this.tiles.delete(k);
      }
    }
    const start = performance.now();
    while (this.queue.length && (budgetMs === Infinity || performance.now() - start < budgetMs)) {
      const [cx, cz] = this.queue.shift()!;
      this.tiles.set(`${cx},${cz}`, this.build(cx, cz));
    }
    for (const t of this.tiles.values()) for (const m of t.meshes) m.count = Math.floor((m.userData.full as number) * this.density);
  }

  private build(cx: number, cz: number): Tile {
    const s = scenario();
    const rules = s.trees;
    const meshes: THREE.InstancedMesh[] = [];
    if (!rules) return { meshes };
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5f3759df);
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    const kinds = [
      { geo: GEOS.conifer, list: [] as THREE.Matrix4[], cols: [] as THREE.Color[] },
      { geo: GEOS.broadleaf, list: [] as THREE.Matrix4[], cols: [] as THREE.Color[] },
    ];
    for (let tries = 0; tries < MAX_PER_TILE * 3 && kinds[0].list.length + kinds[1].list.length < MAX_PER_TILE; tries++) {
      const x = (cx + rand()) * TILE;
      const z = (cz + rand()) * TILE;
      // forests come in patches
      const patch = noiseD(x * 0.0011 + 5.3, z * 0.0011 - 1.7) + noiseD(x * 0.004, z * 0.004) * 0.35;
      if (patch < -0.05) continue;
      if (s.airports.some((a) => {
        const l = runwayLocal(a, x, z);
        return Math.abs(l.lateral) < a.width / 2 + 120 && Math.abs(l.along) < a.length / 2 + 350;
      })) continue;
      const h = terrainHeight(x, z);
      const slope = Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h);
      if (!rules.ok(x, z, h, slope)) continue;
      // conifers take over with altitude
      const k = rand() < THREE.MathUtils.smoothstep(h, 60, 260) * 0.8 + 0.2 ? 0 : 1;
      const size = 0.7 + rand() * 0.8;
      p.set(x, h - 0.4, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      sc.set(size, size * (0.85 + rand() * 0.4), size);
      kinds[k].list.push(new THREE.Matrix4().compose(p, q, sc));
      kinds[k].cols.push(col.setHSL(0.24 + rand() * 0.08, 0.35 + rand() * 0.2, 0.75 + rand() * 0.3).clone());
    }
    for (const kind of kinds) {
      if (!kind.list.length) continue;
      const mesh = new THREE.InstancedMesh(kind.geo, material, kind.list.length);
      kind.list.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        mesh.setColorAt(i, kind.cols[i]);
      });
      mesh.userData.full = kind.list.length;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return { meshes };
  }
}
