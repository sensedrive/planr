import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { type InstrumentData, Instruments } from './instruments';
import { Controls3D, EYE } from './stick';

const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a867d });
const panelMat = new THREE.MeshLambertMaterial({ color: 0x2b2c2f });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x3a3936 });
const seatMat = new THREE.MeshLambertMaterial({ color: 0x5a3a28 });
const frameMat = new THREE.MeshLambertMaterial({ color: 0xd8d6d0 });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Thin bar between two points (window frames). */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(r, len, r), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** Interior of the cabin (aircraft coordinates), with panel, stick and throttle. */
export class Cockpit {
  readonly group = new THREE.Group();
  readonly instruments: Instruments;
  readonly controls3d = new Controls3D();
  /** world-locked message board for VR (hidden unless a message is shown) */
  readonly board: THREE.Mesh;
  private readonly boardCtx: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private boardText = '';

  constructor() {
    const g = this.group;
    g.name = 'cockpit';
    const halfW = 0.62;
    const floorY = -0.55;
    const sillY = 0.25;
    const roofY = 0.95;
    const front = -1.3;
    const back = 1.0;

    g.add(box(halfW * 2, 0.03, back - front, 0, floorY, (front + back) / 2, floorMat));
    for (const s of [-1, 1]) g.add(box(0.03, sillY - floorY, back - front, s * halfW, (sillY + floorY) / 2, (front + back) / 2, wallMat));
    g.add(box(halfW * 2, 0.03, back - -0.95, 0, roofY, (back + -0.95) / 2, wallMat));
    g.add(box(halfW * 2, roofY - floorY, 0.03, 0, (roofY + floorY) / 2, back, wallMat));
    // firewall below panel
    g.add(box(halfW * 2, 0.4, 0.03, 0, floorY + 0.2, front - 0.05, panelMat));

    // panel and glareshield
    g.add(box(halfW * 2, 0.5, 0.08, 0, 0.1, front - 0.04, panelMat));
    g.add(box(halfW * 2, 0.04, 0.22, 0, 0.37, front + 0.07, panelMat));

    this.instruments = new Instruments(0.84);
    this.instruments.mesh.position.set(-0.17, 0.2, front + 0.002);
    g.add(this.instruments.mesh);

    // window frames
    const aL = new THREE.Vector3(-halfW, 0.37, front + 0.05);
    const aR = new THREE.Vector3(halfW, 0.37, front + 0.05);
    const rL = new THREE.Vector3(-halfW, roofY, -0.95);
    const rR = new THREE.Vector3(halfW, roofY, -0.95);
    g.add(bar(aL, rL, 0.05, frameMat), bar(aR, rR, 0.05, frameMat));
    g.add(bar(new THREE.Vector3(0, 0.37, front + 0.05), new THREE.Vector3(0, roofY, -0.95), 0.025, frameMat));
    for (const s of [-1, 1]) {
      g.add(bar(new THREE.Vector3(s * halfW, sillY, 0.2), new THREE.Vector3(s * halfW, roofY, 0.2), 0.06, frameMat));
      g.add(bar(new THREE.Vector3(s * halfW, sillY, front + 0.05), new THREE.Vector3(s * halfW, sillY, back), 0.04, frameMat));
    }

    // seats
    for (const x of [EYE.x, -EYE.x]) {
      g.add(box(0.48, 0.1, 0.5, x, -0.2, EYE.z + 0.35, seatMat));
      const backrest = box(0.48, 0.7, 0.1, x, 0.15, EYE.z + 0.62, seatMat);
      backrest.rotation.x = -0.15;
      g.add(backrest);
    }

    g.add(this.controls3d.group);

    // message board
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    this.boardCtx = canvas.getContext('2d')!;
    this.boardTex = new THREE.CanvasTexture(canvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshBasicMaterial({ map: this.boardTex, transparent: true, toneMapped: false, depthTest: false }),
    );
    this.board.position.set(EYE.x, EYE.y + 0.05, EYE.z - 0.95);
    this.board.renderOrder = 10;
    this.board.visible = false;
    g.add(this.board);
  }

  update(dt: number, c: ControlState, data: InstrumentData): void {
    this.controls3d.update(c);
    this.instruments.update(dt, data);
  }

  /** Shows (or hides with an empty string) a message in front of the pilot. */
  setMessage(title: string, subtitle = ''): void {
    const text = title + '\n' + subtitle;
    if (text === this.boardText) return;
    this.boardText = text;
    this.board.visible = title !== '';
    if (!title) return;
    const ctx = this.boardCtx;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = 'rgba(10,16,24,0.78)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 1008, 240, 28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(title, 512, subtitle ? 95 : 128);
    if (subtitle) {
      ctx.font = '38px sans-serif';
      ctx.fillStyle = '#cfd8e0';
      ctx.fillText(subtitle, 512, 175);
    }
    this.boardTex.needsUpdate = true;
  }
}
