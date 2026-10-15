import * as THREE from 'three';

export interface InstrumentData {
  airspeedKt: number;
  altitudeFt: number;
  vsFpm: number;
  pitchDeg: number;
  rollDeg: number;
  headingDeg: number;
  rpm: number;
  throttle: number;
  flapsTarget: number;
  flaps: number;
  trim: number;
  brake: number;
  stall: boolean;
  onGround: boolean;
}

const W = 1536;
const H = 384;
const R = 112;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Six-pack panel drawn on a canvas, refreshed at a low rate. */
export class Instruments {
  readonly mesh: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private timer = 0;

  constructor(width: number) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * H) / W),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
  }

  update(dt: number, d: InstrumentData, force = false): void {
    this.timer += dt;
    if (!force && this.timer < 1 / 12) return;
    this.timer = 0;
    this.draw(d);
    this.texture.needsUpdate = true;
  }

  private draw(d: InstrumentData): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#26282b';
    ctx.fillRect(0, 0, W, H);
    const cy = 128;
    const cx = (i: number) => 128 + i * 256;
    this.airspeed(cx(0), cy, d.airspeedKt);
    this.attitude(cx(1), cy, d.pitchDeg, d.rollDeg);
    this.altimeter(cx(2), cy, d.altitudeFt);
    this.tachometer(cx(3), cy, d.rpm);
    this.heading(cx(4), cy, d.headingDeg);
    this.vsi(cx(5), cy, d.vsFpm);
    this.strip(d);
  }

  // ---- helpers ---------------------------------------------------------------

  private bezel(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, R + 8, 0, TAU);
    ctx.fillStyle = '#4a4d52';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fillStyle = '#0d0e10';
    ctx.fill();
  }

  private ticks(x: number, y: number, a0: number, a1: number, n: number, major: number, len = 14): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#f2f2f2';
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const l = i % major === 0 ? len : len * 0.5;
      ctx.lineWidth = i % major === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (R - 4), y + Math.sin(a) * (R - 4));
      ctx.lineTo(x + Math.cos(a) * (R - 4 - l), y + Math.sin(a) * (R - 4 - l));
      ctx.stroke();
    }
  }

  private arc(x: number, y: number, a0: number, a1: number, color: string, r = R - 6, w = 7): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
    ctx.stroke();
  }

  private label(text: string, x: number, y: number, size = 22, color = '#f2f2f2'): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  private needle(x: number, y: number, a: number, len: number, width = 6, color = '#ffffff'): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-14, -width / 2);
    ctx.lineTo(len - 12, -width / 2);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - 12, width / 2);
    ctx.lineTo(-14, width / 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fillStyle = '#333';
    ctx.fill();
  }

  private digits(text: string, x: number, y: number, w = 96): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 2;
    ctx.fillRect(x - w / 2, y - 16, w, 32);
    ctx.strokeRect(x - w / 2, y - 16, w, 32);
    this.label(text, x, y + 1, 24);
  }

  // ---- gauges ----------------------------------------------------------------

  private airspeed(x: number, y: number, kt: number): void {
    this.bezel(x, y);
    const a0 = -Math.PI / 2 + 10 * DEG;
    const ang = (v: number) => a0 + (Math.min(v, 180) / 180) * 340 * DEG;
    this.arc(x, y, ang(40), ang(85), '#e8e8e8', R - 16, 6);
    this.arc(x, y, ang(48), ang(129), '#2fb34a');
    this.arc(x, y, ang(129), ang(163), '#e8c22c');
    this.arc(x, y, ang(163), ang(166), '#e23b2b', R - 6, 9);
    this.ticks(x, y, ang(0), ang(180), 36, 4);
    for (let v = 40; v <= 160; v += 40) {
      const a = ang(v);
      this.label(String(v), x + Math.cos(a) * (R - 40), y + Math.sin(a) * (R - 40), 20);
    }
    this.label('KNOTS', x, y + 34, 14, '#bbb');
    this.needle(x, y, ang(Math.max(0, kt)), R - 12);
  }

  private attitude(x: number, y: number, pitch: number, roll: number): void {
    const ctx = this.ctx;
    this.bezel(x, y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R - 2, 0, TAU);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-roll * DEG);
    const ppd = 4; // px per degree
    const off = Math.max(-80, Math.min(80, pitch)) * ppd;
    ctx.fillStyle = '#3c7fd0';
    ctx.fillRect(-2 * R, -3 * R + off, 4 * R, 3 * R);
    ctx.fillStyle = '#8a5a2e';
    ctx.fillRect(-2 * R, off, 4 * R, 3 * R);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2 * R, off);
    ctx.lineTo(2 * R, off);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let p = -30; p <= 30; p += 5) {
      if (p === 0) continue;
      const w = p % 10 === 0 ? 40 : 20;
      const py = off - p * ppd;
      ctx.beginPath();
      ctx.moveTo(-w, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }
    // roll scale
    ctx.lineWidth = 3;
    for (const r of [-60, -30, -20, -10, 10, 20, 30, 60]) {
      const a = -Math.PI / 2 + r * DEG;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4));
      ctx.lineTo(Math.cos(a) * (R - 20), Math.sin(a) * (R - 20));
      ctx.stroke();
    }
    ctx.restore();
    // fixed aircraft symbol + roll pointer
    ctx.strokeStyle = '#ffb21a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 60, y);
    ctx.lineTo(x - 20, y);
    ctx.lineTo(x - 10, y + 10);
    ctx.moveTo(x + 60, y);
    ctx.lineTo(x + 20, y);
    ctx.lineTo(x + 10, y + 10);
    ctx.stroke();
    ctx.fillStyle = '#ffb21a';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - R + 22);
    ctx.lineTo(x - 9, y - R + 38);
    ctx.lineTo(x + 9, y - R + 38);
    ctx.fill();
  }

  private altimeter(x: number, y: number, ft: number): void {
    this.bezel(x, y);
    const a0 = -Math.PI / 2;
    this.ticks(x, y, a0, a0 + TAU, 50, 5);
    for (let i = 0; i < 10; i++) {
      const a = a0 + (i / 10) * TAU;
      this.label(String(i), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 24);
    }
    this.digits(String(Math.round(Math.max(-999, ft) / 10) * 10), x, y + 42);
    this.label('ALT', x, y - 34, 14, '#bbb');
    const f = Math.max(0, ft);
    this.needle(x, y, a0 + ((f % 10000) / 10000) * TAU, R - 52, 10);
    this.needle(x, y, a0 + ((f % 1000) / 1000) * TAU, R - 12, 6);
  }

  private tachometer(x: number, y: number, rpm: number): void {
    this.bezel(x, y);
    const a0 = 0.75 * Math.PI;
    const ang = (v: number) => a0 + (Math.min(v, 3000) / 3000) * 1.5 * Math.PI;
    this.arc(x, y, ang(2100), ang(2700), '#2fb34a');
    this.arc(x, y, ang(2700), ang(2740), '#e23b2b', R - 6, 9);
    this.ticks(x, y, ang(0), ang(3000), 30, 5);
    for (let v = 0; v <= 30; v += 5) {
      const a = ang(v * 100);
      this.label(String(v), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 20);
    }
    this.label('RPM ×100', x, y - 30, 14, '#bbb');
    this.digits(String(Math.round(rpm / 10) * 10), x, y + 50, 86);
    this.needle(x, y, ang(rpm), R - 12);
  }

  private heading(x: number, y: number, hdg: number): void {
    const ctx = this.ctx;
    this.bezel(x, y);
    const card = (deg: number) => -Math.PI / 2 + (deg - hdg) * DEG;
    ctx.strokeStyle = '#f2f2f2';
    for (let d = 0; d < 360; d += 5) {
      const a = card(d);
      const l = d % 30 === 0 ? 16 : d % 10 === 0 ? 11 : 6;
      ctx.lineWidth = d % 10 === 0 ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (R - 4), y + Math.sin(a) * (R - 4));
      ctx.lineTo(x + Math.cos(a) * (R - 4 - l), y + Math.sin(a) * (R - 4 - l));
      ctx.stroke();
    }
    const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d < 360; d += 30) {
      const a = card(d);
      ctx.save();
      ctx.translate(x + Math.cos(a) * (R - 38), y + Math.sin(a) * (R - 38));
      ctx.rotate(a + Math.PI / 2);
      this.label(names[d] ?? String(d / 10), 0, 0, names[d] ? 26 : 20, names[d] ? '#ffd24a' : '#f2f2f2');
      ctx.restore();
    }
    // lubber line + aircraft
    ctx.fillStyle = '#ffb21a';
    ctx.beginPath();
    ctx.moveTo(x, y - R + 2);
    ctx.lineTo(x - 8, y - R - 8);
    ctx.lineTo(x + 8, y - R - 8);
    ctx.fill();
    ctx.strokeStyle = '#ffb21a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.lineTo(x, y + 34);
    ctx.moveTo(x - 30, y - 6);
    ctx.lineTo(x + 30, y - 6);
    ctx.moveTo(x - 12, y + 28);
    ctx.lineTo(x + 12, y + 28);
    ctx.stroke();
    this.digits(String(Math.round(hdg) % 360).padStart(3, '0') + '°', x, y + 64, 80);
  }

  private vsi(x: number, y: number, fpm: number): void {
    this.bezel(x, y);
    const ang = (v: number) => Math.PI + (Math.max(-2000, Math.min(2000, v)) / 2000) * 0.88 * Math.PI;
    this.ticks(x, y, ang(-2000), ang(2000), 40, 5);
    for (const v of [0, 5, 10, 15, 20]) {
      for (const s of v === 0 ? [1] : [1, -1]) {
        const a = ang(s * v * 100);
        this.label(String(v), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 20);
      }
    }
    this.label('UP', x - 30, y - 34, 14, '#bbb');
    this.label('DN', x - 30, y + 34, 14, '#bbb');
    this.label('FPM ×100', x + 26, y, 13, '#bbb');
    this.needle(x, y, ang(fpm), R - 12);
  }

  private strip(d: InstrumentData): void {
    const ctx = this.ctx;
    const y0 = 268;
    ctx.fillStyle = '#1b1c1e';
    ctx.fillRect(0, y0 - 6, W, H - y0 + 6);

    const bar = (x: number, label: string, value: number, text: string, color: string) => {
      this.label(label, x + 80, y0 + 18, 18, '#bbb');
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y0 + 36, 160, 26);
      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y0 + 38, 156 * Math.max(0, Math.min(1, value)), 22);
      this.label(text, x + 80, y0 + 88, 22);
    };
    bar(30, 'GAS', d.throttle, `${Math.round(d.throttle * 100)} %`, '#2fb34a');
    bar(230, 'KLAPPEN', d.flaps, `${Math.round(d.flaps * 30)}° → ${Math.round(d.flapsTarget * 30)}°`, '#e8e8e8');

    // trim: centred indicator
    const tx = 430;
    this.label('TRIMM', tx + 80, y0 + 18, 18, '#bbb');
    ctx.fillStyle = '#000';
    ctx.fillRect(tx, y0 + 36, 160, 26);
    ctx.fillStyle = '#555';
    ctx.fillRect(tx + 79, y0 + 36, 2, 26);
    ctx.fillStyle = '#ffb21a';
    ctx.fillRect(tx + 74 + d.trim * 74, y0 + 38, 12, 22);
    this.label(d.trim > 0.02 ? 'NOSE UP' : d.trim < -0.02 ? 'NOSE DN' : 'NEUTRAL', tx + 80, y0 + 88, 20);

    const lamp = (x: number, text: string, on: boolean, color: string) => {
      ctx.fillStyle = on ? color : '#2c2d30';
      ctx.fillRect(x, y0 + 30, 200, 70);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y0 + 30, 200, 70);
      this.label(text, x + 100, y0 + 66, 28, on ? '#000' : '#666');
    };
    lamp(660, 'STALL', d.stall, '#ff3b2b');
    lamp(880, 'BRAKE', d.brake > 0.05, '#ffb21a');
    lamp(1100, 'GROUND', d.onGround, '#56c271');
    this.label('planr C-172', 1420, y0 + 66, 22, '#777');
  }
}
