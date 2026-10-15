import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { Controls3D } from './controls3d';
import { type InstrumentConfig, type InstrumentData, Instruments } from './instruments';
import type { CockpitLayout } from './layout';

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

/** Interior of the cockpit (aircraft coordinates), with panel and all controls. */
export class Cockpit {
  readonly group = new THREE.Group();
  readonly instruments: Instruments;
  readonly controls3d: Controls3D;
  /** world-locked message board for VR (hidden unless a message is shown) */
  readonly board: THREE.Mesh;
  private readonly boardCtx: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private boardText = '';
  private readonly statusCtx: CanvasRenderingContext2D;
  private readonly statusTex: THREE.CanvasTexture;
  private statusText = '-';
  private readonly arrow = new THREE.Group();

  constructor(
    readonly layout: CockpitLayout,
    instrumentConfig: InstrumentConfig,
  ) {
    const g = this.group;
    g.name = 'cockpit';
    const L = layout;
    const E = L.eye;
    const halfW = L.halfWidth;
    const front = L.front;
    const floorY = E.y - 1.15;
    const glareY = E.y - 0.23;
    const cabin = L.style === 'cabin';
    const sillY = cabin ? E.y - 0.35 : E.y - 0.3;
    const back = cabin ? E.z + 1.6 : E.z + 0.75;
    const cx = cabin ? 0 : E.x;
    this.controls3d = new Controls3D(L);

    g.add(box(halfW * 2, 0.03, back - front, cx, floorY, (front + back) / 2, floorMat));
    for (const s of [-1, 1]) g.add(box(0.03, sillY - floorY, back - front, cx + s * halfW, (sillY + floorY) / 2, (front + back) / 2, wallMat));
    // firewall below the panel
    g.add(box(halfW * 2, 0.4, 0.03, cx, floorY + 0.2, front - 0.05, panelMat));
    // panel and glareshield
    g.add(box(halfW * 2, 0.5, 0.08, cx, E.y - 0.5, front - 0.04, panelMat));
    g.add(box(halfW * 2, 0.04, 0.22, cx, glareY, front + 0.07, panelMat));

    this.instruments = new Instruments(0.84, instrumentConfig);
    this.instruments.mesh.position.set(L.panelX, E.y - 0.4, front + 0.002);
    g.add(this.instruments.mesh);

    if (cabin) {
      const roofY = E.y + 0.35;
      const roofFront = front + 0.35;
      g.add(box(halfW * 2, 0.03, back - roofFront, cx, roofY, (back + roofFront) / 2, wallMat));
      g.add(box(halfW * 2, roofY - floorY, 0.03, cx, (roofY + floorY) / 2, back, wallMat));
      const a = (x: number) => new THREE.Vector3(cx + x, glareY, front + 0.05);
      const r = (x: number) => new THREE.Vector3(cx + x, roofY, roofFront);
      g.add(bar(a(-halfW), r(-halfW), 0.05, frameMat), bar(a(halfW), r(halfW), 0.05, frameMat));
      g.add(bar(a(0), r(0), 0.025, frameMat));
      for (const s of [-1, 1]) {
        const x = cx + s * halfW;
        g.add(bar(new THREE.Vector3(x, sillY, E.z + 0.8), new THREE.Vector3(x, roofY, E.z + 0.8), 0.06, frameMat));
        g.add(bar(new THREE.Vector3(x, sillY, front + 0.05), new THREE.Vector3(x, sillY, back), 0.04, frameMat));
      }
      for (const x of [E.x, -E.x]) this.seat(x, floorY, E.z);
    } else {
      // canopy: windscreen bow and rails, the glass itself is left out for a clear view
      const bowTop = E.y + 0.32;
      const ws = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, y, z);
      g.add(bar(ws(-halfW, glareY, front + 0.05), ws(-0.3, bowTop, front + 0.5), 0.02, frameMat));
      g.add(bar(ws(halfW, glareY, front + 0.05), ws(0.3, bowTop, front + 0.5), 0.02, frameMat));
      g.add(bar(ws(-0.3, bowTop, front + 0.5), ws(0.3, bowTop, front + 0.5), 0.02, frameMat));
      for (const s of [-1, 1]) g.add(bar(ws(s * halfW, sillY, front + 0.05), ws(s * halfW, sillY, back + 0.8), 0.04, frameMat));
      // canopy arch behind the head
      const arch = new THREE.Mesh(new THREE.TorusGeometry(halfW, 0.025, 6, 16, Math.PI), frameMat);
      arch.position.set(cx, sillY, E.z + 0.55);
      g.add(arch);
      this.seat(E.x, floorY, E.z, true);
    }

    g.add(this.controls3d.group);

    // status line below the instruments
    const sc = document.createElement('canvas');
    sc.width = 1024;
    sc.height = 72;
    this.statusCtx = sc.getContext('2d')!;
    this.statusTex = new THREE.CanvasTexture(sc);
    this.statusTex.colorSpace = THREE.SRGBColorSpace;
    const status = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.059), new THREE.MeshBasicMaterial({ map: this.statusTex, toneMapped: false }));
    status.position.set(L.panelX, E.y - 0.545, front + 0.002);
    g.add(status);
    this.setStatus('');

    // navigation arrow on the glareshield
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.09, 10).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff9a2a, toneMapped: false }),
    );
    this.arrow.add(cone);
    this.arrow.position.set(E.x + 0.16, glareY + 0.04, front + 0.14);
    this.arrow.visible = false;
    g.add(this.arrow);

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
    this.board.position.set(E.x, E.y + 0.05, E.z - 0.95);
    this.board.renderOrder = 10;
    this.board.visible = false;
    g.add(this.board);
  }

  private seat(x: number, floorY: number, eyeZ: number, ejection = false): void {
    const g = this.group;
    g.add(box(0.48, 0.1, 0.5, x, floorY + 0.35, eyeZ + 0.35, seatMat));
    const backrest = box(0.48, ejection ? 1.0 : 0.7, 0.1, x, floorY + (ejection ? 0.85 : 0.7), eyeZ + 0.62, seatMat);
    backrest.rotation.x = -0.15;
    g.add(backrest);
  }

  update(dt: number, c: ControlState, gearPosition: number, data: InstrumentData, status: string, target: THREE.Vector3 | null): void {
    this.controls3d.update(c, gearPosition);
    this.instruments.update(dt, data);
    this.setStatus(status);
    this.arrow.visible = target !== null;
    if (target) {
      this.group.updateWorldMatrix(true, false);
      this.arrow.lookAt(target);
    }
  }

  private setStatus(text: string): void {
    if (text === this.statusText) return;
    this.statusText = text;
    const ctx = this.statusCtx;
    ctx.fillStyle = '#101113';
    ctx.fillRect(0, 0, 1024, 72);
    ctx.fillStyle = '#9fe0a8';
    const t = text || 'planr C-172';
    let size = 40;
    do {
      ctx.font = `bold ${size}px ui-monospace, Menlo, monospace`;
      size -= 2;
    } while (ctx.measureText(t).width > 1000 && size > 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 512, 38);
    this.statusTex.needsUpdate = true;
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
