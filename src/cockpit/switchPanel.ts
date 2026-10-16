import * as THREE from 'three';
import type { SwitchId, Systems } from '../sim/systems';
import type { CockpitButton } from './controls3d';

const LABELS: Record<SwitchId, string> = {
  battery: 'BATT',
  fuelPump: 'PUMPE',
  ignition: 'ZÜND',
  starter: 'START',
  nav: 'NAV',
  beacon: 'BCN',
  strobe: 'STROBE',
  landing: 'LANDE',
  panel: 'PANEL',
  parkBrake: 'P-BREMS',
  com: 'COM',
  ap: 'AP',
  apHdg: 'HDG',
  apAlt: 'ALT',
  hdgDown: 'HDG −',
  hdgUp: 'HDG +',
  altDown: 'ALT −',
  altUp: 'ALT +',
};

/** momentary push buttons (no lamp, just a key) */
const MOMENTARY = new Set<SwitchId>(['hdgDown', 'hdgUp', 'altDown', 'altUp']);
const AP_ROW: SwitchId[] = ['ap', 'apHdg', 'hdgDown', 'hdgUp', 'apAlt', 'altDown', 'altUp'];

const PX_W = 1024;
const PX_H = 168;

/**
 * Two rows of lit push switches below the instruments: electrics, engine start and
 * lights on top, autopilot with heading/altitude selector, the COM radio and a fuel readout below.
 * One canvas texture; invisible boxes take the presses (finger in VR, mouse on desktop).
 */
export class SwitchPanel {
  readonly group = new THREE.Group();
  readonly buttons: CockpitButton[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly cells: { id: SwitchId; x: number; y: number; w: number }[] = [];
  private readonly readout = { x: 0, y: 0, w: 0 };
  private state = '';

  constructor(
    centre: THREE.Vector3,
    width: number,
    switches: SwitchId[],
    autopilot: boolean,
  ) {
    const height = (width * PX_H) / PX_W;
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    face.position.copy(centre);
    this.group.add(face);

    const cellW = PX_W / 10;
    const rowH = PX_H / 2;
    switches.forEach((id, i) => this.cells.push({ id, x: i * cellW, y: 0, w: cellW }));
    // lower row: autopilot (not in the glider), then the radio, then the readout
    const lower: SwitchId[] = [...(autopilot ? AP_ROW : []), 'com'];
    lower.forEach((id, i) => this.cells.push({ id, x: i * cellW, y: rowH, w: cellW }));
    Object.assign(this.readout, { x: lower.length * cellW, y: rowH, w: PX_W - lower.length * cellW });

    // press targets, slightly proud of the panel
    const s = width / PX_W;
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const c of this.cells) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.w * s * 0.9, rowH * s * 0.85, 0.02), hitMat);
      const at = new THREE.Vector3(centre.x - width / 2 + (c.x + c.w / 2) * s, centre.y + height / 2 - (c.y + rowH / 2) * s, centre.z + 0.008);
      mesh.position.copy(at);
      this.group.add(mesh);
      this.buttons.push({ id: c.id, mesh, centre: at });
    }
  }

  update(sys: Systems, panelLight: boolean): void {
    const fuel = sys.capacity > 0 ? Math.round(sys.fuelFraction * 100) : -1;
    const key = `${this.cells.map((c) => (sys.isOn(c.id) ? 1 : 0)).join('')}|${sys.ap.on}|${sys.ap.heading}|${sys.ap.altitudeFt}|${fuel}|${panelLight}`;
    if (key === this.state) return;
    this.state = key;
    const ctx = this.ctx;
    const rowH = PX_H / 2;
    ctx.fillStyle = panelLight ? '#2b2620' : '#18191b';
    ctx.fillRect(0, 0, PX_W, PX_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of this.cells) {
      const on = sys.isOn(c.id);
      const x = c.x + 6;
      const y = c.y + 6;
      const w = c.w - 12;
      const h = rowH - 12;
      ctx.fillStyle = '#2c2e32';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = '#4b5058';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!MOMENTARY.has(c.id)) {
        // indicator lamp
        ctx.fillStyle = on ? (c.id === 'parkBrake' || c.id === 'starter' ? '#ffb02e' : '#3ce36a') : '#3a3d42';
        ctx.fillRect(x + 10, y + 8, w - 20, 9);
      }
      ctx.fillStyle = panelLight ? '#ffe7b8' : '#e3e8ee';
      ctx.font = `bold ${LABELS[c.id].length > 6 ? 19 : 23}px sans-serif`;
      ctx.fillText(LABELS[c.id], x + w / 2, y + h / 2 + 8);
    }
    // readout: selected heading/altitude and fuel
    const r = this.readout;
    ctx.fillStyle = '#0c0f0d';
    ctx.fillRect(r.x + 8, r.y + 8, r.w - 16, rowH - 16);
    ctx.fillStyle = '#8ff0a4';
    ctx.textAlign = 'left';
    ctx.font = `bold ${r.w < 260 ? 21 : 26}px ui-monospace, Menlo, monospace`;
    const lines: string[] = [];
    if (this.cells.some((c) => c.id === 'ap'))
      lines.push(sys.ap.on ? `${String(sys.ap.heading).padStart(3, '0')}° ${sys.ap.altitudeFt}ft` : 'AP AUS');
    lines.push(fuel >= 0 ? `FUEL ${fuel}%` : 'KEIN MOTOR');
    lines.forEach((l, i) => ctx.fillText(l, r.x + (r.w < 260 ? 14 : 20), r.y + rowH / 2 + (i - (lines.length - 1) / 2) * 30));
    this.tex.needsUpdate = true;
  }
}
