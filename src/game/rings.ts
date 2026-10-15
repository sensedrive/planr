import * as THREE from 'three';
import { HOME, runwayPoint } from '../world/airports';
import { mulberry32 } from '../world/noise';
import { terrainHeight } from '../world/terrain';

const RADIUS = 22;
const COUNT = 10;

export interface Ring {
  center: THREE.Vector3;
  /** direction you fly through it */
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
}

function maxGround(a: THREE.Vector3, b: THREE.Vector3): number {
  let m = -Infinity;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    m = Math.max(m, terrainHeight(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
  }
  return Math.max(m, 0);
}

/** Generates a deterministic ring course that follows valleys north of the home field. */
export function buildCourse(): { start: THREE.Vector3; heading: number; rings: THREE.Vector3[] } {
  const rand = mulberry32(2024);
  const start = runwayPoint(HOME, HOME.length / 2 + 1500, 0);
  let heading = HOME.heading;
  start.y = Math.max(terrainHeight(start.x, start.z), 0) + 220;
  let prev = start.clone();
  const rings: THREE.Vector3[] = [];
  for (let i = 0; i < COUNT; i++) {
    let best: { p: THREE.Vector3; h: number; score: number } | null = null;
    for (const off of [-55, -30, -12, 0, 12, 30, 55]) {
      const h = heading + off + (rand() - 0.5) * 6;
      const r = (h * Math.PI) / 180;
      const dist = i === 0 ? 900 : 850;
      const p = new THREE.Vector3(prev.x + Math.sin(r) * dist, 0, prev.z - Math.cos(r) * dist);
      const ground = Math.max(terrainHeight(p.x, p.z), 0);
      // prefer low ground (valleys) but not sharp turns
      const score = -ground - Math.abs(off) * 1.5;
      if (!best || score > best.score) best = { p, h, score };
    }
    const p = best!.p;
    const ground = Math.max(terrainHeight(p.x, p.z), 0);
    p.y = Math.max(ground + 70, maxGround(prev, p) + 45);
    // keep climbs flyable
    p.y = Math.min(p.y, prev.y + 140);
    p.y = Math.max(p.y, ground + 40);
    rings.push(p);
    heading = best!.h;
    prev = p;
  }
  return { start, heading: HOME.heading, rings };
}

const ringGeo = new THREE.TorusGeometry(RADIUS, 1.4, 8, 32);
const nextMat = new THREE.MeshLambertMaterial({ color: 0xff8a1a, emissive: 0x803000 });
const laterMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x404040, transparent: true, opacity: 0.6 });

/** Ring course state: which ring is next and pass detection between physics frames. */
export class RingCourse {
  readonly group = new THREE.Group();
  readonly rings: Ring[] = [];
  next = 0;
  readonly start: THREE.Vector3;
  readonly heading: number;

  constructor() {
    const course = buildCourse();
    this.start = course.start;
    this.heading = course.heading;
    let prev = course.start;
    for (const c of course.rings) {
      const normal = c.clone().sub(prev).setY(0).normalize();
      const mesh = new THREE.Mesh(ringGeo, laterMat);
      mesh.position.copy(c);
      mesh.lookAt(c.clone().add(normal));
      this.group.add(mesh);
      this.rings.push({ center: c, normal, mesh });
      prev = c;
    }
    this.group.visible = false;
    this.reset();
  }

  reset(): void {
    this.next = 0;
    this.refresh();
  }

  get done(): boolean {
    return this.next >= this.rings.length;
  }

  get target(): THREE.Vector3 | null {
    return this.done ? null : this.rings[this.next].center;
  }

  private refresh(): void {
    this.rings.forEach((r, i) => {
      r.mesh.visible = i >= this.next;
      r.mesh.material = i === this.next ? nextMat : laterMat;
    });
  }

  /** Returns true if the segment a→b flew through the next ring. */
  check(a: THREE.Vector3, b: THREE.Vector3): boolean {
    if (this.done) return false;
    const r = this.rings[this.next];
    const da = a.clone().sub(r.center).dot(r.normal);
    const db = b.clone().sub(r.center).dot(r.normal);
    if (!(da < 0 && db >= 0)) return false;
    const t = da / (da - db);
    const hit = a.clone().lerp(b, t);
    if (hit.distanceTo(r.center) > RADIUS) return false;
    this.next++;
    this.refresh();
    return true;
  }
}
