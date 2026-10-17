import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runwayLocal } from './airports';
import { mulberry32, noiseD } from './noise';
import { scenario } from './scenario';
import { terrainHeight } from './terrain';

const TILE = 1500;
/** tiles around the aircraft tile with full trees; the next ring gets low-poly ones */
const RADIUS = 1;
const FAR = 2;
const MAX_PER_TILE = 4500;

function coloured(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // untextured: drop uvs so every part has the same attributes for merging
  geo.deleteAttribute('uv');
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Spruce: three stacked cones on a trunk, 1 unit ≈ 1 m, base at y = 0. */
function conifer(): THREE.BufferGeometry {
  return mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.25, 0.35, 3, 5, 1, true).translate(0, 1.5, 0), 0x4a3828),
    coloured(new THREE.ConeGeometry(3.3, 6.5, 9, 1, true).translate(0, 5.2, 0), 0x2d4d2c),
    coloured(new THREE.ConeGeometry(2.6, 5.5, 9, 1, true).rotateY(0.35).translate(0, 8.4, 0), 0x31532f),
    coloured(new THREE.ConeGeometry(1.7, 4.5, 8, 1, true).rotateY(0.7).translate(0, 11.4, 0), 0x355b33),
  ])!;
}

/** A lumpy leaf clump: a subdivided icosahedron with its surface pushed in and out. */
function clump(radius: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  const p = m.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.16 * Math.sin(v.x * 1.7 + seed) * Math.sin(v.y * 1.9 + seed * 2.1) * Math.sin(v.z * 1.5 + seed * 0.7);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  m.computeVertexNormals();
  return m;
}

/** Broadleaf: a crown of three clumps on a trunk. */
function broadleaf(): THREE.BufferGeometry {
  const main = clump(3.4, 1).scale(1, 0.85, 1).translate(0, 7.6, 0);
  const side = clump(2.2, 2, 0).translate(1.9, 6.4, 0.6);
  const top = clump(2.0, 3, 0).translate(-0.9, 9.3, -0.7);
  return mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.3, 0.45, 5, 5, 1, true).translate(0, 2.5, 0), 0x4f3b2a),
    coloured(main, 0x4b7a34),
    coloured(side, 0x47733a),
    coloured(top, 0x52833a),
  ])!;
}

/** Distant trees: a single cone or blob with the same silhouette, a tenth of the triangles. */
function coniferFar(): THREE.BufferGeometry {
  return mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.3, 0.35, 3, 3, 1, true).translate(0, 1.5, 0), 0x4a3828),
    coloured(new THREE.ConeGeometry(3.2, 11.5, 6, 1, true).translate(0, 8, 0), 0x31532f),
  ])!;
}

function broadleafFar(): THREE.BufferGeometry {
  const crown = new THREE.IcosahedronGeometry(3.6, 0).scale(1.05, 1.1, 1.05).translate(0, 7.9, 0);
  crown.deleteAttribute('normal');
  crown.computeVertexNormals();
  return mergeGeometries([
    coloured(new THREE.CylinderGeometry(0.3, 0.45, 5, 3, 1, true).translate(0, 2.5, 0), 0x4f3b2a),
    coloured(crown, 0x4b7a34),
  ])!;
}

const GEOS = { conifer: conifer(), broadleaf: broadleaf() };
const FAR_GEOS = { conifer: coniferFar(), broadleaf: broadleafFar() };
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
// the new engine shades these as foliage (rounded crowns, wind, translucency)
material.userData.foliage = true;

interface Tile {
  meshes: THREE.InstancedMesh[];
  far: boolean;
}

/** Instanced forests in the tiles around the aircraft, placed by the scenario's rules. */
export class Forest {
  readonly group = new THREE.Group();
  private readonly tiles = new Map<string, Tile>();
  private centre = '';
  private queue: [number, number][] = [];
  /** tile being placed, a few hundred trees per slice */
  private pending: { key: string; work: Generator<undefined, Tile> } | null = null;
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
    this.pending = null;
  }

  update(x: number, z: number, budgetMs = 3): void {
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    const key = `${tx},${tz}`;
    if (key !== this.centre) {
      this.centre = key;
      const wanted = new Set<string>();
      this.queue = [];
      for (let dz = -FAR; dz <= FAR; dz++)
        for (let dx = -FAR; dx <= FAR; dx++) {
          const k = `${tx + dx},${tz + dz}`;
          wanted.add(k);
          if (!this.tiles.has(k) && this.pending?.key !== k) this.queue.push([tx + dx, tz + dz]);
        }
      this.queue.sort((a, b) => Math.hypot(a[0] - tx, a[1] - tz) - Math.hypot(b[0] - tx, b[1] - tz));
      for (const [k, t] of this.tiles) {
        if (!wanted.has(k)) {
          for (const m of t.meshes) this.group.remove(m);
          this.tiles.delete(k);
          continue;
        }
        const [kx, kz] = k.split(',').map(Number);
        this.setFar(t, Math.max(Math.abs(kx - tx), Math.abs(kz - tz)) > RADIUS);
      }
      if (this.pending && !wanted.has(this.pending.key)) this.pending = null;
    }
    const start = performance.now();
    while (budgetMs === Infinity || performance.now() - start < budgetMs) {
      if (!this.pending) {
        const next = this.queue.shift();
        if (!next) break;
        this.pending = { key: `${next[0]},${next[1]}`, work: this.build(next[0], next[1]) };
      }
      const r = this.pending.work.next();
      if (r.done) {
        const [kx, kz] = this.pending.key.split(',').map(Number);
        this.setFar(r.value, Math.max(Math.abs(kx - tx), Math.abs(kz - tz)) > RADIUS);
        for (const m of r.value.meshes) this.group.add(m);
        this.tiles.set(this.pending.key, r.value);
        this.pending = null;
      }
    }
    for (const t of this.tiles.values()) for (const m of t.meshes) m.count = Math.floor((m.userData.full as number) * this.density * (t.far ? 0.7 : 1));
  }

  private setFar(t: Tile, far: boolean): void {
    t.far = far;
    for (const m of t.meshes) {
      const kind = m.userData.kind as keyof typeof GEOS;
      m.geometry = far ? FAR_GEOS[kind] : GEOS[kind];
      // distant trees only receive shadows: their own would be below the shadow map's resolution
      m.castShadow = !far;
    }
  }

  private *build(cx: number, cz: number): Generator<undefined, Tile> {
    const s = scenario();
    const rules = s.trees;
    const meshes: THREE.InstancedMesh[] = [];
    if (!rules) return { meshes, far: false };
    const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x5f3759df);
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const kinds = [
      { kind: 'conifer' as const, list: [] as THREE.Matrix4[], cols: [] as THREE.Color[] },
      { kind: 'broadleaf' as const, list: [] as THREE.Matrix4[], cols: [] as THREE.Color[] },
    ];
    for (let tries = 0; tries < MAX_PER_TILE * 2.5 && kinds[0].list.length + kinds[1].list.length < MAX_PER_TILE; tries++) {
      if (tries % 400 === 399) yield;
      const x = (cx + rand()) * TILE;
      const z = (cz + rand()) * TILE;
      const pick = rand();
      if (!rules.density) {
        // forests come in patches
        const patch = noiseD(x * 0.0011 + 5.3, z * 0.0011 - 1.7) + noiseD(x * 0.004, z * 0.004) * 0.35;
        if (patch < -0.05) continue;
      }
      if (s.airports.some((a) => {
        const l = runwayLocal(a, x, z);
        return Math.abs(l.lateral) < a.width / 2 + 120 && Math.abs(l.along) < a.length / 2 + 350;
      })) continue;
      const h = terrainHeight(x, z);
      const dx = terrainHeight(x + 8, z) - h;
      const dz = terrainHeight(x, z + 8) - h;
      const slope = Math.abs(dx) + Math.abs(dz);
      if (!rules.ok(x, z, h, slope)) continue;
      if (rules.density && pick > rules.density(x, z, h, 8 / Math.hypot(dx, 8, dz))) continue;
      // conifers take over with altitude
      const k = rand() < THREE.MathUtils.smoothstep(h, 60, 260) * 0.8 + 0.2 ? 0 : 1;
      const size = 0.7 + rand() * 0.8;
      p.set(x, h - 0.4 - slope * 0.1, z);
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      sc.set(size, size * (0.85 + rand() * 0.4), size);
      kinds[k].list.push(new THREE.Matrix4().compose(p, q, sc));
      kinds[k].cols.push(col.setHSL(0.24 + rand() * 0.08, 0.35 + rand() * 0.2, 0.75 + rand() * 0.3).clone());
    }
    for (const kind of kinds) {
      if (!kind.list.length) continue;
      const mesh = new THREE.InstancedMesh(GEOS[kind.kind], material, kind.list.length);
      kind.list.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        mesh.setColorAt(i, kind.cols[i]);
      });
      mesh.userData.full = kind.list.length;
      mesh.userData.kind = kind.kind;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }
    return { meshes, far: false };
  }
}
