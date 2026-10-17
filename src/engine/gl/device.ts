/**
 * Thin WebGL2 layer: context and capabilities, shader programs with defines and includes, uniform
 * buffers, textures and render targets. Everything above it speaks in these terms only.
 */

export interface Caps {
  /** EXT_clip_control: depth range 0…1, enables reversed-Z with full float precision */
  clipControl: boolean;
  /** rendering to RGBA16F (EXT_color_buffer_half_float or EXT_color_buffer_float) */
  halfFloatTarget: boolean;
  floatTarget: boolean;
  floatLinear: boolean;
  multiview: boolean;
  /** OCULUS_multiview: multiview with MSAA straight into the XR texture array */
  multiviewMsaa: boolean;
  anisotropy: number;
  maxSamples: number;
}

export type Defines = Record<string, string | number | boolean | undefined>;

const SHARED_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler3D;
precision highp sampler2DShadow;
precision highp sampler2DArrayShadow;
`;

export class Device {
  readonly gl: WebGL2RenderingContext;
  readonly caps: Caps;
  readonly ext: {
    clip: { clipControlEXT(origin: number, depth: number): void; LOWER_LEFT_EXT: number; ZERO_TO_ONE_EXT: number } | null;
    multiview: {
      framebufferTextureMultiviewOVR(target: number, attachment: number, texture: WebGLTexture | null, level: number, baseViewIndex: number, numViews: number): void;
    } | null;
    oculus: {
      framebufferTextureMultisampleMultiviewOVR(
        target: number,
        attachment: number,
        texture: WebGLTexture | null,
        level: number,
        samples: number,
        baseViewIndex: number,
        numViews: number,
      ): void;
    } | null;
    aniso: { TEXTURE_MAX_ANISOTROPY_EXT: number } | null;
  };
  private readonly programs = new Map<string, Program>();
  private readonly includes = new Map<string, string>();

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      xrCompatible: true,
      premultipliedAlpha: false,
    } as WebGLContextAttributes) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 wird nicht unterstützt');
    this.gl = gl;
    const clip = gl.getExtension('EXT_clip_control');
    const halfColor = gl.getExtension('EXT_color_buffer_half_float');
    const fullColor = gl.getExtension('EXT_color_buffer_float');
    const floatLinear = gl.getExtension('OES_texture_float_linear');
    const multiview = gl.getExtension('OVR_multiview2');
    const oculus = gl.getExtension('OCULUS_multiview');
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.ext = { clip, multiview, oculus, aniso };
    this.caps = {
      clipControl: !!clip,
      halfFloatTarget: !!(halfColor || fullColor),
      floatTarget: !!fullColor,
      floatLinear: !!floatLinear,
      multiview: !!(multiview || oculus),
      multiviewMsaa: !!oculus,
      anisotropy: aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1,
      maxSamples: gl.getParameter(gl.MAX_SAMPLES),
    };
    if (clip) clip.clipControlEXT(clip.LOWER_LEFT_EXT, clip.ZERO_TO_ONE_EXT);
  }

  /** Registers GLSL snippets that shaders pull in with `#include <name>`. */
  addInclude(name: string, source: string): void {
    this.includes.set(name, source);
  }

  private expand(src: string, seen = new Set<string>()): string {
    return src.replace(/^[ \t]*#include\s+<([\w/.-]+)>/gm, (_, name: string) => {
      if (seen.has(name)) return '';
      seen.add(name);
      const inc = this.includes.get(name);
      if (inc === undefined) throw new Error(`unknown shader include <${name}>`);
      return this.expand(inc, seen);
    });
  }

  /** Compiles (and caches) a program; `multiview` builds the variant that draws both eyes at once. */
  program(name: string, vertex: string, fragment: string, defines: Defines = {}): Program {
    const key = `${name}|${JSON.stringify(defines)}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    const defs = Object.entries(defines)
      .filter(([, v]) => v !== undefined && v !== false)
      .map(([k, v]) => `#define ${k} ${v === true ? 1 : v}`)
      .join('\n');
    const mv = defines.MULTIVIEW ? '#extension GL_OVR_multiview2 : require\n' : '';
    const vsHead = SHARED_HEADER + mv + defs + '\n' + (defines.MULTIVIEW ? 'layout(num_views = 2) in;\n#define VIEW_ID int(gl_ViewID_OVR)\n' : '#define VIEW_ID 0\n');
    const fsHead = SHARED_HEADER + mv + defs + '\n' + (defines.MULTIVIEW ? '#define VIEW_ID int(gl_ViewID_OVR)\n' : '#define VIEW_ID 0\n');
    const p = new Program(this.gl, name, vsHead + this.expand(vertex), fsHead + this.expand(fragment));
    this.programs.set(key, p);
    return p;
  }

  texture2D(opts: TextureOptions): Texture {
    return new Texture(this, this.gl.TEXTURE_2D, opts);
  }

  textureArray(opts: TextureOptions & { layers: number }): Texture {
    return new Texture(this, this.gl.TEXTURE_2D_ARRAY, opts);
  }

  texture3D(opts: TextureOptions & { layers: number }): Texture {
    return new Texture(this, this.gl.TEXTURE_3D, opts);
  }

  buffer(target: number, data: ArrayBufferView | number, usage: number = this.gl.STATIC_DRAW): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(target, b);
    if (typeof data === 'number') gl.bufferData(target, data, usage);
    else gl.bufferData(target, data as ArrayBufferView<ArrayBuffer>, usage);
    return b;
  }
}

// ---- programs --------------------------------------------------------------------------------------

export class Program {
  readonly handle: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly samplers = new Map<string, number>();
  private nextUnit = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly name: string,
    vs: string,
    fs: string,
  ) {
    const p = gl.createProgram()!;
    const v = compile(gl, gl.VERTEX_SHADER, vs, name);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs, name);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    // fixed attribute slots shared by every mesh layout
    for (const [i, a] of ATTRIBUTES.entries()) gl.bindAttribLocation(p, i, a);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.handle = p;
    // all uniform blocks use the binding point of the same name
    const blocks = gl.getProgramParameter(p, gl.ACTIVE_UNIFORM_BLOCKS) as number;
    for (let i = 0; i < blocks; i++) {
      const bn = gl.getActiveUniformBlockName(p, i)!;
      const slot = UNIFORM_BLOCKS.indexOf(bn);
      if (slot < 0) throw new Error(`unknown uniform block ${bn} in ${name}`);
      gl.uniformBlockBinding(p, i, slot);
    }
    // texture units are assigned once, in declaration order
    gl.useProgram(p);
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      if (isSampler(gl, info.type)) {
        const unit = this.nextUnit++;
        this.samplers.set(info.name, unit);
        gl.uniform1i(gl.getUniformLocation(p, info.name), unit);
      }
    }
  }

  use(): this {
    this.gl.useProgram(this.handle);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.uniforms.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.handle, name);
      this.uniforms.set(name, l);
    }
    return l;
  }

  /** Binds a texture to the unit reserved for sampler `name` (ignored if the shader does not use it). */
  tex(name: string, t: Texture | WebGLTexture | null, target?: number): this {
    const unit = this.samplers.get(name);
    if (unit === undefined) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (t instanceof Texture) gl.bindTexture(t.target, t.handle);
    else gl.bindTexture(target ?? gl.TEXTURE_2D, t);
    return this;
  }

  f1(name: string, x: number): this {
    this.gl.uniform1f(this.loc(name), x);
    return this;
  }
  f2(name: string, x: number, y: number): this {
    this.gl.uniform2f(this.loc(name), x, y);
    return this;
  }
  f3(name: string, x: number, y: number, z: number): this {
    this.gl.uniform3f(this.loc(name), x, y, z);
    return this;
  }
  f4(name: string, x: number, y: number, z: number, w: number): this {
    this.gl.uniform4f(this.loc(name), x, y, z, w);
    return this;
  }
  i1(name: string, x: number): this {
    this.gl.uniform1i(this.loc(name), x);
    return this;
  }
  v3(name: string, v: ArrayLike<number>): this {
    this.gl.uniform3f(this.loc(name), v[0], v[1], v[2]);
    return this;
  }
  v4(name: string, v: Float32Array): this {
    this.gl.uniform4fv(this.loc(name), v);
    return this;
  }
  m4(name: string, m: Float32Array): this {
    this.gl.uniformMatrix4fv(this.loc(name), false, m);
    return this;
  }
}

/** Vertex attribute slots, identical for every program and mesh. */
export const ATTRIBUTES = ['a_position', 'a_normal', 'a_uv', 'a_color', 'a_i0', 'a_i1', 'a_i2', 'a_i3', 'a_extra'] as const;
export const ATTR = Object.fromEntries(ATTRIBUTES.map((a, i) => [a.slice(2), i])) as Record<string, number>;

/** Uniform block binding points. */
export const UNIFORM_BLOCKS = ['Frame', 'Object'];
export const BLOCK = { frame: 0, object: 1 };

function compile(gl: WebGL2RenderingContext, type: number, src: string, name: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? '';
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log);
    const at = m ? Number(m[1]) : 0;
    const ctx = lines
      .slice(Math.max(0, at - 4), at + 2)
      .map((l, i) => `${Math.max(1, at - 3) + i}: ${l}`)
      .join('\n');
    throw new Error(`${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader ${name}: ${log}\n${ctx}`);
  }
  return s;
}

function isSampler(gl: WebGL2RenderingContext, t: number): boolean {
  return ([
    gl.SAMPLER_2D,
    gl.SAMPLER_3D,
    gl.SAMPLER_CUBE,
    gl.SAMPLER_2D_SHADOW,
    gl.SAMPLER_2D_ARRAY,
    gl.SAMPLER_2D_ARRAY_SHADOW,
    gl.INT_SAMPLER_2D,
    gl.UNSIGNED_INT_SAMPLER_2D,
  ] as number[]).includes(t);
}

// ---- textures --------------------------------------------------------------------------------------

export interface TextureOptions {
  width: number;
  height: number;
  /** sized internal format, e.g. gl.RGBA8 */
  format: number;
  filter?: 'linear' | 'nearest' | 'mipmap';
  wrap?: 'clamp' | 'repeat';
  /** depth-compare sampling (shadow maps) */
  compare?: boolean;
  anisotropy?: number;
}

export class Texture {
  readonly handle: WebGLTexture;
  width: number;
  height: number;
  readonly layers: number;

  constructor(
    private readonly dev: Device,
    readonly target: number,
    readonly opts: TextureOptions & { layers?: number },
  ) {
    const gl = dev.gl;
    this.handle = gl.createTexture()!;
    this.width = opts.width;
    this.height = opts.height;
    this.layers = opts.layers ?? 1;
    gl.bindTexture(target, this.handle);
    const mips = opts.filter === 'mipmap' ? Math.floor(Math.log2(Math.max(opts.width, opts.height))) + 1 : 1;
    if (target === gl.TEXTURE_2D_ARRAY || target === gl.TEXTURE_3D) gl.texStorage3D(target, mips, opts.format, opts.width, opts.height, this.layers);
    else gl.texStorage2D(target, mips, opts.format, opts.width, opts.height);
    const f = opts.filter ?? 'linear';
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, f === 'mipmap' ? gl.LINEAR_MIPMAP_LINEAR : f === 'linear' ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, f === 'nearest' ? gl.NEAREST : gl.LINEAR);
    const w = opts.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, w);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, w);
    if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    if (opts.compare) {
      gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, dev.caps.clipControl ? gl.GEQUAL : gl.LEQUAL);
    }
    if (opts.anisotropy && dev.ext.aniso) gl.texParameterf(target, dev.ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(opts.anisotropy, dev.caps.anisotropy));
  }

  /** Uploads a full level-0 image (or one layer) and optionally rebuilds the mip chain. */
  upload(data: ArrayBufferView | TexImageSource, layer = 0, x = 0, y = 0, w = this.width, h = this.height): void {
    const gl = this.dev.gl;
    gl.bindTexture(this.target, this.handle);
    const [fmt, type] = uploadFormat(gl, this.opts.format);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.target === gl.TEXTURE_2D_ARRAY || this.target === gl.TEXTURE_3D) {
      if (ArrayBuffer.isView(data)) gl.texSubImage3D(this.target, 0, x, y, layer, w, h, 1, fmt, type, data);
      else gl.texSubImage3D(this.target, 0, x, y, layer, w, h, 1, fmt, type, data);
    } else if (ArrayBuffer.isView(data)) gl.texSubImage2D(this.target, 0, x, y, w, h, fmt, type, data);
    else gl.texSubImage2D(this.target, 0, x, y, fmt, type, data);
  }

  generateMipmap(): void {
    const gl = this.dev.gl;
    gl.bindTexture(this.target, this.handle);
    gl.generateMipmap(this.target);
  }

  dispose(): void {
    this.dev.gl.deleteTexture(this.handle);
  }
}

function uploadFormat(gl: WebGL2RenderingContext, f: number): [number, number] {
  switch (f) {
    case gl.RGBA8:
    case gl.SRGB8_ALPHA8:
      return [gl.RGBA, gl.UNSIGNED_BYTE];
    case gl.RG8:
      return [gl.RG, gl.UNSIGNED_BYTE];
    case gl.R8:
      return [gl.RED, gl.UNSIGNED_BYTE];
    case gl.R32F:
      return [gl.RED, gl.FLOAT];
    case gl.R16F:
      return [gl.RED, gl.HALF_FLOAT];
    case gl.RG32F:
      return [gl.RG, gl.FLOAT];
    case gl.RGBA32F:
      return [gl.RGBA, gl.FLOAT];
    case gl.RGBA16F:
      return [gl.RGBA, gl.HALF_FLOAT];
    default:
      throw new Error(`no upload format for ${f}`);
  }
}

// ---- render targets ------------------------------------------------------------------------------

/** A framebuffer with colour textures (optional) and a depth texture or renderbuffer. */
export class Target {
  readonly fb: WebGLFramebuffer;
  constructor(
    private readonly dev: Device,
    readonly width: number,
    readonly height: number,
    readonly color: (Texture | WebGLRenderbuffer)[],
    readonly depth: Texture | WebGLRenderbuffer | null,
    layer = -1,
  ) {
    const gl = dev.gl;
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    color.forEach((c, i) => attach(gl, gl.COLOR_ATTACHMENT0 + i, c, layer));
    if (depth) attach(gl, gl.DEPTH_ATTACHMENT, depth, layer);
    if (color.length > 1) gl.drawBuffers(color.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    if (color.length === 0) {
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(): void {
    const gl = this.dev.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.width, this.height);
  }

  dispose(): void {
    const gl = this.dev.gl;
    gl.deleteFramebuffer(this.fb);
  }
}

function attach(gl: WebGL2RenderingContext, at: number, t: Texture | WebGLRenderbuffer, layer: number): void {
  if (t instanceof Texture) {
    if (t.target === gl.TEXTURE_2D_ARRAY || t.target === gl.TEXTURE_3D) gl.framebufferTextureLayer(gl.FRAMEBUFFER, at, t.handle, 0, Math.max(0, layer));
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, at, gl.TEXTURE_2D, t.handle, 0);
  } else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, at, gl.RENDERBUFFER, t);
}

export function renderbuffer(gl: WebGL2RenderingContext, format: number, w: number, h: number, samples: number): WebGLRenderbuffer {
  const rb = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, w, h);
  else gl.renderbufferStorage(gl.RENDERBUFFER, format, w, h);
  return rb;
}

// ---- uniform buffers -------------------------------------------------------------------------------

/** std140 uniform buffer written from a Float32Array mirror. */
export class UniformBuffer {
  readonly data: Float32Array;
  readonly handle: WebGLBuffer;
  constructor(
    private readonly gl: WebGL2RenderingContext,
    floats: number,
    readonly slot: number,
  ) {
    this.data = new Float32Array(floats);
    this.handle = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.handle);
    gl.bufferData(gl.UNIFORM_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, slot, this.handle);
  }

  flush(floats = this.data.length): void {
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.handle);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.data, 0, floats);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, this.slot, this.handle);
  }
}
