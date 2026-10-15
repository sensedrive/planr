import * as THREE from 'three';
import { mulberry32 } from './noise';

interface Building {
  /** footprint x,z pairs (local metres) */
  pts: Float32Array;
  base: number;
  roof: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
}

const TILE = 1000;
const COLL_CELL = 50;
const NEAR = 1700; // full detail within this distance
const FAR = 5200; // tall buildings only up to here
const TALL = 45;

const FACADES = [0xd8d2c4, 0xb9b2a4, 0x9a8a7a, 0x8c5a48, 0x7a8790, 0x5f6e7a, 0xc9c5bd, 0x6d6a66].map((c) => new THREE.Color(c));

function windowTextures(): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const S = 256;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const base = make();
  const g = base.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const lit = make();
  const l = lit.getContext('2d')!;
  l.fillStyle = '#000000';
  l.fillRect(0, 0, S, S);
  const rand = mulberry32(5);
  // 4 × 4 windows per texture tile (one tile = 16 m × 14.4 m of facade), solid band at the edges for roofs
  const cell = S / 4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const x = i * cell + cell * 0.18;
      const y = j * cell + cell * 0.2;
      const w = cell * 0.64;
      const h = cell * 0.55;
      g.fillStyle = '#5a6672';
      g.fillRect(x, y, w, h);
      if (rand() < 0.45) {
        l.fillStyle = rand() < 0.7 ? '#ffd79a' : '#cfe4ff';
        l.fillRect(x, y, w, h);
      }
    }
  }
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(base, true), lit: tex(lit, true) };
}

/** Footprint-extruded buildings in 1 km tiles with two detail levels, plus roof/wall collision. */
export class City {
  readonly group = new THREE.Group();
  private readonly buildings: Building[] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly tiles = new Map<string, { near: THREE.Mesh | null; far: THREE.Mesh | null; ids: number[] }>();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly queue: { key: string; level: 'near' | 'far' }[] = [];

  constructor(buf: ArrayBuffer, ground: (x: number, z: number) => number) {
    this.group.name = 'city';
    const tex = windowTextures();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.map, emissiveMap: tex.lit, emissive: 0x000000, flatShading: true });

    const v = new DataView(buf);
    const n = v.getUint32(0, true);
    let o = 4;
    for (let b = 0; b < n; b++) {
      const count = v.getUint16(o, true);
      const roofH = v.getInt16(o + 2, true) / 10;
      o += 6;
      const pts = new Float32Array(count * 2);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let cx = 0;
      let cz = 0;
      let lowest = Infinity;
      for (let i = 0; i < count; i++) {
        const x = v.getInt16(o, true) / 2;
        const z = v.getInt16(o + 2, true) / 2;
        o += 4;
        pts[i * 2] = x;
        pts[i * 2 + 1] = z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        cx += x;
        cz += z;
        lowest = Math.min(lowest, ground(x, z));
      }
      cx /= count;
      cz /= count;
      const centre = ground(cx, cz);
      const base = Math.max(-3, Math.min(lowest, centre) - 1);
      this.buildings.push({ pts, base, roof: Math.max(centre, 0.5) + Math.max(roofH, 3), minX, maxX, minZ, maxZ, cx, cz });
    }
    this.buildings.forEach((b, id) => {
      for (let cz = Math.floor(b.minZ / COLL_CELL); cz <= Math.floor(b.maxZ / COLL_CELL); cz++) {
        for (let cx = Math.floor(b.minX / COLL_CELL); cx <= Math.floor(b.maxX / COLL_CELL); cx++) {
          const k = cellKey(cx, cz);
          const list = this.cells.get(k);
          if (list) list.push(id);
          else this.cells.set(k, [id]);
        }
      }
      const key = `${Math.floor(b.cx / TILE)},${Math.floor(b.cz / TILE)}`;
      const t = this.tiles.get(key);
      if (t) t.ids.push(id);
      else this.tiles.set(key, { near: null, far: null, ids: [id] });
    });
  }

  get count(): number {
    return this.buildings.length;
  }

  /** Highest roof covering (x, z), or -Infinity. */
  roofAt(x: number, z: number): number {
    const list = this.cells.get(cellKey(Math.floor(x / COLL_CELL), Math.floor(z / COLL_CELL)));
    if (!list) return -Infinity;
    let top = -Infinity;
    for (const id of list) {
      const b = this.buildings[id];
      if (b.roof <= top || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (inside(b.pts, x, z)) top = b.roof;
    }
    return top;
  }

  setLights(level: number): void {
    this.material.emissive.setScalar(level);
  }

  /** Shows tiles by distance and builds missing meshes within a time budget. */
  update(x: number, z: number, budgetMs = 3, far = FAR): void {
    for (const [key, t] of this.tiles) {
      const [tx, tz] = key.split(',').map(Number);
      const dx = Math.max(0, Math.abs(x - (tx + 0.5) * TILE) - TILE / 2);
      const dz = Math.max(0, Math.abs(z - (tz + 0.5) * TILE) - TILE / 2);
      const d = Math.hypot(dx, dz);
      const wantNear = d < NEAR;
      const wantFar = !wantNear && d < far;
      if (wantNear && !t.near && !this.queue.some((q) => q.key === key && q.level === 'near')) this.queue.push({ key, level: 'near' });
      if (wantFar && !t.far && !this.queue.some((q) => q.key === key && q.level === 'far')) this.queue.push({ key, level: 'far' });
      if (t.near) t.near.visible = wantNear || (wantFar && !t.far);
      if (t.far) t.far.visible = wantFar;
      // free memory far away
      if (d > far + 2000) {
        for (const lvl of ['near', 'far'] as const) {
          const m = t[lvl];
          if (m) {
            this.group.remove(m);
            m.geometry.dispose();
            t[lvl] = null;
          }
        }
      }
    }
    const start = performance.now();
    while (this.queue.length && (budgetMs === Infinity || performance.now() - start < budgetMs)) {
      const job = this.queue.shift()!;
      const t = this.tiles.get(job.key)!;
      if (t[job.level]) continue;
      const ids = job.level === 'near' ? t.ids : t.ids.filter((id) => this.buildings[id].roof - this.buildings[id].base > TALL);
      const mesh = new THREE.Mesh(this.geometry(ids), this.material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      t[job.level] = mesh;
    }
  }

  private geometry(ids: number[]): THREE.BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    const contour: THREE.Vector2[] = [];
    for (const id of ids) {
      const b = this.buildings[id];
      const n = b.pts.length / 2;
      c.copy(FACADES[id % FACADES.length]).multiplyScalar(0.85 + ((id * 7919) % 100) / 650);
      // walls
      let perim = 0;
      for (let i = 0; i < n; i++) {
        const ax = b.pts[i * 2];
        const az = b.pts[i * 2 + 1];
        const bx = b.pts[((i + 1) % n) * 2];
        const bz = b.pts[((i + 1) % n) * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        // outward if the edge normal points away from the centroid
        const nx = bz - az;
        const nz = -(bx - ax);
        const out = nx * ((ax + bx) / 2 - b.cx) + nz * ((az + bz) / 2 - b.cz) > 0;
        const v0 = pos.length / 3;
        pos.push(ax, b.base, az, bx, b.base, bz, bx, b.roof, bz, ax, b.roof, az);
        const u0 = perim / 4;
        const u1 = (perim + len) / 4;
        const vTop = (b.roof - b.base) / 3.6;
        uv.push(u0, 0, u1, 0, u1, vTop, u0, vTop);
        for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
        if (out) idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
        else idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        perim += len;
      }
      // roof
      contour.length = 0;
      for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(b.pts[i * 2], b.pts[i * 2 + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const r0 = pos.length / 3;
      for (let i = 0; i < n; i++) {
        pos.push(b.pts[i * 2], b.roof, b.pts[i * 2 + 1]);
        uv.push(0.02, 0.02);
        col.push(c.r * 0.8, c.g * 0.8, c.b * 0.8);
      }
      for (const [a, bb, cc] of tris) {
        const ax = contour[a].x;
        const az = contour[a].y;
        const cross = (contour[bb].x - ax) * (contour[cc].y - az) - (contour[bb].y - az) * (contour[cc].x - ax);
        // up-facing in our x/z (z south) frame needs a negative cross product
        if (cross < 0) idx.push(r0 + a, r0 + bb, r0 + cc);
        else idx.push(r0 + a, r0 + cc, r0 + bb);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

function cellKey(cx: number, cz: number): number {
  return (cx + 4096) * 8192 + (cz + 4096);
}

function inside(pts: Float32Array, x: number, z: number): boolean {
  let c = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2];
    const zi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const zj = pts[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
