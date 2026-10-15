import * as THREE from 'three';
import { runwayLocal } from './airports';
import { scenario } from './scenario';

export { mulberry32 } from './noise';

const CHUNK_SIZE = 1500;
/** Grid spacing of the finest terrain LOD; collision uses exactly this surface. */
const FINE_SEGS = 64;
const FINE_STEP = CHUNK_SIZE / FINE_SEGS;

/** Analytic ground height in metres for the active scenario; negative values are under water (sea level = 0). */
export function terrainHeight(x: number, z: number): number {
  const s = scenario();
  let h = s.rawHeight(x, z);
  // flatten the airfields
  for (const a of s.airports) {
    const p = runwayLocal(a, x, z);
    const f = a.flatten;
    const dl = Math.max(0, Math.abs(p.lateral) - (a.width / 2 + f.lateral));
    const da = Math.max(0, Math.abs(p.along) - (a.length / 2 + f.along));
    const d = Math.hypot(dl, da);
    if (d >= f.blend) continue;
    const t = THREE.MathUtils.smoothstep(d, 0, f.blend);
    h = a.center.y + (h - a.center.y) * t;
  }
  // steeper underwater slopes keep shorelines crisp
  if (h < 0) h = h * 2.5 - 1.5;
  return h;
}

/**
 * Solid surface for physics: the rendered (finest LOD) terrain triangles – same grid and diagonal as
 * buildChunkGeometry – plus obstacles such as building roofs.
 */
export function surfaceHeight(x: number, z: number): number {
  const gx = x / FINE_STEP;
  const gz = z / FINE_STEP;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const x0 = i * FINE_STEP;
  const z0 = j * FINE_STEP;
  const hb = terrainHeight(x0 + FINE_STEP, z0);
  const hc = terrainHeight(x0, z0 + FINE_STEP);
  let h: number;
  if (fx + fz <= 1) {
    const ha = terrainHeight(x0, z0);
    h = ha + (hb - ha) * fx + (hc - ha) * fz;
  } else {
    const hd = terrainHeight(x0 + FINE_STEP, z0 + FINE_STEP);
    h = hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }
  const obstacle = scenario().obstacleHeight;
  return obstacle ? Math.max(h, obstacle(x, z)) : h;
}

const tmpC = new THREE.Color();

/** Builds one terrain chunk with a downward skirt that hides LOD cracks. */
function buildChunkGeometry(x0: number, z0: number, size: number, segs: number): THREE.BufferGeometry {
  const n = segs + 1;
  const step = size / segs;
  // heights with a one-sample border for normals
  const g = n + 2;
  const heights = new Float32Array(g * g);
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) heights[j * g + i] = terrainHeight(x0 + (i - 1) * step, z0 + (j - 1) * step);
  }
  const H = (i: number, j: number) => heights[(j + 1) * g + (i + 1)];

  const skirtVerts = 4 * n;
  const count = n * n + skirtVerts;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const normal = new THREE.Vector3();

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const h = H(i, j);
      pos[k * 3] = i * step;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = j * step;
      normal.set(H(i - 1, j) - H(i + 1, j), 2 * step, H(i, j - 1) - H(i, j + 1)).normalize();
      nor[k * 3] = normal.x;
      nor[k * 3 + 1] = normal.y;
      nor[k * 3 + 2] = normal.z;
      scenario().color(x0 + i * step, z0 + j * step, h, normal.y, tmpC);
      col[k * 3] = tmpC.r;
      col[k * 3 + 1] = tmpC.g;
      col[k * 3 + 2] = tmpC.b;
    }
  }

  const index: number[] = [];
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  // skirt: duplicate each border ring vertex lowered by `drop`
  const drop = step * 1.5 + 15;
  const edges: number[][] = [[], [], [], []];
  for (let t = 0; t < n; t++) {
    edges[0].push(t); // z = 0
    edges[1].push(segs * n + t); // z = size
    edges[2].push(t * n); // x = 0
    edges[3].push(t * n + segs); // x = size
  }
  let v = n * n;
  for (const edge of edges) {
    const start = v;
    for (const src of edge) {
      pos[v * 3] = pos[src * 3];
      pos[v * 3 + 1] = pos[src * 3 + 1] - drop;
      pos[v * 3 + 2] = pos[src * 3 + 2];
      for (let q = 0; q < 3; q++) {
        nor[v * 3 + q] = nor[src * 3 + q];
        col[v * 3 + q] = col[src * 3 + q];
      }
      v++;
    }
    for (let t = 0; t < segs; t++) {
      const a = edge[t];
      const b = edge[t + 1];
      const a2 = start + t;
      const b2 = start + t + 1;
      // both windings so the skirt is visible from either side
      index.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

interface Chunk {
  mesh: THREE.Mesh;
  segs: number;
}

const RADIUS = 3;

function segsForRing(ring: number): number {
  return ring <= 1 ? FINE_SEGS : ring === 2 ? 32 : 16;
}

/** Streams terrain chunks around the aircraft with distance-based detail. */
export class Terrain {
  readonly group = new THREE.Group();
  private readonly chunks = new Map<string, Chunk>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private centerKey = '';
  private queue: { cx: number; cz: number; segs: number; dist: number }[] = [];

  constructor() {
    this.group.name = 'terrain';
  }

  /** Drops all chunks, e.g. after switching the scenario. */
  reset(): void {
    for (const c of this.chunks.values()) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.queue = [];
    this.centerKey = '';
  }

  /** Call every frame; builds chunks within a small time budget. */
  update(x: number, z: number, budgetMs = 4): void {
    const ccx = Math.floor(x / CHUNK_SIZE);
    const ccz = Math.floor(z / CHUNK_SIZE);
    const key = `${ccx},${ccz}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.plan(ccx, ccz);
    }
    const start = performance.now();
    while (this.queue.length > 0 && (budgetMs === Infinity || performance.now() - start < budgetMs)) {
      const job = this.queue.shift()!;
      this.build(job.cx, job.cz, job.segs);
    }
  }

  private plan(ccx: number, ccz: number): void {
    const wanted = new Set<string>();
    this.queue = [];
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const k = `${cx},${cz}`;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const segs = segsForRing(ring);
        wanted.add(k);
        if (this.chunks.get(k)?.segs !== segs) this.queue.push({ cx, cz, segs, dist: dx * dx + dz * dz });
      }
    }
    this.queue.sort((a, b) => a.dist - b.dist);
    for (const [k, chunk] of this.chunks) {
      if (!wanted.has(k)) {
        this.group.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(k);
      }
    }
  }

  private build(cx: number, cz: number, segs: number): void {
    const k = `${cx},${cz}`;
    const old = this.chunks.get(k);
    const geo = buildChunkGeometry(cx * CHUNK_SIZE, cz * CHUNK_SIZE, CHUNK_SIZE, segs);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    if (old) {
      this.group.remove(old.mesh);
      old.mesh.geometry.dispose();
    }
    this.chunks.set(k, { mesh, segs });
  }
}

/** Sea plane that follows the aircraft. */
export function createWater(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> {
  const geo = new THREE.PlaneGeometry(16000, 16000);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2f6f8f }));
  mesh.name = 'water';
  return mesh;
}
