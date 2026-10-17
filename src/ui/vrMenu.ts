import * as THREE from 'three';
import type { XRControllerSource } from '../core/xrSource';
import { choiceAvailable, OPTIONS, type Settings } from '../game/settings';
import type { MenuHandlers } from './menu';

const W = 1024;
const ROW_H = 84;
const TOP = 110;
const LABEL_W = 300;
const PER_LINE = 5;
const lines = (n: number) => Math.ceil(n / PER_LINE);
const H = TOP + OPTIONS.reduce((sum, o) => sum + lines(o.choices.length) * ROW_H, 0) + 150;

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

/** In-cockpit VR menu, operated with the controller laser and trigger. */
export class VRMenu {
  readonly panel: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly rays: { ctrl: THREE.Group; line: THREE.Line }[] = [];
  private hits: Hit[] = [];
  private hover: Hit | null = null;
  private canResume = false;
  private best = '';
  private readonly raycaster = new THREE.Raycaster();
  private readonly m = new THREE.Matrix4();

  constructor(
    renderer: { xr: XRControllerSource },
    rig: THREE.Group,
    parent: THREE.Object3D,
    private readonly settings: Settings,
    private readonly handlers: MenuHandlers,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, (0.72 * H) / W),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, toneMapped: false }),
    );
    this.panel.renderOrder = 20;
    this.panel.rotation.x = -0.12;
    this.panel.visible = false;
    parent.add(this.panel);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.2)]);
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.8, depthTest: false }));
      line.renderOrder = 21;
      line.visible = false;
      ctrl.add(line);
      rig.add(ctrl);
      ctrl.addEventListener('selectstart', () => {
        if (!this.panel.visible) return;
        const hit = this.pick(ctrl);
        hit?.action();
      });
      this.rays.push({ ctrl, line });
    }
  }

  get open(): boolean {
    return this.panel.visible;
  }

  show(canResume: boolean, best: string, eye: THREE.Vector3): void {
    this.panel.position.set(eye.x, eye.y - 0.08, eye.z - 0.55);
    this.canResume = canResume;
    this.best = best;
    this.panel.visible = true;
    for (const r of this.rays) r.line.visible = true;
    this.draw();
  }

  hide(): void {
    this.panel.visible = false;
    for (const r of this.rays) r.line.visible = false;
  }

  private pick(ctrl: THREE.Group): Hit | null {
    ctrl.updateWorldMatrix(true, false);
    this.m.identity().extractRotation(ctrl.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.m);
    const hit = this.raycaster.intersectObject(this.panel, false)[0];
    if (!hit?.uv) return null;
    const x = hit.uv.x * W;
    const y = (1 - hit.uv.y) * H;
    return this.hits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) ?? null;
  }

  update(): void {
    if (!this.panel.visible) return;
    let hover: Hit | null = null;
    for (const r of this.rays) hover = hover ?? this.pick(r.ctrl);
    if (hover !== this.hover) {
      this.hover = hover;
      this.draw();
    }
  }

  private button(x: number, y: number, w: number, h: number, text: string, active: boolean, action: () => void, primary = false): void {
    const ctx = this.ctx;
    const hit: Hit = { x, y, w, h, action };
    const hovered = this.hover !== null && this.hover.x === x && this.hover.y === y;
    ctx.fillStyle = primary ? '#ff9a2a' : active ? '#3d8bfd' : hovered ? '#3a4452' : '#252b33';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    if (hovered) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = primary ? '#1a1206' : '#ffffff';
    ctx.font = `${primary ? 'bold ' : ''}${primary ? 40 : 28}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    this.hits.push(hit);
  }

  private draw(): void {
    const ctx = this.ctx;
    this.hits = [];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,16,22,0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 32);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('planr', 40, 58);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#9aa7b5';
    ctx.fillText('Laser + Trigger zum Auswählen', 230, 62);

    let y0 = TOP;
    OPTIONS.forEach((opt) => {
      const y = y0;
      y0 += lines(opt.choices.length) * ROW_H;
      ctx.fillStyle = '#cfd8e0';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(opt.label, 40, y + 34);
      const n = Math.min(PER_LINE, opt.choices.length);
      const gap = 10;
      const w = (W - LABEL_W - 40 - gap * (n - 1)) / n;
      opt.choices.forEach((ch, idx) => {
        const i = idx % PER_LINE;
        const yy = y + Math.floor(idx / PER_LINE) * ROW_H;
        const x = LABEL_W + i * (w + gap);
        if (!choiceAvailable(ch, this.settings)) {
          ctx.globalAlpha = 0.3;
          this.button(x, yy, w, ROW_H - 16, ch.label, false, () => {});
          this.hits.pop();
          ctx.globalAlpha = 1;
          return;
        }
        this.button(x, yy, w, ROW_H - 16, ch.label, this.settings[opt.key] === ch.value, () => {
          this.handlers.change(opt.key, ch.value);
          this.draw();
        });
      });
    });

    const fy = y0 + 10;
    ctx.fillStyle = '#9aa7b5';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(this.best, 40, fy + 6);
    if (this.canResume) this.button(40, fy + 30, 300, 90, 'Weiter', false, () => this.handlers.resume());
    this.button(W - 40 - 420, fy + 30, 420, 90, 'Fliegen', false, () => this.handlers.fly(), true);
    this.texture.needsUpdate = true;
  }
}
