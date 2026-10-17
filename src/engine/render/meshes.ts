import * as THREE from 'three';
import { type Device, type Program, type Texture } from '../gl/device';
import { meshFS, meshShadowFS, meshVS } from '../shaders/mesh';

/**
 * Draws three.js object trees with the engine's own shaders. The game's content (aircraft, cockpits,
 * airfields, city, forest, rings, traffic) is still built as three.js scene graphs; three.js serves
 * as scene-graph and geometry library there, while every pixel comes from this renderer.
 */

interface GpuGeometry {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  count: number;
  indexType: number;
  hasIndex: boolean;
  versions: string;
  instanceBuf?: WebGLBuffer;
  instanceColorBuf?: WebGLBuffer;
  instanceVersion?: number;
  instanceColorVersion?: number;
}

interface GpuTexture {
  tex: Texture;
  version: number;
}

export interface DrawItem {
  object: THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;
  material: THREE.Material;
  group: { start: number; count: number } | null;
  /** squared distance to the camera, for sorting */
  dist: number;
}

const tmpM = new THREE.Matrix4();
const tmpN = new THREE.Matrix3();
const tmpSphere = new THREE.Sphere();
const model = new Float32Array(16);
const normal9 = new Float32Array(9);
const uv9 = new Float32Array(9);
const tmpColor = new THREE.Color();
const SPRITE_GEO = (() => {
  const g = new THREE.PlaneGeometry(1, 1);
  return g;
})();

export class MeshRenderer {
  private readonly geos = new WeakMap<THREE.BufferGeometry, GpuGeometry>();
  private readonly texs = new WeakMap<THREE.Texture, GpuTexture>();
  private readonly white: Texture;
  readonly opaque: DrawItem[] = [];
  readonly transparent: DrawItem[] = [];
  /** draw items that cast shadows (collected with the opaque list) */
  readonly casters: DrawItem[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();

  constructor(private readonly dev: Device) {
    const gl = dev.gl;
    this.white = dev.texture2D({ width: 1, height: 1, format: gl.RGBA8 });
    this.white.upload(new Uint8Array([255, 255, 255, 255]));
  }

  programs(defines: Record<string, string | number | boolean | undefined>): Record<'plain' | 'instanced' | 'shadow' | 'shadowInstanced', Program> {
    const d = this.dev;
    return {
      plain: d.program('mesh', meshVS, meshFS, defines),
      instanced: d.program('mesh', meshVS, meshFS, { ...defines, INSTANCED: true }),
      shadow: d.program('mesh-shadow', meshVS, meshShadowFS, { MULTIVIEW: undefined, REVERSED_Z: defines.REVERSED_Z }),
      shadowInstanced: d.program('mesh-shadow', meshVS, meshShadowFS, { MULTIVIEW: undefined, REVERSED_Z: defines.REVERSED_Z, INSTANCED: true }),
    };
  }

  /**
   * Collects visible draws from the roots. `camWorld` is the camera position in world metres,
   * `viewProjWorld` an optional world-space view-projection for frustum culling (centre eye, widened).
   */
  collect(roots: THREE.Object3D[], camWorld: THREE.Vector3, viewProjWorld: THREE.Matrix4 | null, shadowRange: number): void {
    this.opaque.length = 0;
    this.transparent.length = 0;
    this.casters.length = 0;
    this.spot = null;
    if (viewProjWorld) this.frustum.setFromProjectionMatrix(this.projScreen.copy(viewProjWorld));
    const visit = (o: THREE.Object3D) => {
      if (!o.visible) return;
      const r = o as THREE.Mesh;
      const sl = o as THREE.SpotLight;
      if (sl.isSpotLight && sl.intensity > 0) {
        this.spot = sl;
        return;
      }
      if (r.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
        const geo = (o as THREE.Mesh).geometry ?? SPRITE_GEO;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        tmpSphere.copy(geo.boundingSphere!).applyMatrix4(o.matrixWorld);
        if ((o as THREE.InstancedMesh).isInstancedMesh) {
          const im = o as THREE.InstancedMesh;
          if (!im.boundingSphere) im.computeBoundingSphere();
          tmpSphere.copy(im.boundingSphere!).applyMatrix4(o.matrixWorld);
        }
        const dist = tmpSphere.center.distanceToSquared(camWorld);
        const inView = !viewProjWorld || o.frustumCulled === false || this.frustum.intersectsSphere(tmpSphere);
        const mats = Array.isArray(r.material) ? r.material : [r.material];
        const groups = Array.isArray(r.material) ? geo.groups : [null];
        for (let gi = 0; gi < groups.length; gi++) {
          const g = groups[gi];
          const mat = g ? mats[g.materialIndex ?? 0] : mats[0];
          if (!mat || !mat.visible) continue;
          const item: DrawItem = { object: o as DrawItem['object'], material: mat, group: g ? { start: g.start, count: g.count } : null, dist };
          if (inView) {
            if (mat.transparent || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) this.transparent.push(item);
            else this.opaque.push(item);
          }
          if (o.castShadow && !mat.transparent && Math.sqrt(dist) - tmpSphere.radius < shadowRange && !(o as THREE.Points).isPoints) this.casters.push(item);
        }
      }
      for (const c of o.children) visit(c);
    };
    for (const root of roots) {
      root.updateMatrixWorld();
      visit(root);
    }
    this.opaque.sort((a, b) => a.object.renderOrder - b.object.renderOrder || a.dist - b.dist);
    this.transparent.sort((a, b) => a.object.renderOrder - b.object.renderOrder || b.dist - a.dist);
  }

  // ---- GPU resources --------------------------------------------------------------------------

  private geometry(geo: THREE.BufferGeometry, inst: THREE.InstancedMesh | null): GpuGeometry {
    const gl = this.dev.gl;
    const attrs = geo.attributes;
    const versions = ['position', 'normal', 'uv', 'color'].map((n) => (attrs[n] ? (attrs[n] as THREE.BufferAttribute).version : -1)).join() + `|${geo.index?.version ?? -1}|${geo.drawRange.count}`;
    let g = this.geos.get(geo);
    if (g && g.versions !== versions) {
      for (const b of g.buffers) gl.deleteBuffer(b);
      gl.deleteVertexArray(g.vao);
      g = undefined;
    }
    if (!g) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const buffers: WebGLBuffer[] = [];
      const bind = (name: string, slot: number, fallback: number[]) => {
        const a = attrs[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
        if (!a) {
          gl.disableVertexAttribArray(slot);
          gl.vertexAttrib4f(slot, fallback[0], fallback[1], fallback[2], fallback[3]);
          return;
        }
        const arr = (a as THREE.BufferAttribute).array as ArrayBufferView & ArrayLike<number>;
        let data: Float32Array;
        if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
          data = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) data[i * a.itemSize + k] = a.getComponent(i, k);
        } else data = arr instanceof Float32Array ? arr : Float32Array.from(arr as ArrayLike<number>);
        if ((a as THREE.BufferAttribute).normalized && !(arr instanceof Float32Array)) {
          const scale = arr instanceof Uint8Array ? 1 / 255 : arr instanceof Uint16Array ? 1 / 65535 : 1;
          data = data.map((v) => v * scale);
        }
        buffers.push(this.dev.buffer(gl.ARRAY_BUFFER, data));
        gl.enableVertexAttribArray(slot);
        gl.vertexAttribPointer(slot, a.itemSize, gl.FLOAT, false, 0, 0);
      };
      bind('position', 0, [0, 0, 0, 1]);
      bind('normal', 1, [0, 1, 0, 0]);
      bind('uv', 2, [0, 0, 0, 0]);
      bind('color', 3, [1, 1, 1, 1]);
      let hasIndex = false;
      let indexType: number = gl.UNSIGNED_SHORT;
      let count = attrs.position ? attrs.position.count : 0;
      if (geo.index) {
        const ia = geo.index.array;
        const data = ia instanceof Uint32Array || ia instanceof Uint16Array ? ia : new Uint32Array(ia);
        buffers.push(this.dev.buffer(gl.ELEMENT_ARRAY_BUFFER, data));
        indexType = data instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        hasIndex = true;
        count = geo.index.count;
      }
      count = Math.min(count, geo.drawRange.count);
      g = { vao, buffers, count, indexType, hasIndex, versions };
      this.geos.set(geo, g);
    }
    if (inst) {
      gl.bindVertexArray(g.vao);
      if (!g.instanceBuf || g.instanceVersion !== inst.instanceMatrix.version) {
        if (!g.instanceBuf) g.instanceBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, g.instanceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, inst.instanceMatrix.array as Float32Array, gl.DYNAMIC_DRAW);
        g.instanceVersion = inst.instanceMatrix.version;
        for (let k = 0; k < 4; k++) {
          gl.enableVertexAttribArray(4 + k);
          gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, 64, k * 16);
          gl.vertexAttribDivisor(4 + k, 1);
        }
      }
      if (inst.instanceColor && (!g.instanceColorBuf || g.instanceColorVersion !== inst.instanceColor.version)) {
        if (!g.instanceColorBuf) g.instanceColorBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, g.instanceColorBuf);
        // instance colours are linear in three.js already
        gl.bufferData(gl.ARRAY_BUFFER, inst.instanceColor.array as Float32Array, gl.DYNAMIC_DRAW);
        g.instanceColorVersion = inst.instanceColor.version;
        gl.enableVertexAttribArray(8);
        gl.vertexAttribPointer(8, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(8, 1);
      } else if (!inst.instanceColor) {
        gl.disableVertexAttribArray(8);
        gl.vertexAttrib3f(8, 1, 1, 1);
      }
    }
    return g;
  }

  private texture(t: THREE.Texture): Texture | null {
    const gl = this.dev.gl;
    const img = t.image as (TexImageSource & { width: number; height: number; data?: ArrayBufferView }) | undefined;
    if (!img || !img.width) return null;
    let g = this.texs.get(t);
    if (g && (g.tex.width !== img.width || g.tex.height !== img.height)) {
      g.tex.dispose();
      g = undefined;
    }
    const srgb = t.colorSpace === THREE.SRGBColorSpace;
    if (!g) {
      const tex = this.dev.texture2D({
        width: img.width,
        height: img.height,
        format: srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
        filter: t.generateMipmaps && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter ? 'mipmap' : t.magFilter === THREE.NearestFilter ? 'nearest' : 'linear',
        wrap: t.wrapS === THREE.RepeatWrapping ? 'repeat' : 'clamp',
        anisotropy: Math.max(t.anisotropy, 4),
      });
      g = { tex, version: -1 };
      this.texs.set(t, g);
    }
    if (g.version !== t.version) {
      g.version = t.version;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, t.flipY && !(t as THREE.DataTexture).isDataTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, t.premultiplyAlpha);
      if ((t as THREE.DataTexture).isDataTexture && img.data) {
        const d = img.data as Uint8Array;
        const rgba = d.length === img.width * img.height * 4 ? d : expandToRgba(d, img.width * img.height);
        g.tex.upload(rgba);
      } else g.tex.upload(img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (g.tex.opts.filter === 'mipmap') g.tex.generateMipmap();
    }
    return g.tex;
  }

  // ---- drawing --------------------------------------------------------------------------------

  /**
   * Draws a list. `origin` is the floating origin (world metres). In the shadow pass `p` is the
   * depth-only program and materials only matter for alpha.
   */
  draw(items: DrawItem[], progs: { plain: Program; instanced: Program }, origin: ArrayLike<number>, shadow = false, setup?: (p: Program) => void): void {
    const gl = this.dev.gl;
    let current: Program | null = null;
    const reversed = this.dev.caps.clipControl;
    for (const item of items) {
      const o = item.object;
      const mat = item.material as THREE.MeshStandardMaterial & THREE.MeshPhongMaterial & THREE.PointsMaterial;
      const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
      if (inst && inst.count === 0) continue;
      const p = inst ? progs.instanced : progs.plain;
      if (p !== current) {
        current = p.use();
        setup?.(p);
      }
      const isSprite = (o as THREE.Sprite).isSprite;
      const geo = isSprite ? SPRITE_GEO : (o as THREE.Mesh).geometry;
      const g = this.geometry(geo, inst);

      // camera-relative model matrix (float64 subtraction before the float32 upload)
      const m = o.matrixWorld.elements;
      if (isSprite) {
        // billboards: keep only position and scale, the vertex shader does not know about the camera,
        // so sprites are drawn as camera-facing quads built from the current view
        spriteMatrix(o as THREE.Sprite, model, origin, this.camRight, this.camUp);
      } else {
        for (let i = 0; i < 16; i++) model[i] = m[i];
        model[12] = m[12] - origin[0];
        model[13] = m[13] - origin[1];
        model[14] = m[14] - origin[2];
      }
      gl.uniformMatrix4fv(p.loc('u_model'), false, model);
      if (!shadow) {
        tmpN.getNormalMatrix(tmpM.fromArray(m));
        for (let i = 0; i < 9; i++) normal9[i] = tmpN.elements[i];
        gl.uniformMatrix3fv(p.loc('u_normalMat'), false, normal9);
      }
      const map = mat.map ?? null;
      const tex = map ? this.texture(map) : null;
      if (map) {
        if (map.matrixAutoUpdate) map.updateMatrix();
        for (let i = 0; i < 9; i++) uv9[i] = map.matrix.elements[i];
      } else uv9.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      gl.uniformMatrix3fv(p.loc('u_uvTransform'), false, uv9);
      p.tex('u_map', tex ?? this.white);

      const unlit = (mat as THREE.Material).type === 'MeshBasicMaterial' || (mat as THREE.Material).type === 'LineBasicMaterial' || (mat as THREE.Material).type === 'PointsMaterial' || (mat as THREE.Material).type === 'SpriteMaterial';
      tmpColor.copy(mat.color ?? tmpColor.set(1, 1, 1));
      const opacity = mat.opacity ?? 1;
      const additive = mat.blending === THREE.AdditiveBlending;
      // unlit and emissive colours are display-referred in the old content: scale them into the HDR range
      const glow = unlit ? (isSpriteMat(mat) ? 1 : additive ? 3 : mat.toneMapped === false ? 2.2 : 1) : 1;
      p.f4('u_color', tmpColor.r * glow, tmpColor.g * glow, tmpColor.b * glow, opacity);
      const em = mat.emissive;
      const ei = (mat.emissiveIntensity ?? 1) * 3;
      p.f3('u_emissive', em ? em.r * ei : 0, em ? em.g * ei : 0, em ? em.b * ei : 0);
      const rough = mat.type === 'MeshStandardMaterial' || mat.type === 'MeshPhysicalMaterial' ? mat.roughness : mat.type === 'MeshPhongMaterial' ? Math.sqrt(2 / (mat.shininess + 2)) : 0.85;
      p.f4('u_material', rough, mat.metalness ?? 0, tex ? 1 : 0, mat.alphaTest ?? 0);
      p.f1('u_unlit', unlit ? 1 : 0);
      p.f1('u_flat', mat.flatShading || !geo.attributes.normal ? 1 : 0);
      p.f1('u_doubleSided', mat.side === THREE.DoubleSide ? 1 : 0);
      p.f1('u_receiveShadow', o.receiveShadow || inst ? 1 : 1);
      const isPoints = (o as THREE.Points).isPoints;
      p.f1('u_isPoint', isPoints ? 1 : 0);
      p.f1('u_pointSize', isPoints ? (mat.size ?? 1) * this.pointScale : 1);
      p.f1('u_pull', isPoints ? 0.985 : (o.userData.pull as number | undefined) ?? 1);
      p.f1('u_fogged', mat.fog === false && unlit ? 0 : 1);

      // fixed-function state
      if (mat.side === THREE.DoubleSide || isSprite) gl.disable(gl.CULL_FACE);
      else {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(mat.side === THREE.BackSide ? gl.FRONT : gl.BACK);
      }
      if (!shadow) {
        if (mat.depthTest === false) gl.disable(gl.DEPTH_TEST);
        else gl.enable(gl.DEPTH_TEST);
        gl.depthMask(mat.depthWrite !== false && !mat.transparent);
        if (mat.transparent || isPoints || isSprite) {
          gl.enable(gl.BLEND);
          if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else gl.disable(gl.BLEND);
        if (mat.polygonOffset) {
          gl.enable(gl.POLYGON_OFFSET_FILL);
          const s = reversed ? -1 : 1;
          gl.polygonOffset(mat.polygonOffsetFactor * s, mat.polygonOffsetUnits * s);
        } else gl.disable(gl.POLYGON_OFFSET_FILL);
      }

      gl.bindVertexArray(g.vao);
      const mode = isPoints ? gl.POINTS : (o as THREE.LineSegments).isLineSegments ? gl.LINES : (o as THREE.Line).isLine ? gl.LINE_STRIP : gl.TRIANGLES;
      const start = item.group?.start ?? geo.drawRange.start;
      const count = Math.min(item.group?.count ?? Infinity, g.count - (item.group ? 0 : start));
      if (count <= 0) continue;
      if (g.hasIndex) {
        const bytes = g.indexType === gl.UNSIGNED_INT ? 4 : 2;
        if (inst) gl.drawElementsInstanced(mode, count, g.indexType, start * bytes, inst.count);
        else gl.drawElements(mode, count, g.indexType, start * bytes);
      } else if (inst) gl.drawArraysInstanced(mode, start, count, inst.count);
      else gl.drawArrays(mode, start, count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  /** camera basis for sprites (world space) and the pixel scale for point sizes */
  readonly camRight = new THREE.Vector3(1, 0, 0);
  readonly camUp = new THREE.Vector3(0, 1, 0);
  pointScale = 1;
  /** the brightest visible spot light (landing light), if any */
  spot: THREE.SpotLight | null = null;
}

function spriteMatrix(s: THREE.Sprite, out: Float32Array, origin: ArrayLike<number>, right: THREE.Vector3, up: THREE.Vector3): void {
  const e = s.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]);
  const sy = Math.hypot(e[4], e[5], e[6]);
  const fwd = new THREE.Vector3().crossVectors(right, up);
  out.set([right.x * sx, right.y * sx, right.z * sx, 0, up.x * sy, up.y * sy, up.z * sy, 0, fwd.x, fwd.y, fwd.z, 0, e[12] - origin[0], e[13] - origin[1], e[14] - origin[2], 1]);
}

const isSpriteMat = (m: THREE.Material) => m.type === 'SpriteMaterial';

function expandToRgba(d: Uint8Array, n: number): Uint8Array {
  const c = d.length / n;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = d[i * c];
    out[i * 4 + 1] = d[i * c + (c > 1 ? 1 : 0)];
    out[i * 4 + 2] = d[i * c + (c > 2 ? 2 : 0)];
    out[i * 4 + 3] = c > 3 ? d[i * c + 3] : 255;
  }
  return out;
}
