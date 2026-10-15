import * as THREE from 'three';
import { type Airport, runwayPoint } from './airports';
import { mulberry32 } from './terrain';
import { mergeChildMeshes } from '../view/merge';

const DEG = Math.PI / 180;
/** PAPI light thresholds from the runway side outward (inner lights turn red first). */
const PAPI_ANGLES = [3.5, 3.17, 2.83, 2.5].map((d) => d * DEG);
const PAPI_DIST = 300;
const WHITE = new THREE.Color(1, 1, 1);
const papiHousing = new THREE.MeshLambertMaterial({ color: 0x333333 });
const RED = new THREE.Color(1, 0.12, 0.1);

function runwayTexture(a: Airport, maxAnisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 4096;
  const mPerPxV = a.length / H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3b3d40';
  ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(7);
  for (let i = 0; i < 9000; i++) {
    const g = 50 + rand() * 30;
    ctx.fillStyle = `rgb(${g},${g},${g + 3})`;
    ctx.fillRect(rand() * W, rand() * H, 2, 3);
  }
  ctx.fillStyle = '#e9e9e2';
  ctx.fillRect(6, 0, 5, H);
  ctx.fillRect(W - 11, 0, 5, H);
  const vy = (m: number) => m / mPerPxV;
  for (let y = vy(120); y < H - vy(120); y += vy(50)) ctx.fillRect(W / 2 - 3, y, 6, vy(30));
  // aiming point markers 300 m from each threshold
  const aim = (y: number) => {
    ctx.fillRect(W / 2 - 75, y, 40, vy(45));
    ctx.fillRect(W / 2 + 35, y, 40, vy(45));
  };
  const drawEnd = (label: string) => {
    for (let i = 0; i < 8; i++) {
      const x = 22 + i * 27 + (i >= 4 ? 8 : 0);
      ctx.fillRect(x, vy(6), 14, vy(30));
    }
    ctx.save();
    ctx.translate(W / 2, vy(48));
    ctx.rotate(Math.PI);
    // numbers ~18 m long whatever the canvas aspect
    ctx.scale(1, 18 / (120 * mPerPxV));
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, 0);
    ctx.restore();
    aim(vy(PAPI_DIST - 22));
  };
  // canvas top = the far end when landing on runway A = threshold of runway B
  drawEnd(a.labelB);
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  drawEnd(a.labelA);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Pulls geometry slightly toward the camera in view space. Depth precision far away is only a few
 * metres, so lights and markings lying on the ground would otherwise vanish into the terrain.
 */
function pullTowardCamera<T extends THREE.Material>(mat: T, factor: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      gl_Position = projectionMatrix * vec4(mvPosition.xyz * ${factor.toFixed(4)}, 1.0);`,
    );
  };
  return mat;
}

function pointsMaterial(size: number): THREE.PointsMaterial {
  return pullTowardCamera(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, toneMapped: false }), 0.985);
}

interface Papi {
  points: THREE.Points;
  colors: THREE.BufferAttribute;
  base: THREE.Vector3;
  /** direction pilots fly when approaching this end */
  dir: THREE.Vector3;
}

/** One airfield: runway, markings, edge lights, PAPI, windsock and (optionally) buildings. */
export class Airfield {
  readonly group = new THREE.Group();
  private readonly edgeLights: THREE.Points;
  private readonly papis: Papi[] = [];
  private readonly sock: THREE.Object3D;

  constructor(
    readonly airport: Airport,
    maxAnisotropy: number,
  ) {
    const a = airport;
    const y = a.center.y;
    this.group.name = `airfield-${a.id}`;

    const geo = new THREE.PlaneGeometry(a.width, a.length);
    geo.rotateX(-Math.PI / 2);
    const runway = new THREE.Mesh(
      geo,
      pullTowardCamera(new THREE.MeshLambertMaterial({ map: runwayTexture(a, maxAnisotropy), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.998),
    );
    runway.position.set(a.center.x, y + 0.03, a.center.z);
    runway.rotation.y = -a.heading * DEG;
    runway.receiveShadow = true;
    this.group.add(runway);

    // edge lights (white), thresholds (green) and runway ends (red) – visible at dusk and night
    const pos: number[] = [];
    const col: number[] = [];
    const p = new THREE.Vector3();
    const push = (along: number, lateral: number, c: THREE.Color) => {
      runwayPoint(a, along, lateral, 0.4, p);
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    };
    for (let s = -a.length / 2; s <= a.length / 2 + 1; s += 60) {
      push(s, -a.width / 2 - 2, WHITE);
      push(s, a.width / 2 + 2, WHITE);
    }
    const green = new THREE.Color(0.2, 1, 0.35);
    for (let l = -a.width / 2; l <= a.width / 2; l += 5) {
      push(-a.length / 2 - 1, l, green);
      push(a.length / 2 + 1, l, green);
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lgeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.edgeLights = new THREE.Points(lgeo, pointsMaterial(3));
    this.edgeLights.visible = false;
    this.group.add(this.edgeLights);

    // PAPI left of each threshold
    for (const end of [1, -1]) {
      const dir = a.f.clone().multiplyScalar(end);
      const along = end * (-a.length / 2 + PAPI_DIST);
      const ppos: number[] = [];
      for (let i = 0; i < 4; i++) {
        const lateral = -end * (a.width / 2 + 15 + i * 9);
        runwayPoint(a, along, lateral, 1, p);
        ppos.push(p.x, p.y, p.z);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
      const colors = new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3);
      pg.setAttribute('color', colors);
      const points = new THREE.Points(pg, pointsMaterial(6));
      points.frustumCulled = false;
      this.group.add(points);
      this.papis.push({ points, colors, base: runwayPoint(a, along, 0, 1), dir });
      // small housings for daytime look
      for (let i = 0; i < 4; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.6), papiHousing);
        box.position.set(ppos[i * 3], y + 0.4, ppos[i * 3 + 2]);
        box.rotation.y = -a.heading * DEG;
        this.group.add(box);
      }
    }

    // windsock next to the runway A threshold
    const sockBase = runwayPoint(a, -a.length / 2 + 180, -a.width / 2 - 40);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.copy(sockBase).setY(y + 3);
    this.group.add(pole);
    this.sock = new THREE.Group();
    this.sock.position.copy(sockBase).setY(y + 5.8);
    // cone along +X from the pole: wide end at the pole
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 3.5, 8, 1, true).rotateZ(-Math.PI / 2).translate(1.75, 0, 0),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }),
    );
    this.sock.add(cone);
    this.group.add(this.sock);

    if (a.buildings) this.addBuildings();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== runway) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    mergeChildMeshes(this.group);
  }

  private addBuildings(): void {
    const a = this.airport;
    const y = a.center.y;
    const at = (along: number, lateral: number) => runwayPoint(a, along, lateral);
    const apronMat = new THREE.MeshLambertMaterial({ color: 0x55585a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const plane = (w: number, d: number, along: number, lateral: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), apronMat);
      m.position.copy(at(along, lateral)).setY(y + 0.02);
      m.rotation.y = -a.heading * DEG;
      this.group.add(m);
    };
    plane(90, 14, -250, 60);
    plane(80, 120, -250, 140);

    const hangarMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0, flatShading: true });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b32, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const pos = at(-190 - i * 40, 200);
      const h = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 26), hangarMat);
      h.position.copy(pos).setY(y + 5);
      h.rotation.y = -a.heading * DEG;
      this.group.add(h);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 30, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), roofMat);
      roof.position.copy(pos).setY(y + 10);
      roof.rotation.y = -a.heading * DEG;
      roof.scale.set(1, 0.4, 1);
      this.group.add(roof);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), hangarMat);
    tower.position.copy(at(-330, 170)).setY(y + 9);
    this.group.add(tower);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 9), new THREE.MeshLambertMaterial({ color: 0x2b3f55, emissive: 0x000000 }));
    cab.position.copy(at(-330, 170)).setY(y + 20);
    this.group.add(cab);
  }

  setNight(on: boolean): void {
    this.edgeLights.visible = on;
  }

  /** Updates PAPI colours for the viewer and orients the windsock. */
  update(viewer: THREE.Vector3, wind: THREE.Vector3): void {
    for (const papi of this.papis) {
      const dx = viewer.x - papi.base.x;
      const dz = viewer.z - papi.base.z;
      // distance before the PAPI along the approach direction
      const d = -(dx * papi.dir.x + dz * papi.dir.z);
      const angle = Math.atan2(viewer.y - papi.base.y, Math.max(d, 1));
      for (let i = 0; i < 4; i++) {
        const c = angle > PAPI_ANGLES[i] ? WHITE : RED;
        papi.colors.setXYZ(i, c.r, c.g, c.b);
      }
      papi.colors.needsUpdate = true;
      papi.points.visible = d > 0;
    }
    const speed = Math.hypot(wind.x, wind.z);
    // sock points downwind and lifts with wind speed (full at ~15 kt)
    this.sock.rotation.set(0, Math.atan2(-wind.z, wind.x), -Math.PI / 2 + Math.min(1, speed / 7.7) * (Math.PI / 2 - 0.05));
  }
}

export function createAirfields(airports: Airport[], maxAnisotropy: number): Airfield[] {
  return airports.map((a) => new Airfield(a, maxAnisotropy));
}
