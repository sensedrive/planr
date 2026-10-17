import type { Device, Program, Texture } from '../gl/device';
import { terrainFS, terrainShadowFS, terrainVS } from '../shaders/terrain';

/** Where the terrain data comes from (the active landscape). */
export interface TerrainSource {
  /** ground height (m), negative under water */
  height(x: number, z: number): number;
  /** albedo (sRGB 0…1) for a ground point with normal.y = ny */
  color(x: number, z: number, h: number, ny: number, out: [number, number, number]): void;
}

/** cells per level side; even, divisible by 4 */
export const CELLS = 248;
const VERTS = CELLS + 1;
/** extra samples around each level (normals and morphing look one or two texels outwards) */
const MARGIN = 2;
const TEX = 256;
const WINDOW = VERTS + 2 * MARGIN;

interface Level {
  spacing: number;
  /** grid index (in this level's spacing) of the centre whose data is complete */
  cx: number;
  cz: number;
  valid: boolean;
  heights: Float32Array;
  colors: Uint8Array;
}

/**
 * Geometry clipmap. Level i has spacing `finest · 2^i`; all levels share one vertex grid. Levels
 * follow the camera in steps of two cells so every coarser ring stays aligned with the finer one,
 * whose footprint is cut out of it by one of nine pre-built index buffers.
 */
export class TerrainClipmap {
  readonly levels: Level[] = [];
  readonly heightTex: Texture;
  readonly colorTex: Texture;
  source: TerrainSource | null = null;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fullIndex: WebGLBuffer;
  private readonly fullCount: number;
  private readonly ringIndex: WebGLBuffer[] = [];
  private readonly ringCount: number[] = [];
  private readonly colBuf = new Float32Array(TEX);
  private readonly colRgba = new Uint8Array(TEX * 4);
  private readonly rgb: [number, number, number] = [0, 0, 0];
  /** height samples computed this frame (budget) */
  private spent = 0;

  constructor(
    private readonly dev: Device,
    count = 9,
    readonly finest = 4,
  ) {
    const gl = dev.gl;
    for (let i = 0; i < count; i++)
      this.levels.push({ spacing: finest * 2 ** i, cx: 0, cz: 0, valid: false, heights: new Float32Array(TEX * TEX), colors: new Uint8Array(TEX * TEX * 4) });
    this.heightTex = dev.textureArray({ width: TEX, height: TEX, layers: count, format: gl.R32F, filter: 'nearest', wrap: 'repeat' });
    this.colorTex = dev.textureArray({ width: TEX, height: TEX, layers: count, format: gl.RGBA8, filter: 'linear', wrap: 'repeat' });

    const verts = new Uint8Array(VERTS * VERTS * 2);
    for (let z = 0, k = 0; z < VERTS; z++)
      for (let x = 0; x < VERTS; x++) {
        verts[k++] = x;
        verts[k++] = z;
      }
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    dev.buffer(gl.ARRAY_BUFFER, verts);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.bindVertexArray(null);

    const full = cellIndices(() => true);
    this.fullIndex = dev.buffer(gl.ELEMENT_ARRAY_BUFFER, full);
    this.fullCount = full.length;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const hx = CELLS / 4 + dx;
        const hz = CELLS / 4 + dz;
        const idx = cellIndices((x, z) => x < hx || x >= hx + CELLS / 2 || z < hz || z >= hz + CELLS / 2);
        this.ringIndex.push(dev.buffer(gl.ELEMENT_ARRAY_BUFFER, idx));
        this.ringCount.push(idx.length);
      }
  }

  /** Forgets all data (new landscape). */
  reset(source: TerrainSource): void {
    this.source = source;
    for (const l of this.levels) l.valid = false;
  }

  /** Desired (even) centre of level `i` for a camera at x/z. */
  private target(i: number, x: number, z: number): [number, number] {
    const s = this.levels[i].spacing * 2;
    return [Math.round(x / s) * 2, Math.round(z / s) * 2];
  }

  /**
   * Moves levels towards the camera, spending at most `budget` height samples (Infinity: complete
   * everything now). Finer levels go first; a level only moves while the ring below stays nested.
   */
  update(x: number, z: number, budget = 6000): void {
    if (!this.source) return;
    this.spent = 0;
    // levels never filled are rebuilt completely, coarse first so something is always drawn
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const l = this.levels[i];
      if (l.valid) continue;
      [l.cx, l.cz] = this.target(i, x, z);
      this.fill(i);
      l.valid = true;
      if (this.spent > budget && budget !== Infinity) break;
    }
    for (let guard = 0; guard < 64 && this.spent < budget; guard++) {
      let moved = false;
      for (let i = 0; i < this.levels.length && this.spent < budget; i++) {
        const l = this.levels[i];
        if (!l.valid) continue;
        const [tx, tz] = this.target(i, x, z);
        if (tx === l.cx && tz === l.cz) continue;
        const sx = Math.sign(tx - l.cx) * 2;
        const sz = Math.sign(tz - l.cz) * 2;
        if (sx && this.canMove(i, l.cx + sx, l.cz)) {
          this.shift(i, sx, 0);
          moved = true;
        } else if (sz && this.canMove(i, l.cx, l.cz + sz)) {
          this.shift(i, 0, sz);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /** The finer ring must sit within ±1 coarse cell of the coarse ring's centre (nine hole variants). */
  private canMove(i: number, cx: number, cz: number): boolean {
    const fine = this.levels[i - 1];
    const coarse = this.levels[i + 1];
    if (fine?.valid && (Math.abs(fine.cx / 2 - cx) > 1 || Math.abs(fine.cz / 2 - cz) > 1)) return false;
    if (coarse?.valid && (Math.abs(cx / 2 - coarse.cx) > 1 || Math.abs(cz / 2 - coarse.cz) > 1)) return false;
    return true;
  }

  private gridMin(l: Level): [number, number] {
    return [l.cx - CELLS / 2, l.cz - CELLS / 2];
  }

  /** Computes the whole data window of a level. */
  private fill(i: number): void {
    const l = this.levels[i];
    const [gx0, gz0] = this.gridMin(l);
    for (let k = 0; k < WINDOW; k++) this.sampleColumnHeights(l, gx0 - MARGIN + k, gz0 - MARGIN, WINDOW);
    for (let k = 0; k < WINDOW; k++) this.sampleColumnColors(l, gx0 - MARGIN + k, gz0 - MARGIN, WINDOW);
    this.dev.gl.bindTexture(this.heightTex.target, this.heightTex.handle);
    this.heightTex.upload(l.heights, i);
    this.colorTex.upload(l.colors, i);
  }

  /** Moves a level by two cells along one axis and refreshes the uncovered strip. */
  private shift(i: number, sx: number, sz: number): void {
    const l = this.levels[i];
    l.cx += sx;
    l.cz += sz;
    const [gx0, gz0] = this.gridMin(l);
    const lo = -MARGIN;
    const hi = CELLS + MARGIN;
    if (sx) {
      // new columns on the leading edge (and the one behind, whose normals now have both neighbours)
      const cols = sx > 0 ? [hi - 1, hi, hi - 2] : [lo + 1, lo, lo + 2];
      for (const c of cols.slice(0, 2)) this.sampleColumnHeights(l, gx0 + c, gz0 + lo, WINDOW);
      for (const c of cols) {
        this.sampleColumnColors(l, gx0 + c, gz0 + lo, WINDOW);
        this.uploadColumn(i, gx0 + c);
      }
    } else {
      const rows = sz > 0 ? [hi - 1, hi, hi - 2] : [lo + 1, lo, lo + 2];
      for (const r of rows.slice(0, 2)) this.sampleRowHeights(l, gx0 + lo, gz0 + r, WINDOW);
      for (const r of rows) {
        this.sampleRowColors(l, gx0 + lo, gz0 + r, WINDOW);
        this.uploadRow(i, gz0 + r);
      }
    }
  }

  private sampleColumnHeights(l: Level, gx: number, gz0: number, n: number): void {
    const src = this.source!;
    const s = l.spacing;
    const tx = mod(gx);
    for (let k = 0; k < n; k++) {
      const gz = gz0 + k;
      l.heights[mod(gz) * TEX + tx] = src.height(gx * s, gz * s);
    }
    this.spent += n;
  }

  private sampleRowHeights(l: Level, gx0: number, gz: number, n: number): void {
    const src = this.source!;
    const s = l.spacing;
    const row = mod(gz) * TEX;
    for (let k = 0; k < n; k++) {
      const gx = gx0 + k;
      l.heights[row + mod(gx)] = src.height(gx * s, gz * s);
    }
    this.spent += n;
  }

  private colorAt(l: Level, gx: number, gz: number): void {
    const H = l.heights;
    const s = l.spacing;
    const h = H[mod(gz) * TEX + mod(gx)];
    // slope for the colours over ~16 m, like the landscapes were designed for (finer bumps would
    // speckle rock and field patches)
    const k = Math.max(1, Math.round(16 / s));
    const dx = H[mod(gz) * TEX + mod(gx + k)] - H[mod(gz) * TEX + mod(gx - k)];
    const dz = H[mod(gz + k) * TEX + mod(gx)] - H[mod(gz - k) * TEX + mod(gx)];
    const ny = (2 * k * s) / Math.hypot(dx, 2 * k * s, dz);
    const c = this.rgb;
    this.source!.color(gx * s, gz * s, h, ny, c);
    const o = (mod(gz) * TEX + mod(gx)) * 4;
    l.colors[o] = Math.min(255, c[0] * 255);
    l.colors[o + 1] = Math.min(255, c[1] * 255);
    l.colors[o + 2] = Math.min(255, c[2] * 255);
    l.colors[o + 3] = 255;
  }

  private sampleColumnColors(l: Level, gx: number, gz0: number, n: number): void {
    for (let k = 0; k < n; k++) this.colorAt(l, gx, gz0 + k);
  }

  private sampleRowColors(l: Level, gx0: number, gz: number, n: number): void {
    for (let k = 0; k < n; k++) this.colorAt(l, gx0 + k, gz);
  }

  private uploadColumn(i: number, gx: number): void {
    const l = this.levels[i];
    const tx = mod(gx);
    for (let y = 0; y < TEX; y++) {
      this.colBuf[y] = l.heights[y * TEX + tx];
      const o = (y * TEX + tx) * 4;
      this.colRgba[y * 4] = l.colors[o];
      this.colRgba[y * 4 + 1] = l.colors[o + 1];
      this.colRgba[y * 4 + 2] = l.colors[o + 2];
      this.colRgba[y * 4 + 3] = 255;
    }
    this.heightTex.upload(this.colBuf, i, tx, 0, 1, TEX);
    this.colorTex.upload(this.colRgba, i, tx, 0, 1, TEX);
  }

  private uploadRow(i: number, gz: number): void {
    const l = this.levels[i];
    const ty = mod(gz);
    this.heightTex.upload(l.heights.subarray(ty * TEX, ty * TEX + TEX), i, 0, ty, TEX, 1);
    this.colorTex.upload(l.colors.subarray(ty * TEX * 4, (ty * TEX + TEX) * 4), i, 0, ty, TEX, 1);
  }

  /** Height from the clipmap data (finest level that covers the point), bilinear. */
  sampledHeight(x: number, z: number): number | null {
    for (const l of this.levels) {
      if (!l.valid) continue;
      const gx = x / l.spacing;
      const gz = z / l.spacing;
      const [mx, mz] = this.gridMin(l);
      if (gx < mx || gz < mz || gx > mx + CELLS || gz > mz + CELLS) continue;
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      const fx = gx - ix;
      const fz = gz - iz;
      const H = l.heights;
      const a = H[mod(iz) * TEX + mod(ix)];
      const b = H[mod(iz) * TEX + mod(ix + 1)];
      const c = H[mod(iz + 1) * TEX + mod(ix)];
      const d = H[mod(iz + 1) * TEX + mod(ix + 1)];
      return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    }
    return null;
  }

  /**
   * Draws all levels. `origin` is the floating origin (world metres), `cam` the camera world
   * position (for geomorphing), `bind` sets per-pass uniforms on the program.
   */
  draw(p: Program, origin: ArrayLike<number>, cam: ArrayLike<number>, minLevel = 0): void {
    const gl = this.dev.gl;
    gl.bindVertexArray(this.vao);
    p.tex('u_height', this.heightTex).tex('u_color', this.colorTex).f1('u_cells', CELLS);
    const n = this.levels.length;
    for (let i = n - 1; i >= minLevel; i--) {
      const l = this.levels[i];
      if (!l.valid) continue;
      const [mx, mz] = this.gridMin(l);
      const s = l.spacing;
      p.f1('u_level', i)
        .f1('u_spacing', s)
        .f2('u_cornerRel', mx * s - origin[0], mz * s - origin[2])
        .f2('u_camGrid', cam[0] / s - mx, cam[2] / s - mz);
      gl.uniform2i(p.loc('u_texOffset'), mod(mx), mod(mz));
      const coarse = this.levels[i + 1];
      if (coarse?.valid) {
        const [cx, cz] = this.gridMin(coarse);
        p.f2('u_coarseOffset', mx / 2 - cx + mod(cx), mz / 2 - cz + mod(cz));
      } else p.f2('u_coarseOffset', mod(mx / 2), mod(mz / 2));
      const fine = this.levels[i - 1];
      if (i > minLevel && fine?.valid) {
        const dx = fine.cx / 2 - l.cx;
        const dz = fine.cz / 2 - l.cz;
        const v = (dz + 1) * 3 + (dx + 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ringIndex[v]);
        gl.drawElements(gl.TRIANGLES, this.ringCount[v], gl.UNSIGNED_SHORT, 0);
      } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fullIndex);
        gl.drawElements(gl.TRIANGLES, this.fullCount, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  programs(defines: Record<string, string | number | boolean | undefined>): { main: Program; shadow: Program } {
    return {
      main: this.dev.program('terrain', terrainVS, terrainFS, defines),
      shadow: this.dev.program('terrain-shadow', terrainVS, terrainShadowFS, { REVERSED_Z: defines.REVERSED_Z }),
    };
  }
}

const mod = (v: number) => ((v % TEX) + TEX) % TEX;

/** Two triangles per kept cell, always split along the same diagonal (see the morph in the shader). */
function cellIndices(keep: (x: number, z: number) => boolean): Uint16Array {
  const out: number[] = [];
  for (let z = 0; z < CELLS; z++)
    for (let x = 0; x < CELLS; x++) {
      if (!keep(x, z)) continue;
      const a = z * VERTS + x;
      const b = a + 1;
      const c = a + VERTS;
      const d = c + 1;
      // counter-clockwise seen from above (+Y): a → c → d, a → d → b
      out.push(a, c, d, a, d, b);
    }
  return new Uint16Array(out);
}
