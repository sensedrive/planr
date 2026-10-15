import * as THREE from 'three';
import type { ControlState } from '../core/input';
import { Controls3D } from './controls3d';
import { HeadUpDisplay, type HudData } from './hudDisplay';
import { buildCabin, buildCanopy, type Dims } from './interior';
import { type InstrumentConfig, type InstrumentData, Instruments } from './instruments';
import type { CockpitLayout } from './layout';
import { panelArt, plastic } from './textures';
import { mergeChildMeshes } from '../view/merge';

const panelMat = new THREE.MeshLambertMaterial({ color: 0x2b2c2f });
const glareMat = new THREE.MeshLambertMaterial({ map: plastic('#26272a') });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
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
  private hud: HeadUpDisplay | null = null;

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

    // firewall, panel body and glareshield
    g.add(box(halfW * 2, 0.4, 0.03, cx, floorY + 0.2, front - 0.05, panelMat));
    g.add(box(halfW * 2, 0.5, 0.08, cx, E.y - 0.5, front - 0.045, panelMat));
    g.add(box(halfW * 2, 0.04, 0.22, cx, glareY, front + 0.07, glareMat));

    // panel face artwork (radios, engine gauges, switches); the six-pack sits on top of it
    const panelLeft = cx - halfW;
    const sixFrom = ((L.panelX - 0.42 - panelLeft) / (halfW * 2)) * 1024;
    const sixTo = ((L.panelX + 0.42 - panelLeft) / (halfW * 2)) * 1024;
    const faceGeo = new THREE.PlaneGeometry(halfW * 2, 0.5);
    const uv = faceGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    const face = new THREE.Mesh(faceGeo, new THREE.MeshLambertMaterial({ map: panelArt(!cabin, sixFrom, sixTo) }));
    face.position.set(cx, E.y - 0.5, front + 0.0005);
    g.add(face);

    this.instruments = new Instruments(0.84, instrumentConfig);
    this.instruments.mesh.position.set(L.panelX, E.y - 0.4, front + 0.002);
    g.add(this.instruments.mesh);

    const dims: Dims = { cx, halfW, front, back, floorY, glareY, sillY };
    if (cabin) buildCabin(g, L, dims);
    else {
      buildCanopy(g, L, dims);
      this.hud = new HeadUpDisplay(E, new THREE.Vector3(E.x, E.y - 0.07, front + 0.16), 0.22);
      this.hud.group.rotation.x = -0.12;
      g.add(this.hud.group);
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
    // interior shell: one draw call per material
    mergeChildMeshes(g);
  }

  update(dt: number, c: ControlState, gearPosition: number, data: InstrumentData, status: string, target: THREE.Vector3 | null, hud: HudData): void {
    this.controls3d.update(c, gearPosition);
    this.instruments.update(dt, data);
    this.hud?.update(dt, hud);
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
