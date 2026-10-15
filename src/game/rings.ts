import * as THREE from 'three';
import type { RingCourseDef } from '../world/scenario';

const RADIUS = 22;

export interface Ring {
  center: THREE.Vector3;
  /** direction you fly through it */
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
}

const ringGeo = new THREE.TorusGeometry(RADIUS, 1.4, 8, 32);
const nextMat = new THREE.MeshLambertMaterial({ color: 0xff8a1a, emissive: 0x803000 });
const laterMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x404040, transparent: true, opacity: 0.6 });

/** Ring course state: which ring is next and pass detection between frames. */
export class RingCourse {
  readonly group = new THREE.Group();
  readonly rings: Ring[] = [];
  next = 0;
  start = new THREE.Vector3();
  heading = 0;

  constructor() {
    this.group.visible = false;
  }

  /** Replaces the course (e.g. after switching the scenario). */
  load(def: RingCourseDef): void {
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings.length = 0;
    this.start.copy(def.start);
    this.heading = def.heading;
    let prev = def.start;
    for (const c of def.rings) {
      const normal = c.clone().sub(prev).setY(0).normalize();
      const mesh = new THREE.Mesh(ringGeo, laterMat);
      mesh.position.copy(c);
      mesh.lookAt(c.clone().add(normal));
      this.group.add(mesh);
      this.rings.push({ center: c.clone(), normal, mesh });
      prev = c;
    }
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
