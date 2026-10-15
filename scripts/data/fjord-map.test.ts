import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { it } from 'vitest';
import { setScenario } from '../../src/world/scenario';
import { terrainHeight } from '../../src/world/terrain';
import { createFjord } from '../../src/world/scenarios/fjord';

// Dev aid: renders a top-down map of the fjord scenario. MAP_PREVIEW=out.png npx vitest run scripts/data/fjord-map.test.ts
it.runIf(process.env.MAP_PREVIEW)('fjord map', () => {
  const s = createFjord();
  setScenario(s);
  const W = 500, R = 12000, png = new PNG({ width: W, height: W });
  const c = new THREE.Color();
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = -R + (i / W) * 2 * R, z = -R + (j / W) * 2 * R;
    const h = terrainHeight(x, z);
    const ny = 2 * 48 / Math.hypot(terrainHeight(x - 48, z) - terrainHeight(x + 48, z), 2 * 48, terrainHeight(x, z - 48) - terrainHeight(x, z + 48));
    if (h < 0) c.setRGB(0.12, 0.3, 0.38); else s.color(x, z, h, ny, c);
    png.data.set([c.r * 255, c.g * 255, c.b * 255, 255], (j * W + i) * 4);
  }
  for (const a of s.airports) {
    const i = Math.round(((a.center.x + R) / (2 * R)) * W), j = Math.round(((a.center.z + R) / (2 * R)) * W);
    for (let d = -4; d <= 4; d++) for (const [di, dj] of [[d, 0], [0, d]]) png.data.set([255, 0, 0, 255], ((j + dj) * W + i + di) * 4);
  }
  writeFileSync(process.env.MAP_PREVIEW!, PNG.sync.write(png));
  console.log(s.airports.map((a) => [a.name, Math.round(a.center.x), Math.round(a.center.z), Math.round(a.heading)]));
});
