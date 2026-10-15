import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CockpitLayout } from './layout';
import { carpet, fabric, plastic, stripes } from './textures';

export interface Dims {
  cx: number;
  halfW: number;
  front: number;
  back: number;
  floorY: number;
  glareY: number;
  sillY: number;
}

const lambert = (map: THREE.Texture | null, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
const glassMat = new THREE.MeshPhongMaterial({
  color: 0x9fb7c8,
  transparent: true,
  opacity: 0.07,
  shininess: 120,
  specular: 0xffffff,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const metalDark = new THREE.MeshLambertMaterial({ color: 0x2a2b2e });
const chrome = new THREE.MeshPhongMaterial({ color: 0x9a9da3, shininess: 80, specular: 0xffffff });

function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.position.set(x, y, z);
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Quad of glass through four corners (a, b top; c, d bottom). */
function glass(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b, c, b, d, c]);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, glassMat);
  m.renderOrder = 5;
  return m;
}

function seat(g: THREE.Group, x: number, d: Dims, eyeZ: number, mat: THREE.Material, ejection: boolean): void {
  const seatY = d.floorY + 0.36;
  g.add(rbox(0.46, 0.1, 0.48, 0.04, mat, x, seatY, eyeZ + 0.33));
  const back = rbox(0.46, ejection ? 0.75 : 0.62, 0.1, 0.04, mat, x, seatY + (ejection ? 0.42 : 0.36), eyeZ + 0.6);
  back.rotation.x = -0.14;
  g.add(back);
  const head = rbox(ejection ? 0.34 : 0.24, ejection ? 0.3 : 0.16, 0.09, 0.03, ejection ? metalDark : mat, x, seatY + (ejection ? 0.92 : 0.8), eyeZ + 0.69);
  head.rotation.x = -0.14;
  g.add(head);
  // seat rails
  for (const s of [-0.16, 0.16]) g.add(box(0.03, 0.03, 0.7, metalDark, x + s, d.floorY + 0.03, eyeZ + 0.3));
  if (ejection) {
    // ejection handle between the knees and harness straps
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), lambert(stripes()));
    handle.position.set(x, seatY + 0.07, eyeZ + 0.08);
    handle.rotation.x = -Math.PI / 2;
    g.add(handle);
    const strap = lambert(null, 0x3d4a2f);
    for (const s of [-0.09, 0.09]) {
      const st = box(0.05, 0.6, 0.012, strap, x + s, seatY + 0.36, eyeZ + 0.53);
      st.rotation.x = -0.14;
      g.add(st);
    }
  }
}

/** Light-aircraft cabin: door panels, headliner, overhead console, visors, glass, two seats. */
export function buildCabin(g: THREE.Group, L: CockpitLayout, d: Dims): void {
  const E = L.eye;
  const roofY = E.y + 0.35;
  const roofFront = d.front + 0.35;
  const wall = lambert(plastic('#8f8a80'));
  const headliner = lambert(fabric('#d6d0c4', 2));
  const seatFabric = lambert(fabric('#5d4838', 3));
  const frame = lambert(plastic('#e2dfd7'));

  g.add(box(d.halfW * 2, 0.03, d.back - d.front, lambert(carpet()), d.cx, d.floorY, (d.front + d.back) / 2));
  for (const s of [-1, 1]) {
    const x = d.cx + s * d.halfW;
    g.add(box(0.04, d.sillY - d.floorY, d.back - d.front, wall, x, (d.sillY + d.floorY) / 2, (d.front + d.back) / 2));
    // door: armrest, pocket and handle
    g.add(rbox(0.07, 0.05, 0.42, 0.02, wall, x - s * 0.05, d.sillY - 0.14, E.z + 0.12));
    g.add(rbox(0.03, 0.12, 0.34, 0.015, lambert(fabric('#6b5a4a', 4)), x - s * 0.03, d.sillY - 0.3, E.z + 0.05));
    g.add(tube(new THREE.Vector3(x - s * 0.06, d.sillY - 0.08, E.z - 0.28), new THREE.Vector3(x - s * 0.06, d.sillY - 0.08, E.z - 0.16), 0.01, chrome));
    // side windows (front door, rear)
    g.add(glass(new THREE.Vector3(x, roofY, roofFront), new THREE.Vector3(x, roofY, E.z + 0.78), new THREE.Vector3(x, d.sillY, d.front + 0.05), new THREE.Vector3(x, d.sillY, E.z + 0.78)));
    g.add(glass(new THREE.Vector3(x, roofY, E.z + 0.84), new THREE.Vector3(x, roofY, d.back), new THREE.Vector3(x, d.sillY, E.z + 0.84), new THREE.Vector3(x, d.sillY, d.back)));
    // window frame: sill, B pillar, door top
    g.add(tube(new THREE.Vector3(x, d.sillY, d.front + 0.05), new THREE.Vector3(x, d.sillY, d.back), 0.02, frame));
    g.add(tube(new THREE.Vector3(x, d.sillY, E.z + 0.81), new THREE.Vector3(x, roofY, E.z + 0.81), 0.035, frame));
    g.add(tube(new THREE.Vector3(x, roofY, roofFront), new THREE.Vector3(x, roofY, d.back), 0.025, frame));
  }
  // headliner and rear wall
  g.add(box(d.halfW * 2, 0.03, d.back - roofFront, headliner, d.cx, roofY + 0.015, (d.back + roofFront) / 2));
  g.add(box(d.halfW * 2, roofY - d.floorY, 0.03, headliner, d.cx, (roofY + d.floorY) / 2, d.back));
  // overhead console with fresh-air vents and dome light
  g.add(rbox(0.16, 0.05, 0.5, 0.02, wall, d.cx, roofY - 0.02, roofFront + 0.32));
  for (const x of [E.x, -E.x]) {
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 12), chrome);
    vent.position.set(x * 0.85, roofY - 0.02, E.z - 0.05);
    g.add(vent);
    // sun visor hinged at the roof front
    const visor = rbox(0.3, 0.012, 0.16, 0.006, lambert(fabric('#cfc6b4', 5)), x, roofY - 0.05, roofFront + 0.09);
    visor.rotation.x = 0.35;
    g.add(visor);
  }
  // windshield: pillars, centre strip, glass
  const a = (x: number) => new THREE.Vector3(d.cx + x, d.glareY + 0.02, d.front + 0.08);
  const r = (x: number) => new THREE.Vector3(d.cx + x, roofY, roofFront);
  g.add(tube(a(-d.halfW + 0.02), r(-d.halfW + 0.02), 0.03, frame), tube(a(d.halfW - 0.02), r(d.halfW - 0.02), 0.03, frame));
  g.add(tube(a(0), r(0), 0.012, frame));
  g.add(glass(r(-d.halfW), r(d.halfW), a(-d.halfW), a(d.halfW)));
  // magnetic compass on top of the glareshield
  g.add(rbox(0.07, 0.05, 0.05, 0.01, metalDark, d.cx, d.glareY + 0.045, d.front + 0.1));
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0xe8e3d2 }));
  card.position.set(d.cx, d.glareY + 0.047, d.front + 0.126);
  g.add(card);
  // rounded glareshield lip
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.halfW * 2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), lambert(plastic('#2a2a2c')));
  lip.position.set(d.cx, d.glareY - 0.005, d.front + 0.18);
  g.add(lip);
  // fuel selector between the seats
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), lambert(null, 0xb83020)).translateX(d.cx).translateY(d.floorY + 0.03).translateZ(E.z - 0.15));
  for (const x of [E.x, -E.x]) seat(g, x, d, E.z, seatFabric, false);
  // rear bench
  g.add(rbox(1.0, 0.1, 0.45, 0.04, seatFabric, d.cx, d.floorY + 0.34, E.z + 1.15));
  g.add(rbox(1.0, 0.55, 0.1, 0.04, seatFabric, d.cx, d.floorY + 0.65, E.z + 1.42));
}

/** Jet cockpit tub: side consoles, ejection seat, tinted canopy over the pilot. */
export function buildCanopy(g: THREE.Group, L: CockpitLayout, d: Dims): void {
  const E = L.eye;
  const tub = lambert(plastic('#4b5258'));
  const consoleMat = lambert(plastic('#2c3034'));
  const frame = lambert(plastic('#5d646a'));
  g.add(box(d.halfW * 2, 0.03, d.back - d.front, lambert(carpet()), d.cx, d.floorY, (d.front + d.back) / 2));
  for (const s of [-1, 1]) {
    const x = d.cx + s * d.halfW;
    g.add(box(0.04, d.sillY - d.floorY, d.back - d.front + 0.6, tub, x, (d.sillY + d.floorY) / 2, (d.front + d.back) / 2 + 0.3));
    // side console with a few switches and knobs
    const cz = E.z - 0.05;
    g.add(rbox(0.13, 0.08, 0.62, 0.015, consoleMat, x - s * 0.085, E.y - 0.66, cz));
    for (let i = 0; i < 5; i++) {
      const sw = box(0.008, 0.025, 0.008, chrome, x - s * (0.06 + (i % 2) * 0.05), E.y - 0.61, cz - 0.22 + i * 0.1);
      sw.rotation.x = 0.4;
      g.add(sw);
    }
  }
  // canopy glass: half cylinder over the cockpit, windscreen panel in front
  const canopyLen = d.back - d.front + 0.4;
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(d.halfW + 0.03, d.halfW + 0.03, canopyLen, 20, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), glassMat);
  canopy.position.set(d.cx, d.sillY, d.front + 0.5 + canopyLen / 2);
  canopy.scale.set(1, 1.25, 1);
  canopy.renderOrder = 5;
  g.add(canopy);
  const bowTop = E.y + 0.32;
  g.add(
    glass(
      new THREE.Vector3(d.cx - 0.3, bowTop, d.front + 0.5),
      new THREE.Vector3(d.cx + 0.3, bowTop, d.front + 0.5),
      new THREE.Vector3(d.cx - d.halfW, d.glareY, d.front + 0.05),
      new THREE.Vector3(d.cx + d.halfW, d.glareY, d.front + 0.05),
    ),
  );
  for (const s of [-1, 1]) g.add(tube(new THREE.Vector3(d.cx + s * d.halfW, d.sillY, d.front + 0.05), new THREE.Vector3(d.cx + s * d.halfW, d.sillY, d.back + 0.8), 0.02, frame));
  seat(g, E.x, d, E.z, lambert(fabric('#3e4a3a', 6)), true);
}
