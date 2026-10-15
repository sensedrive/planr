import * as THREE from 'three';

export interface HudData {
  pitchDeg: number;
  rollDeg: number;
  headingDeg: number;
  airspeedKt: number;
  altitudeFt: number;
  vsFpm: number;
  alphaDeg: number;
  betaDeg: number;
  gear: number;
  throttle: number;
}

const S = 512;
const GREEN = '#46ff7a';

/**
 * Head-up display on a combiner glass above the glareshield. Symbology is drawn so that angles match
 * what the pilot sees through the glass: the boresight (waterline) is the point straight ahead of the eye.
 */
export class HeadUpDisplay {
  readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly ppd: number;
  private readonly boreY: number;
  private timer = 0;

  /** `eye` and the glass centre in aircraft coordinates; `size` = glass edge length (m). */
  constructor(eye: THREE.Vector3, centre: THREE.Vector3, size: number) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const dist = eye.z - centre.z;
    this.ppd = S / 2 / ((Math.atan(size / 2 / dist) * 180) / Math.PI);
    // canvas row that lies straight ahead of the eye
    this.boreY = S / 2 - ((eye.y - centre.y) / (size / 2)) * (S / 2);

    const combiner = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 1.05, size * 1.05),
      new THREE.MeshPhongMaterial({ color: 0x88aa99, transparent: true, opacity: 0.08, shininess: 100, depthWrite: false, side: THREE.DoubleSide }),
    );
    const symbols = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    symbols.position.z = 0.001;
    symbols.renderOrder = 9;
    combiner.renderOrder = 8;
    this.group.add(combiner, symbols);
    this.group.position.copy(centre);
    // frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, 0.03, 0.05), new THREE.MeshLambertMaterial({ color: 0x222428 }));
    frame.position.set(0, -size / 2 - 0.015, 0.02);
    this.group.add(frame);
  }

  update(dt: number, d: HudData): void {
    this.timer += dt;
    if (this.timer < 1 / 30) return;
    this.timer = 0;
    const ctx = this.ctx;
    const ppd = this.ppd;
    const cx = S / 2;
    const by = this.boreY;
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = GREEN;
    ctx.fillStyle = GREEN;
    ctx.lineWidth = 2.5;
    ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';

    // pitch ladder and horizon, rotated about the boresight
    ctx.save();
    ctx.beginPath();
    ctx.rect(70, 40, S - 140, S - 100);
    ctx.clip();
    ctx.translate(cx, by);
    ctx.rotate((-d.rollDeg * Math.PI) / 180);
    for (let p = -30; p <= 30; p += 5) {
      const y = (d.pitchDeg - p) * ppd;
      if (Math.abs(y) > S) continue;
      if (p === 0) {
        ctx.beginPath();
        ctx.moveTo(-200, y);
        ctx.lineTo(-40, y);
        ctx.moveTo(40, y);
        ctx.lineTo(200, y);
        ctx.stroke();
        continue;
      }
      ctx.setLineDash(p < 0 ? [8, 6] : []);
      ctx.beginPath();
      ctx.moveTo(-90, y + (p > 0 ? 8 : -8));
      ctx.lineTo(-90, y);
      ctx.lineTo(-35, y);
      ctx.moveTo(35, y);
      ctx.lineTo(90, y);
      ctx.lineTo(90, y + (p > 0 ? 8 : -8));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(p)), -98, y);
    }
    ctx.restore();

    // waterline (aircraft reference)
    ctx.beginPath();
    ctx.moveTo(cx - 30, by);
    ctx.lineTo(cx - 12, by);
    ctx.lineTo(cx - 6, by + 8);
    ctx.lineTo(cx, by);
    ctx.lineTo(cx + 6, by + 8);
    ctx.lineTo(cx + 12, by);
    ctx.lineTo(cx + 30, by);
    ctx.stroke();

    // flight path marker: where the aircraft is actually going
    const fx = cx + d.betaDeg * ppd;
    const fy = by + d.alphaDeg * ppd;
    ctx.beginPath();
    ctx.arc(fx, fy, 9, 0, Math.PI * 2);
    ctx.moveTo(fx - 22, fy);
    ctx.lineTo(fx - 9, fy);
    ctx.moveTo(fx + 9, fy);
    ctx.lineTo(fx + 22, fy);
    ctx.moveTo(fx, fy - 9);
    ctx.lineTo(fx, fy - 18);
    ctx.stroke();

    // airspeed and altitude boxes
    const boxText = (x: number, text: string, align: CanvasTextAlign) => {
      ctx.strokeRect(x, by - 18, 90, 36);
      ctx.textAlign = align;
      ctx.fillText(text, align === 'right' ? x + 84 : x + 6, by + 1);
    };
    boxText(10, String(Math.round(d.airspeedKt)), 'right');
    boxText(S - 100, String(Math.round(d.altitudeFt / 10) * 10), 'right');
    ctx.font = 'bold 15px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('KT', 14, by + 32);
    ctx.fillText(`${d.vsFpm >= 0 ? '+' : ''}${Math.round(d.vsFpm / 10) * 10}`, S - 96, by + 32);
    ctx.fillText(`α ${d.alphaDeg.toFixed(1)}`, 14, by + 54);
    ctx.fillText(`THR ${Math.round(d.throttle * 100)}`, 14, by - 36);
    if (d.gear > 0.02) ctx.fillText(d.gear > 0.98 ? 'GEAR DN' : 'GEAR ⇅', S - 96, by - 36);

    // heading tape at the bottom
    ctx.font = 'bold 16px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const ty = S - 34;
    for (let h = Math.floor(d.headingDeg / 5) * 5 - 30; h <= d.headingDeg + 30; h += 5) {
      const x = cx + (h - d.headingDeg) * 5;
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x, ty - (h % 10 === 0 ? 12 : 6));
      ctx.stroke();
      if (h % 10 === 0) ctx.fillText(String(((h % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), x, ty + 14);
    }
    ctx.beginPath();
    ctx.moveTo(cx, ty - 16);
    ctx.lineTo(cx - 6, ty - 26);
    ctx.lineTo(cx + 6, ty - 26);
    ctx.closePath();
    ctx.fill();
    this.tex.needsUpdate = true;
  }
}
