import * as THREE from 'three';
import { BLOCK, type Defines, Device, type Program, renderbuffer, Target, type Texture, UniformBuffer } from '../gl/device';
import { type Fov, invert, lookDir, multiply, ortho, projection } from '../math';
import { atmosphereCommon, atmosphereLookup } from '../shaders/atmosphere';
import { cloudDensity, cloudLookup, cloudShadowLookup } from '../shaders/clouds';
import { FRAME, frame, fullscreenVS, noise, output, tonemap } from '../shaders/common';
import { lighting, shadows } from '../shaders/lighting';
import { compositeFS, downFS, upFS, visionFS, visionVS } from '../shaders/post';
import { skyFS, skyVS } from '../shaders/sky';
import { waterFS, waterVS } from '../shaders/water';
import { Atmosphere, type AtmosphereState } from './atmosphere';
import { type CloudSettings, Clouds } from './clouds';
import { MeshRenderer } from './meshes';
import { TerrainClipmap } from './terrain';

/** One eye (or the desktop camera): world pose and frustum. */
export interface ViewInput {
  /** camera-to-world transform in world metres (column-major, float64) */
  matrix: ArrayLike<number>;
  fov: Fov;
}

export interface Environment {
  /** unit vector towards the sun or, at night, the moon */
  lightDir: [number, number, number];
  /** 0 day … 1 night (moonlight) */
  night: number;
  overcast: number;
  rain: number;
  visibility: number;
  cloudBase: number;
  cloudTop: number;
  coverage: number;
  waterColor: [number, number, number];
  waves: number;
  /** extra exposure factor (1 = automatic) */
  exposure: number;
}

export interface VisionEffects {
  /** comfort vignette 0…1 */
  comfort: number;
  blackout: number;
  redout: number;
}

/** Where a frame goes. */
export type Output =
  | { kind: 'canvas'; width: number; height: number }
  | {
      kind: 'xr-multiview';
      /** the XR layer's colour texture array (two layers) */
      color: WebGLTexture;
      width: number;
      height: number;
    }
  | { kind: 'xr-views'; framebuffer: WebGLFramebuffer | null; viewports: [number, number, number, number][] };

interface ScenePrograms {
  terrain: Program;
  terrainShadow: Program;
  water: Program;
  sky: Program;
  vision: Program;
  clouds: Program;
  mesh: { plain: Program; instanced: Program };
  meshShadow: { plain: Program; instanced: Program };
}

const SUN_ILLUMINANCE = 10;
const MOON_ILLUMINANCE = 10 / 1500;
const CASCADES = [14, 120, 1100];

export class Renderer {
  readonly dev: Device;
  readonly gl: WebGL2RenderingContext;
  readonly atmosphere: Atmosphere;
  readonly terrain: TerrainClipmap;
  readonly meshes: MeshRenderer;
  readonly clouds: Clouds;
  cloudsEnabled = true;
  cloudDesktop: CloudSettings = { scale: 0.5, steps: 56, lightSteps: 5, range: 45000 };
  cloudXR: CloudSettings = { scale: 0.3, steps: 22, lightSteps: 3, range: 25000 };
  /** accumulated cloud drift (m) */
  private readonly drift = [0, 0];
  readonly frameUbo: UniformBuffer;
  private readonly shadowUbo: UniformBuffer;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly waterVao: WebGLVertexArrayObject;
  private readonly waterCount: number;
  private readonly programs = new Map<string, ScenePrograms>();
  private readonly shadowMap: Texture;
  private readonly shadowTargets: Target[] = [];
  private readonly terrainShadow: Texture;
  private readonly terrainShadowTarget: Target;
  private readonly terrainShadowMat = new Float32Array(16);
  private terrainShadowKey = '';
  private readonly shadowMats: Float32Array[] = [0, 1, 2].map(() => new Float32Array(16));
  /** world position (metres, float64) all GPU coordinates are relative to */
  readonly origin = new Float64Array(3);
  private hdr: { w: number; h: number; samples: number; msaa: Target; resolved: Target; color: Texture; bloom: { tex: Texture; t: Target }[] } | null = null;
  private xrTargets = new Map<WebGLTexture, { fb: WebGLFramebuffer; depth: WebGLTexture }>();
  private readonly post: { down: Program; up: Program; composite: Program };
  shadowsEnabled = true;
  shadowSize: number;
  /** terrain samples the clipmap may compute per frame */
  terrainBudget = 6000;
  time = 0;
  /** seconds since the last frame (cloud drift) */
  frameDt = 0;
  readonly stats = { draws: 0 };

  constructor(canvas: HTMLCanvasElement) {
    const dev = new Device(canvas);
    this.dev = dev;
    const gl = dev.gl;
    this.gl = gl;
    dev.addInclude('frame', frame);
    dev.addInclude('tonemap', tonemap);
    dev.addInclude('output', output);
    dev.addInclude('noise', noise);
    dev.addInclude('atmosphere-common', atmosphereCommon);
    dev.addInclude('atmosphere-lookup', atmosphereLookup);
    dev.addInclude('shadows', shadows);
    dev.addInclude('lighting', lighting);
    dev.addInclude('clouds', cloudLookup);
    dev.addInclude('cloud-density', cloudDensity);
    dev.addInclude('cloud-shadow', cloudShadowLookup);

    this.frameUbo = new UniformBuffer(gl, FRAME.size, BLOCK.frame);
    this.shadowUbo = new UniformBuffer(gl, FRAME.size, BLOCK.frame);
    this.emptyVao = gl.createVertexArray()!;
    this.atmosphere = new Atmosphere(dev);
    this.terrain = new TerrainClipmap(dev);
    this.meshes = new MeshRenderer(dev);
    this.clouds = new Clouds(dev);

    this.shadowSize = 2048;
    this.shadowMap = dev.textureArray({ width: this.shadowSize, height: this.shadowSize, layers: 3, format: gl.DEPTH_COMPONENT32F, compare: true });
    for (let i = 0; i < 3; i++) this.shadowTargets.push(new Target(dev, this.shadowSize, this.shadowSize, [], this.shadowMap, i));
    this.terrainShadow = dev.texture2D({ width: 2048, height: 2048, format: gl.DEPTH_COMPONENT32F, compare: true });
    this.terrainShadowTarget = new Target(dev, 2048, 2048, [], this.terrainShadow);

    // sea: rings of exponentially growing radius around the camera
    const rings = 56;
    const segs = 96;
    const pos: number[] = [0, 0];
    for (let r = 1; r <= rings; r++) {
      const rad = 4 * (Math.pow(1.21, r) - 1);
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, Math.sin(a) * rad);
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let r = 1; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = 1 + (r - 1) * segs + s;
        const b = 1 + (r - 1) * segs + ((s + 1) % segs);
        const c = a + segs;
        const d = b + segs;
        idx.push(a, b, d, a, d, c);
      }
    this.waterVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.waterVao);
    dev.buffer(gl.ARRAY_BUFFER, new Float32Array(pos));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    dev.buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx));
    gl.bindVertexArray(null);
    this.waterCount = idx.length;

    this.post = {
      down: dev.program('post-down', fullscreenVS, downFS),
      up: dev.program('post-up', fullscreenVS, upFS),
      composite: dev.program('post-composite', fullscreenVS, compositeFS),
    };
  }

  /** Scene programs for an output variant (compiled on first use). */
  private scenePrograms(multiview: boolean, inline: boolean): ScenePrograms {
    const key = `${multiview}|${inline}`;
    let p = this.programs.get(key);
    if (!p) {
      const defines: Defines = { MULTIVIEW: multiview || undefined, INLINE_TONEMAP: inline || undefined, REVERSED_Z: this.dev.caps.clipControl || undefined };
      const t = this.terrain.programs(defines);
      const m = this.meshes.programs(defines);
      p = {
        terrain: t.main,
        terrainShadow: t.shadow,
        water: this.dev.program('water', waterVS, waterFS, defines),
        sky: this.dev.program('sky', skyVS, skyFS, defines),
        vision: this.dev.program('vision', visionVS, visionFS, defines),
        clouds: this.clouds.programs({ MULTIVIEW: defines.MULTIVIEW, REVERSED_Z: defines.REVERSED_Z }),
        mesh: { plain: m.plain, instanced: m.instanced },
        meshShadow: { plain: m.shadow, instanced: m.shadowInstanced },
      };
      this.programs.set(key, p);
    }
    return p;
  }

  /** Compiles every program variant now (avoids hitches on first use). */
  warmUp(multiview: boolean, inline: boolean): void {
    this.scenePrograms(multiview, inline);
  }

  // ---- per-frame ------------------------------------------------------------------------------

  render(views: ViewInput[], env: Environment, roots: THREE.Object3D[], out: Output, vision: VisionEffects = { comfort: 0, blackout: 0, redout: 0 }): void {
    const gl = this.gl;
    const reversed = this.dev.caps.clipControl;
    this.stats.draws = 0;

    // floating origin: the centre between the eyes
    this.origin.fill(0);
    this.drift[0] += 6 * this.frameDt;
    this.drift[1] += 2.5 * this.frameDt;
    for (const v of views) for (let k = 0; k < 3; k++) this.origin[k] += v.matrix[12 + k] / views.length;
    const o = this.origin;
    const camWorld = new THREE.Vector3(o[0], o[1], o[2]);

    // ---- environment ---------------------------------------------------------------------------
    const L = env.lightDir;
    const night = env.night;
    const E = night > 0.5 ? MOON_ILLUMINANCE : SUN_ILLUMINANCE;
    const atm: AtmosphereState = {
      visibility: env.visibility,
      fog: env.rain * 0.8 + env.overcast * 0.2,
      cloudBase: env.overcast > 0.5 ? env.cloudBase : 1e6,
      cloudLight: 1 - env.overcast * 0.85,
    };
    // the eye adapts: brighter scenes are exposed down (sun elevation drives the daylight level)
    const daylight = Math.max(0.02, Math.min(1, (L[1] + 0.05) * 3)) * (1 - env.overcast * 0.6);
    const exposure = (night > 0.5 ? 0.85 / MOON_ILLUMINANCE : 6 / (SUN_ILLUMINANCE * (0.3 + 0.7 * daylight))) * env.exposure;

    // ---- terrain data ----------------------------------------------------------------------------
    this.terrain.update(o[0], o[2], this.terrainBudget);

    // ---- frame uniforms ----------------------------------------------------------------------------
    const f = this.frameUbo.data;
    f.fill(0);
    const vp = new Float64Array(16);
    const tmpA = new Float64Array(16);
    const tmpB = new Float64Array(16);
    const near = 0.05;
    for (let i = 0; i < 2; i++) {
      const v = views[Math.min(i, views.length - 1)];
      viewProjection(vp, v, o, near, reversed, tmpA, tmpB);
      f.set(vp, FRAME.viewProj + i * 16);
      invert(tmpA, vp);
      f.set(tmpA, FRAME.invViewProj + i * 16);
      f[FRAME.eye + i * 4] = v.matrix[12] - o[0];
      f[FRAME.eye + i * 4 + 1] = v.matrix[13] - o[1];
      f[FRAME.eye + i * 4 + 2] = v.matrix[14] - o[2];
    }
    f.set([L[0], L[1], L[2], 1], FRAME.sunDir);
    f.set([E, E, E, exposure], FRAME.sunColor);
    f.set([0.0006 * SUN_ILLUMINANCE * 0.001, 0.0008 * SUN_ILLUMINANCE * 0.001, 0.0014 * SUN_ILLUMINANCE * 0.001, this.time], FRAME.ambient);
    f.set([mod4096(o[0]), mod4096(o[1]), mod4096(o[2]), o[1]], FRAME.origin);
    f.set([env.overcast, env.rain, env.visibility, env.cloudBase], FRAME.weather);
    f.set([night, env.cloudTop, env.coverage, this.time * 0.1], FRAME.misc);
    f.set([CASCADES[0], CASCADES[1], CASCADES[2], 1 / this.shadowSize], FRAME.cascade);
    f.set([this.drift[0], this.drift[1], 0, 0], FRAME.wind);
    f.set([o[0], o[1], o[2], 0], FRAME.originAbs);
    // frame.origin.w is the origin height: heights in shaders are rel.y + origin.w

    // ---- atmosphere LUTs -----------------------------------------------------------------------------
    gl.bindVertexArray(this.emptyVao);
    this.atmosphere.update(atm, o[1], L[1], out.kind === 'canvas' ? Infinity : 6);

    // ---- collect meshes -------------------------------------------------------------------------------
    const cull = cullMatrix(views, o);
    this.meshes.collect(roots, camWorld, cull, CASCADES[2]);
    const right = new THREE.Vector3(views[0].matrix[0], views[0].matrix[1], views[0].matrix[2]);
    const up = new THREE.Vector3(views[0].matrix[4], views[0].matrix[5], views[0].matrix[6]);
    this.meshes.camRight.copy(right);
    this.meshes.camUp.copy(up);

    const spot = this.meshes.spot;
    if (spot) {
      const sp = new THREE.Vector3().setFromMatrixPosition(spot.matrixWorld);
      const st = new THREE.Vector3().setFromMatrixPosition(spot.target.matrixWorld);
      const dir = st.sub(sp).normalize();
      // three.js candela → this renderer's units (sun = 10): scaled to look right at night
      const I = spot.intensity * 0.0015;
      f.set([sp.x - o[0], sp.y - o[1], sp.z - o[2], spot.distance || 500], FRAME.spotPos);
      f.set([dir.x, dir.y, dir.z, Math.cos(spot.angle)], FRAME.spotDir);
      f.set([spot.color.r * I, spot.color.g * I, spot.color.b * I, Math.cos(spot.angle * (1 - spot.penumbra))], FRAME.spotColor);
    }

    const multiview = out.kind === 'xr-multiview';
    const inline = out.kind !== 'canvas';
    const progs = this.scenePrograms(multiview, inline);

    // ---- shadows -----------------------------------------------------------------------------------------
    if (this.shadowsEnabled && L[1] > -0.02) {
      this.renderShadows(progs, L, reversed);
      this.renderTerrainShadow(progs, L, reversed);
    }
    for (let i = 0; i < 3; i++) f.set(this.shadowMats[i], FRAME.shadowMat + i * 16);

    // ---- main pass ------------------------------------------------------------------------------------------
    const cloudsOn = this.cloudsEnabled && env.coverage > 0.02;
    const cs = out.kind === 'canvas' ? this.cloudDesktop : this.cloudXR;
    const cloudDensity = env.overcast > 0.5 ? 1.6 : 1;
    if (cloudsOn) {
      this.frameUbo.flush();
      gl.bindVertexArray(this.emptyVao);
      this.clouds.renderShadow(o[0], o[2], env.cloudBase, env.cloudTop, env.coverage, cloudDensity);
    } else this.clouds.shadowRect[3] = 0;
    const drawClouds = (w: number, h: number, mv: boolean) => {
      if (!cloudsOn) return;
      this.clouds.ensure(Math.max(1, Math.round(w * cs.scale)), Math.max(1, Math.round(h * cs.scale)), mv);
      this.frameUbo.flush();
      gl.bindVertexArray(this.emptyVao);
      this.clouds.render(progs.clouds, cs, env.cloudBase, env.cloudTop, env.coverage, cloudDensity, mv, (p) => this.atmosphere.bind(p));
    };
    const drawScene = (w: number, h: number, x = 0, y = 0) => {
      f[FRAME.viewport] = w;
      f[FRAME.viewport + 1] = h;
      f[FRAME.viewport + 2] = 1 / w;
      f[FRAME.viewport + 3] = 1 / h;
      f[FRAME.viewOffset] = x;
      f[FRAME.viewOffset + 1] = y;
      this.meshes.pointScale = h / 1000;
      this.frameUbo.flush();
      this.drawScene(progs, env, reversed, cloudsOn);
      this.drawVision(progs.vision, vision, views);
    };

    if (out.kind === 'canvas') {
      const t = this.ensureHdr(out.width, out.height);
      drawClouds(t.w, t.h, false);
      t.msaa.bind();
      drawScene(t.w, t.h);
      // resolve MSAA, then bloom and composite to the canvas
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msaa.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.resolved.fb);
      gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      this.postProcess(t, out.width, out.height, env);
    } else if (out.kind === 'xr-multiview') {
      drawClouds(out.width, out.height, true);
      const fb = this.xrFramebuffer(out.color, out.width, out.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, out.width, out.height);
      drawScene(out.width, out.height);
    } else {
      // one pass per eye: view 0 of the frame block is rewritten before each
      const eyes = out.viewports.length;
      const saved = f.slice(0, FRAME.size);
      for (let i = 0; i < eyes; i++) {
        f.set(saved.subarray(FRAME.viewProj + i * 16, FRAME.viewProj + i * 16 + 16), FRAME.viewProj);
        f.set(saved.subarray(FRAME.invViewProj + i * 16, FRAME.invViewProj + i * 16 + 16), FRAME.invViewProj);
        f.set(saved.subarray(FRAME.eye + i * 4, FRAME.eye + i * 4 + 4), FRAME.eye);
        const [x, y, w, h] = out.viewports[i];
        drawClouds(w, h, false);
        gl.bindFramebuffer(gl.FRAMEBUFFER, out.framebuffer);
        gl.viewport(x, y, w, h);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x, y, w, h);
        drawScene(w, h, x, y);
        gl.disable(gl.SCISSOR_TEST);
      }
      f.set(saved);
    }
    gl.bindVertexArray(null);
  }

  private drawScene(progs: ScenePrograms, env: Environment, reversed: boolean, cloudsOn: boolean): void {
    const gl = this.gl;
    gl.depthMask(true);
    gl.clearDepth(reversed ? 0 : 1);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(reversed ? gl.GEQUAL : gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    const o = this.origin;

    const bindClouds = (p: Program) => {
      p.f1('u_cloudsOn', cloudsOn ? 1 : 0);
      p.tex('u_cloudShadow', this.clouds.shadow).v4('u_cloudShadowRect', this.clouds.shadowRect).f2('u_cloudSlab', env.cloudBase, env.cloudTop);
      if (this.clouds.light) p.tex('u_cloudLight', this.clouds.light).tex('u_cloudDepth', this.clouds.depth);
    };
    const bindLit = (p: Program) => {
      this.atmosphere.bind(p);
      bindClouds(p);
      p.tex('u_shadowMap', this.shadowMap).tex('u_terrainShadow', this.terrainShadow).m4('u_terrainShadowMat', this.terrainShadowMat).f1('u_shadowsOn', this.shadowsEnabled ? 1 : 0);
    };

    // terrain
    const t = progs.terrain.use();
    bindLit(t);
    this.terrain.draw(t, o, o);

    // opaque meshes
    this.meshes.draw(this.meshes.opaque, progs.mesh, o, false, bindLit);

    // sea
    const w = progs.water.use();
    bindLit(w);
    w.tex('u_height', this.terrain.heightTex).tex('u_groundColor', this.terrain.colorTex).f3('u_waterColor', env.waterColor[0], env.waterColor[1], env.waterColor[2]).f1('u_waves', env.waves);
    const n = this.terrain.levels.length;
    const corners = new Float32Array(20);
    const texs = new Int32Array(20);
    const spacing = new Float32Array(10);
    this.terrain.levels.forEach((l, i) => {
      const mx = l.cx - 124;
      const mz = l.cz - 124;
      corners[i * 2] = mx * l.spacing - o[0];
      corners[i * 2 + 1] = mz * l.spacing - o[2];
      texs[i * 2] = ((mx % 256) + 256) % 256;
      texs[i * 2 + 1] = ((mz % 256) + 256) % 256;
      spacing[i] = l.valid ? l.spacing : 1e-9;
    });
    gl.uniform2fv(w.loc('u_lvlCorner'), corners);
    gl.uniform2iv(w.loc('u_lvlTex'), texs);
    gl.uniform1fv(w.loc('u_lvlSpacing'), spacing);
    w.i1('u_levels', n);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.waterVao);
    gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_SHORT, 0);

    // sky behind everything
    gl.depthMask(false);
    const s = progs.sky.use();
    this.atmosphere.bind(s);
    bindClouds(s);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // transparent meshes, back to front
    this.meshes.draw(this.meshes.transparent, progs.mesh, o, false, bindLit);
    gl.enable(gl.CULL_FACE);
  }

  private drawVision(p: Program, v: VisionEffects, views: ViewInput[]): void {
    if (v.comfort < 0.01 && v.blackout < 0.01 && v.redout < 0.01) return;
    const gl = this.gl;
    const fov = views[0].fov;
    // radius 1 ≈ 45° off the view axis, whatever the frustum
    const sx = (fov.left + fov.right) / 2;
    const sy = (fov.up + fov.down) / 2;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    p.use().f3('u_vision', v.comfort, v.blackout, v.redout).f2('u_scale', sx, sy);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  // ---- shadows ----------------------------------------------------------------------------------------

  /** Light view-projection for a sphere around the origin (texel-snapped against shimmering). */
  private lightMatrix(out: Float64Array, L: ArrayLike<number>, radius: number, size: number, depth: number, reversed: boolean): void {
    const view = new Float64Array(16);
    lookDir(view, [0, 0, 0], [-L[0], -L[1], -L[2]], Math.abs(L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    // snap the (camera-relative) projection of the world grid so texels stay put while flying
    const texel = (2 * radius) / size;
    const ox = view[0] * this.origin[0] + view[4] * this.origin[1] + view[8] * this.origin[2];
    const oy = view[1] * this.origin[0] + view[5] * this.origin[1] + view[9] * this.origin[2];
    const sx = ox - Math.floor(ox / texel) * texel;
    const sy = oy - Math.floor(oy / texel) * texel;
    const proj = new Float64Array(16);
    ortho(proj, -radius + sx, radius + sx, -radius + sy, radius + sy, -depth, depth, reversed);
    multiply(out, proj, view);
  }

  private renderShadows(progs: ScenePrograms, L: ArrayLike<number>, reversed: boolean): void {
    const gl = this.gl;
    const m = new Float64Array(16);
    const bias = new Float64Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, reversed ? 1 : 0.5, 0, 0.5, 0.5, reversed ? 0 : 0.5, 1]);
    const sm = new Float64Array(16);
    const sf = this.shadowUbo.data;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(reversed ? gl.GEQUAL : gl.LEQUAL);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    for (let i = 0; i < 3; i++) {
      const r = CASCADES[i];
      this.lightMatrix(m, L, r, this.shadowSize, Math.max(600, r * 2), reversed);
      multiply(sm, bias, m);
      this.shadowMats[i].set(sm);
      sf.set(this.frameUbo.data);
      sf.set(m, FRAME.viewProj);
      sf.set(m, FRAME.viewProj + 16);
      this.shadowUbo.flush();
      this.shadowTargets[i].bind();
      gl.depthMask(true);
      gl.clearDepth(reversed ? 0 : 1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const s = reversed ? -1 : 1;
      gl.polygonOffset(1.5 * s, 2 * s);
      const items = this.meshes.casters;
      gl.disable(gl.CULL_FACE);
      this.meshes.draw(items, progs.meshShadow, this.origin, true, (p) => p.f1('u_pull', 1));
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.CULL_FACE);
    // restore the main frame block
    gl.bindBufferBase(gl.UNIFORM_BUFFER, BLOCK.frame, this.frameUbo.handle);
  }

  /** Coarse shadow map of the terrain alone over ±20 km, refreshed when the sun or the region changes. */
  private renderTerrainShadow(progs: ScenePrograms, L: ArrayLike<number>, reversed: boolean): void {
    const gl = this.gl;
    const R = 20000;
    const cell = 2000;
    const cx = Math.round(this.origin[0] / cell) * cell;
    const cz = Math.round(this.origin[2] / cell) * cell;
    const key = `${cx},${cz},${L[0].toFixed(3)},${L[1].toFixed(3)},${L[2].toFixed(3)},${this.terrain.levels.map((l) => l.valid).join()}`;
    const rebuilt = key !== this.terrainShadowKey;
    // centre of the map relative to the current origin
    const m = new Float64Array(16);
    const view = new Float64Array(16);
    const rel = [cx - this.origin[0], 0 - this.origin[1], cz - this.origin[2]];
    lookDir(view, rel, [-L[0], -L[1], -L[2]], Math.abs(L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    const proj = new Float64Array(16);
    ortho(proj, -R, R, -R, R, -9000, 9000, reversed);
    multiply(m, proj, view);
    const bias = new Float64Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, reversed ? 1 : 0.5, 0, 0.5, 0.5, reversed ? 0 : 0.5, 1]);
    const sm = new Float64Array(16);
    multiply(sm, bias, m);
    this.terrainShadowMat.set(sm);
    if (!rebuilt) return;
    this.terrainShadowKey = key;
    const sf = this.shadowUbo.data;
    sf.set(this.frameUbo.data);
    sf.set(m, FRAME.viewProj);
    sf.set(m, FRAME.viewProj + 16);
    this.shadowUbo.flush();
    this.terrainShadowTarget.bind();
    gl.depthMask(true);
    gl.clearDepth(reversed ? 0 : 1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(reversed ? gl.GEQUAL : gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    const tp = progs.terrainShadow.use();
    this.terrain.draw(tp, this.origin, [cx, 0, cz], 1);
    gl.enable(gl.CULL_FACE);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, BLOCK.frame, this.frameUbo.handle);
  }

  // ---- targets ------------------------------------------------------------------------------------------

  private ensureHdr(w: number, h: number) {
    const gl = this.gl;
    if (this.hdr && this.hdr.w === w && this.hdr.h === h) return this.hdr;
    const fmt = this.dev.caps.halfFloatTarget ? gl.RGBA16F : gl.RGBA8;
    const samples = Math.min(4, this.dev.caps.maxSamples);
    const colorRb = renderbuffer(gl, fmt, w, h, samples);
    const depthRb = renderbuffer(gl, gl.DEPTH_COMPONENT32F, w, h, samples);
    const msaa = new Target(this.dev, w, h, [colorRb], depthRb);
    const color = this.dev.texture2D({ width: w, height: h, format: fmt });
    const resolved = new Target(this.dev, w, h, [color], null);
    const bloom: { tex: Texture; t: Target }[] = [];
    let bw = w;
    let bh = h;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      const tex = this.dev.texture2D({ width: bw, height: bh, format: fmt });
      bloom.push({ tex, t: new Target(this.dev, bw, bh, [tex], null) });
    }
    this.hdr = { w, h, samples, msaa, resolved, color, bloom };
    return this.hdr;
  }

  private postProcess(t: NonNullable<Renderer['hdr']>, w: number, h: number, env: Environment): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    // bloom: downsample chain with a soft threshold, then upsample additively
    let src = t.color;
    const d = this.post.down.use();
    t.bloom.forEach((b, i) => {
      b.t.bind();
      d.tex('u_src', src).f2('u_texel', 0.5 / src.width, 0.5 / src.height).f1('u_threshold', i === 0 ? 1.2 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = b.tex;
    });
    const u = this.post.up.use();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = t.bloom.length - 1; i > 0; i--) {
      const from = t.bloom[i];
      const to = t.bloom[i - 1];
      to.t.bind();
      u.tex('u_src', from.tex).f2('u_texel', 0.5 / from.tex.width, 0.5 / from.tex.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    this.post.composite
      .use()
      .tex('u_scene', t.color)
      .tex('u_bloom', t.bloom[0].tex)
      .f1('u_bloomStrength', 0.06 + env.rain * 0.05)
      .f4('u_vision', 0, 0, 0, this.time % 100)
      .f1('u_night', env.night);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Framebuffer with the XR colour texture array and our own depth array attached for multiview. */
  private xrFramebuffer(color: WebGLTexture, w: number, h: number): WebGLFramebuffer {
    const gl = this.gl;
    let t = this.xrTargets.get(color);
    if (!t) {
      const fb = gl.createFramebuffer()!;
      const depth = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, depth);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT32F, w, h, 2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const oc = this.dev.ext.oculus;
      const mv = this.dev.ext.multiview!;
      if (oc) {
        oc.framebufferTextureMultisampleMultiviewOVR(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, 4, 0, 2);
        oc.framebufferTextureMultisampleMultiviewOVR(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depth, 0, 4, 0, 2);
      } else {
        mv.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, 0, 2);
        mv.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depth, 0, 0, 2);
      }
      t = { fb, depth };
      this.xrTargets.set(color, t);
    }
    return t.fb;
  }

  /** Drops cached XR framebuffers (session ended). */
  releaseXR(): void {
    for (const t of this.xrTargets.values()) {
      this.gl.deleteFramebuffer(t.fb);
      this.gl.deleteTexture(t.depth);
    }
    this.xrTargets.clear();
  }
}

function mod4096(v: number): number {
  return ((v % 4096) + 4096) % 4096;
}

/** Camera-relative view-projection of one view. */
function viewProjection(out: Float64Array, v: ViewInput, origin: ArrayLike<number>, near: number, reversed: boolean, a: Float64Array, b: Float64Array): void {
  for (let i = 0; i < 16; i++) a[i] = v.matrix[i];
  a[12] -= origin[0];
  a[13] -= origin[1];
  a[14] -= origin[2];
  invert(b, a);
  projection(a, v.fov, near, 150000, reversed);
  multiply(out, a, b);
}

/** World-space view-projection covering all views (for frustum culling): the union frustum. */
function cullMatrix(views: ViewInput[], origin: ArrayLike<number>): THREE.Matrix4 {
  const v = views[0];
  let fov = { ...v.fov };
  for (const w of views) fov = { left: Math.max(fov.left, w.fov.left), right: Math.max(fov.right, w.fov.right), up: Math.max(fov.up, w.fov.up), down: Math.max(fov.down, w.fov.down) };
  // widen a little for the eye separation
  fov = { left: fov.left * 1.15, right: fov.right * 1.15, up: fov.up * 1.1, down: fov.down * 1.1 };
  const cam = new Float64Array(16);
  for (let i = 0; i < 16; i++) cam[i] = v.matrix[i];
  cam[12] = origin[0];
  cam[13] = origin[1];
  cam[14] = origin[2];
  const inv = new Float64Array(16);
  invert(inv, cam);
  const p = new Float64Array(16);
  projection(p, fov, 0.05, 150000, false);
  const m = new Float64Array(16);
  multiply(m, p, inv);
  return new THREE.Matrix4().fromArray(Array.from(m));
}

