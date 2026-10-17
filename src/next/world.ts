import * as THREE from 'three';
import type { TerrainSource } from '../engine/render/terrain';
import { scenario } from '../world/scenario';
import { terrainHeight } from '../world/terrain';

const tmp = new THREE.Color();

/** The active landscape as terrain data for the clipmap. */
export const scenarioTerrain: TerrainSource = {
  height: terrainHeight,
  color(x, z, h, ny, out) {
    scenario().color(x, z, h, ny, tmp);
    // three.js colours are linear; the clipmap stores sRGB (better precision in 8 bits)
    tmp.convertLinearToSRGB();
    out[0] = tmp.r;
    out[1] = tmp.g;
    out[2] = tmp.b;
  },
};

/** Spacing of the finest clipmap level: the physics samples the same grid. */
export const GROUND_STEP = 4;

/**
 * Solid ground for the physics: exactly the rendered finest terrain level (same 4 m grid and the same
 * triangle diagonal), plus obstacles such as building roofs.
 */
export function groundHeight(x: number, z: number): number {
  const gx = x / GROUND_STEP;
  const gz = z / GROUND_STEP;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const x0 = i * GROUND_STEP;
  const z0 = j * GROUND_STEP;
  const ha = terrainHeight(x0, z0);
  const hb = terrainHeight(x0 + GROUND_STEP, z0);
  const hc = terrainHeight(x0, z0 + GROUND_STEP);
  const hd = terrainHeight(x0 + GROUND_STEP, z0 + GROUND_STEP);
  // cells are split along a → d (see the clipmap index buffer)
  const h = fz >= fx ? ha + (hd - hc) * fx + (hc - ha) * fz : ha + (hb - ha) * fx + (hd - hb) * fz;
  const obstacle = scenario().obstacleHeight;
  return obstacle ? Math.max(h, obstacle(x, z)) : h;
}
