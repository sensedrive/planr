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
  fps: number;
  trimRoll: number;
  trimYaw: number;
  /** landing gear position 0…1, or null for fixed gear */
  gear: number | null;
}

export interface InstrumentConfig {
  maxKt: number;
  greenArc: [number, number];
  yellowArc: [number, number];
  flapArc: [number, number];
  engine: 'rpm' | 'n1' | 'tq' | 'vario';
  maxRpm?: number;
  flapDegrees: number;
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

  constructor(
    width: number,
    private readonly cfg: InstrumentConfig,
  ) {
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
    this.tachometer(cx(3), cy, d.rpm, d.vsFpm);
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
    const max = this.cfg.maxKt;
    const [g0, g1] = this.cfg.greenArc;
    const [y0, y1] = this.cfg.yellowArc;
    const [f0, f1] = this.cfg.flapArc;
    const a0 = -Math.PI / 2 + 10 * DEG;
    const ang = (v: number) => a0 + (Math.min(v, max) / max) * 340 * DEG;
    this.arc(x, y, ang(f0), ang(f1), '#e8e8e8', R - 16, 6);
    this.arc(x, y, ang(g0), ang(g1), '#2fb34a');
    this.arc(x, y, ang(y0), ang(y1), '#e8c22c');
    this.arc(x, y, ang(y1), ang(y1 + max * 0.017), '#e23b2b', R - 6, 9);
    const step = max > 200 ? 50 : 20;
    this.ticks(x, y, ang(0), ang(max), max / (step / 2), 2);
    for (let v = step * 2; v < max; v += step * 2) {
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

  private tachometer(x: number, y: number, rpm: number, vsFpm = 0): void {
    if (this.cfg.engine === 'n1') return this.n1Gauge(x, y, rpm, 'N1 %');
    if (this.cfg.engine === 'tq') return this.n1Gauge(x, y, rpm, 'TORQUE %');
    if (this.cfg.engine === 'vario') return this.vario(x, y, vsFpm);
    this.bezel(x, y);
    const max = this.cfg.maxRpm ?? 3000;
    const a0 = 0.75 * Math.PI;
    const ang = (v: number) => a0 + (Math.min(v, max) / max) * 1.5 * Math.PI;
    this.arc(x, y, ang(2100), ang(2700), '#2fb34a');
    this.arc(x, y, ang(2700), ang(2740), '#e23b2b', R - 6, 9);
    this.ticks(x, y, ang(0), ang(3000), 30, 5);
    for (let v = 0; v <= max / 100; v += 5) {
      const a = ang(v * 100);
      this.label(String(v), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 20);
    }
    this.label('RPM ×100', x, y - 30, 14, '#bbb');
    this.digits(String(Math.round(rpm / 10) * 10), x, y + 50, 86);
    this.needle(x, y, ang(rpm), R - 12);
  }

  /** Glider variometer: ±5 m/s. */
  private vario(x: number, y: number, fpm: number): void {
    this.bezel(x, y);
    const ms = fpm / 196.85;
    const ang = (v: number) => Math.PI + (Math.max(-5, Math.min(5, v)) / 5) * 0.88 * Math.PI;
    this.arc(x, y, ang(0), ang(5), '#2fb34a');
    this.arc(x, y, ang(-5), ang(0), '#e8c22c');
    this.ticks(x, y, ang(-5), ang(5), 20, 2);
    for (const v of [-4, -2, 0, 2, 4]) {
      const a = ang(v);
      this.label(String(v), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 20);
    }
    this.label('VARIO m/s', x + 18, y + 40, 14, '#bbb');
    this.needle(x, y, ang(ms), R - 12);
  }

  private n1Gauge(x: number, y: number, n1: number, title = 'N1 %'): void {
    this.bezel(x, y);
    const a0 = 0.75 * Math.PI;
    const ang = (v: number) => a0 + (Math.min(v, 110) / 110) * 1.5 * Math.PI;
    this.arc(x, y, ang(55), ang(103), '#2fb34a');
    this.arc(x, y, ang(103), ang(106), '#e23b2b', R - 6, 9);
    this.ticks(x, y, ang(0), ang(110), 22, 2);
    for (let v = 0; v <= 100; v += 20) {
      const a = ang(v);
      this.label(String(v), x + Math.cos(a) * (R - 36), y + Math.sin(a) * (R - 36), 20);
    }
    this.label(title, x, y - 30, 14, '#bbb');
    this.digits(n1.toFixed(1), x, y + 50, 86);
    this.needle(x, y, ang(n1), R - 12);
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
    const fd = this.cfg.flapDegrees;
    bar(230, 'KLAPPEN', d.flaps, `${Math.round(d.flaps * fd)}° → ${Math.round(d.flapsTarget * fd)}°`, '#e8e8e8');

    // trims: three centred indicators (pitch, roll, yaw)
    const tx = 430;
    this.label('TRIMM H · Q · S', tx + 105, y0 + 18, 18, '#bbb');
    [d.trim, d.trimRoll, d.trimYaw].forEach((t, i) => {
      const ry = y0 + 34 + i * 24;
      ctx.fillStyle = '#000';
      ctx.fillRect(tx, ry, 210, 18);
      ctx.fillStyle = '#555';
      ctx.fillRect(tx + 104, ry, 2, 18);
      ctx.fillStyle = '#ffb21a';
      ctx.fillRect(tx + 99 + t * 99, ry + 2, 12, 14);
    });

    const lamp = (x: number, text: string, on: boolean, color: string) => {
      ctx.fillStyle = on ? color : '#2c2d30';
      ctx.fillRect(x, y0 + 30, 200, 70);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y0 + 30, 200, 70);
      this.label(text, x + 100, y0 + 66, 28, on ? '#000' : '#666');
    };
    lamp(670, 'STALL', d.stall, '#ff3b2b');
    lamp(885, 'BRAKE', d.brake > 0.05, '#ffb21a');
    if (d.gear === null) lamp(1100, 'GROUND', d.onGround, '#56c271');
    else lamp(1100, d.gear > 0.98 ? 'GEAR ▼' : d.gear > 0.02 ? 'GEAR ⇅' : 'GEAR ▲', d.gear > 0.02, d.gear > 0.98 ? '#56c271' : '#ff3b2b');
    this.label(`${Math.round(d.fps)} fps`, 1420, y0 + 66, 24, d.fps < 68 ? '#ff7a5a' : '#777');
  }
}
