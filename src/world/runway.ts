import * as THREE from 'three';
import { mulberry32, RUNWAY, terrainHeight } from './terrain';

function runwayTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 4096;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3b3d40';
  ctx.fillRect(0, 0, W, H);
  // asphalt grain
  const rand = mulberry32(7);
  for (let i = 0; i < 9000; i++) {
    const g = 50 + rand() * 30;
    ctx.fillStyle = `rgb(${g},${g},${g + 3})`;
    ctx.fillRect(rand() * W, rand() * H, 2, 3);
  }
  ctx.fillStyle = '#e9e9e2';
  // edge lines
  ctx.fillRect(6, 0, 5, H);
  ctx.fillRect(W - 11, 0, 5, H);
  // canvas v: 0.293 m/px, u: 0.117 m/px → vertical sizes are scaled by 0.4
  const vy = (m: number) => m / 0.293;
  // centre line dashes (30 m dash, 20 m gap)
  for (let y = vy(120); y < H - vy(120); y += vy(50)) ctx.fillRect(W / 2 - 3, y, 6, vy(30));
  // threshold piano keys and numbers on both ends
  const drawEnd = (label: string) => {
    for (let i = 0; i < 8; i++) {
      const x = 22 + i * 27 + (i >= 4 ? 8 : 0);
      ctx.fillRect(x, vy(6), 14, vy(30));
    }
    // the number faces pilots approaching this end, i.e. it reads toward the canvas bottom
    ctx.save();
    ctx.translate(W / 2, vy(48));
    ctx.rotate(Math.PI);
    ctx.scale(1, 0.5);
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  };
  // north end (top of canvas = -Z) is the threshold of runway 18, the south end that of 36
  drawEnd('18');
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  drawEnd('36');
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Runway, hangars, a windsock and trees around the airfield. */
export function createAirfield(maxAnisotropy: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'airfield';
  const y = RUNWAY.elevation;

  const geo = new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length);
  geo.rotateX(-Math.PI / 2);
  const runway = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ map: runwayTexture(maxAnisotropy), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  runway.position.y = y + 0.03;
  group.add(runway);

  // taxiway + apron
  const apronMat = new THREE.MeshLambertMaterial({ color: 0x55585a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(90, 14).rotateX(-Math.PI / 2), apronMat);
  taxi.position.set(60, y + 0.02, 250);
  group.add(taxi);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(80, 120).rotateX(-Math.PI / 2), apronMat);
  apron.position.set(140, y + 0.02, 250);
  group.add(apron);

  // hangars
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0, flatShading: true });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b32, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 26), hangarMat);
    h.position.set(200, y + 5, 190 + i * 40);
    group.add(h);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 30, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), roofMat);
    roof.position.set(200, y + 10, 190 + i * 40);
    roof.scale.set(1, 0.4, 1);
    group.add(roof);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), hangarMat);
  tower.position.set(170, y + 9, 330);
  group.add(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 9), new THREE.MeshLambertMaterial({ color: 0x2b3f55 }));
  cab.position.set(170, y + 20, 330);
  group.add(cab);

  // windsock
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(-40, y + 3, -350);
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.5, 8, 1, true).rotateZ(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }));
  sock.position.set(-38.2, y + 5.8, -350);
  group.add(sock);

  group.add(createTrees());
  return group;
}

function createTrees(): THREE.InstancedMesh {
  const rand = mulberry32(99);
  const geo = new THREE.ConeGeometry(3.5, 12, 6).translate(0, 6, 0);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const max = 3500;
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < max * 4 && n < max; tries++) {
    const x = (rand() - 0.5) * 7000;
    const z = (rand() - 0.5) * 7000;
    if (Math.abs(x) < 140 && Math.abs(z) < 900) continue; // runway clearance
    if (x > 90 && x < 260 && z > 150 && z < 360) continue; // apron & hangars
    const h = terrainHeight(x, z);
    if (h < 4 || h > 320) continue;
    const slope = Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h);
    if (slope > 6) continue;
    // clumps: reject based on a cheap pattern
    if (Math.sin(x * 0.004) * Math.cos(z * 0.0035) < -0.1 && rand() < 0.8) continue;
    const sc = 0.6 + rand() * 0.9;
    p.set(x, h - 0.5, z);
    s.set(sc, sc * (0.8 + rand() * 0.5), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    c.setHSL(0.27 + rand() * 0.06, 0.45, 0.18 + rand() * 0.1);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Start position on the southern threshold of runway 36. */
export function runwayStart(): { position: THREE.Vector3; heading: number } {
  return { position: new THREE.Vector3(0, RUNWAY.elevation + 1.17, RUNWAY.length / 2 - 40), heading: 0 };
}
