// Renders a quick overview PNG of the NYC data (water, parks, terrain, buildings). Usage: node preview-nyc.mjs <data-dir> <out.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const dir = process.argv[2], out = process.argv[3];
const meta = JSON.parse(readFileSync(dir + '/meta.json'));
const { nx, nz } = meta.grid;
const h = new Int16Array(readFileSync(dir + '/height.i16').buffer.slice(0));
const c = readFileSync(dir + '/cover.u8');
const s = 2; const png = new PNG({ width: Math.ceil(nx / s), height: Math.ceil(nz / s) });
for (let j = 0; j < nz; j += s) for (let i = 0; i < nx; i += s) {
  const k = j * nx + i, o = ((j / s) * png.width + i / s) * 4;
  const v = h[k] / 10; let col;
  if (c[k] === 2) col = [40, 90, 150]; else if (c[k] === 1) col = [60, 150, 60]; else { const g = Math.min(255, 120 + v * 3); col = [g, g, g - 10]; }
  png.data.set([...col, 255], o);
}
// buildings as dark dots
const b = readFileSync(dir + '/buildings.bin'); let o = 4; const n = b.readUInt32LE(0);
for (let q = 0; q < n; q++) { const m = b.readUInt16LE(o); const roof = b.readInt16LE(o + 2) / 10; const x = b.readInt16LE(o + 6) / 2, z = b.readInt16LE(o + 8) / 2; o += 6 + m * 4;
  const i = Math.round((x - meta.grid.x0) / meta.grid.cell / s), j = Math.round((z - meta.grid.z0) / meta.grid.cell / s);
  if (i >= 0 && j >= 0 && i < png.width && j < png.height) { const p = (j * png.width + i) * 4; const d = roof > 100 ? [200, 30, 30] : [30, 30, 30]; png.data.set([...d, 255], p); } }
writeFileSync(out, PNG.sync.write(png));
console.log(png.width, png.height, n);
