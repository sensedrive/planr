import * as THREE from 'three';
import { mulberry32 } from '../world/noise';

/** Small procedural textures for cockpit materials (generated once, cached). */

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, base: string, amount: number, spread: number, seed: number): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(seed);
  for (let i = 0; i < amount; i++) {
    const v = (rand() - 0.5) * spread;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/** Woven seat/headliner fabric. */
export function fabric(color: string, seed = 1): THREE.CanvasTexture {
  return canvasTexture(
    `fabric-${color}`,
    128,
    (ctx, s) => {
      speckle(ctx, s, color, 2600, 0.22, seed);
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < s; i += 3) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, i, s, 1);
        ctx.fillRect(i, 0, 1, s);
      }
      ctx.globalAlpha = 1;
    },
    4,
  );
}

export function carpet(): THREE.CanvasTexture {
  return canvasTexture('carpet', 128, (ctx, s) => speckle(ctx, s, '#34312e', 6000, 0.35, 7), 6);
}

/** Fine-grained moulded plastic. */
export function plastic(color: string): THREE.CanvasTexture {
  return canvasTexture(`plastic-${color}`, 64, (ctx, s) => speckle(ctx, s, color, 900, 0.08, 3), 8);
}

/** Yellow/black warning stripes (ejection handle). */
export function stripes(): THREE.CanvasTexture {
  return canvasTexture('stripes', 64, (ctx, s) => {
    ctx.fillStyle = '#f2c414';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#111';
    for (let i = -s; i < s * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 8, 0);
      ctx.lineTo(i + 8 + s, s);
      ctx.lineTo(i + s, s);
      ctx.fill();
    }
  });
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number, r = 5): void {
  ctx.fillStyle = '#1a1b1d';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#55585d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y);
  ctx.lineTo(x + r * 0.6, y);
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 13, color = '#d8d8d8'): void {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function smallGauge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, title: string, needle: number): void {
  ctx.fillStyle = '#0d0e10';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4d52';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#2fb34a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r - 6, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(needle) * (r - 8), y + Math.sin(needle) * (r - 8));
  ctx.stroke();
  label(ctx, title, x, y + r * 0.45, Math.max(9, r * 0.28), '#aaa');
}

function toggle(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, up: boolean): void {
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(x - 9, y - 14, 18, 28);
  ctx.fillStyle = '#c9c9c9';
  ctx.fillRect(x - 3, up ? y - 13 : y, 6, 13);
  label(ctx, name, x, y + 25, 11, '#cfcfcf');
}

/**
 * Static instrument panel artwork for a panel face mapped onto a 1024 × 512 canvas
 * (top = glareshield edge). The dynamic six-pack and status line cover px columns
 * `sixFrom`–`sixTo` and rows 40–355; extras go into the free space right of it and the switch row below.
 */
export function panelArt(jet: boolean, sixFrom: number, sixTo: number): THREE.CanvasTexture {
  return canvasTexture(`panel-${jet}-${sixFrom}-${sixTo}`, 1024, (ctx, s) => {
    const W = s;
    const H = s / 2;
    const base = jet ? '#2b2f33' : '#3a3c40';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, s);
    const rand = mulberry32(jet ? 11 : 12);
    for (let i = 0; i < 9000; i++) {
      const v = (rand() - 0.5) * 0.08;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(rand() * W, rand() * H, 2, 2);
    }
    const plate = (x: number, y: number, w: number, h: number) => {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      for (const [sx, sy] of [
        [x + 10, y + 10],
        [x + w - 10, y + 10],
        [x + 10, y + h - 10],
        [x + w - 10, y + h - 10],
      ])
        screw(ctx, sx, sy);
    };
    plate(Math.max(4, sixFrom - 14), 28, sixTo - sixFrom + 28, 340);

    const free = W - 8 - (sixTo + 18);
    if (free > 180) {
      const x0 = sixTo + 18;
      plate(x0, 28, free, 340);
      if (!jet) {
        const radio = (y: number, name: string, a: string, b: string) => {
          ctx.fillStyle = '#141516';
          ctx.fillRect(x0 + 12, y, free - 24, 56);
          ctx.fillStyle = '#081a0c';
          ctx.fillRect(x0 + 30, y + 14, free - 60, 30);
          ctx.fillStyle = '#4dff7a';
          ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${a}  ${b}`, x0 + free / 2, y + 30);
          label(ctx, name, x0 + 40, y + 7, 10, '#9a9a9a');
        };
        radio(45, 'COM1', '118.30', '121.50');
        radio(108, 'NAV1', '110.50', '113.90');
        radio(171, 'XPDR', '1200', 'ALT');
        const eng = ['FUEL L', 'FUEL R', 'OIL T', 'OIL P'];
        eng.forEach((t, i) => smallGauge(ctx, x0 + 42 + i * ((free - 60) / 4) + 8, 290, Math.min(34, (free - 60) / 8), t, Math.PI * (1.2 + rand() * 0.3)));
      }
    }
    // switch row under the gauges (and jet annunciators)
    plate(10, 372, W - 20, 132);
    if (!jet) {
      const switches = ['MASTER', 'FUEL P', 'BCN', 'LAND', 'TAXI', 'NAV', 'STROBE', 'PITOT'];
      switches.forEach((n, i) => toggle(ctx, 60 + i * 64, 420, n, i < 3));
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(640, 425, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(633, 406, 14, 24);
      label(ctx, 'OFF R L BOTH START', 640, 468, 11, '#bbb');
      label(ctx, 'NO INTENTIONAL SPINS', 850, 425, 13, '#d0d0d0');
    } else {
      const ann = ['FIRE', 'GEN', 'FUEL', 'HYD', 'OIL', 'GEAR', 'CANOPY', 'START'];
      ann.forEach((t, i) => {
        const x = 24 + i * 124;
        ctx.fillStyle = i === 5 ? '#163a19' : '#2a1414';
        ctx.fillRect(x, 392, 112, 40);
        label(ctx, t, x + 56, 412, 15, i === 5 ? '#6ad37a' : '#a35050');
      });
      const switches = ['BAT', 'GEN', 'PUMP', 'IGN', 'NAV', 'LDG', 'STRB'];
      switches.forEach((n, i) => toggle(ctx, 70 + i * 120, 462, n, i < 3));
      label(ctx, 'EJECTION SEAT ARMED', 900, 470, 14, '#ff6a3a');
    }
  });
}
