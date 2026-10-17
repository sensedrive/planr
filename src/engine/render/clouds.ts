import { type Defines, type Device, type Program, Target, type Texture } from '../gl/device';
import { cloudFS, cloudVS, noiseGenFS } from '../shaders/clouds';
import { fullscreenVS } from '../shaders/common';

export interface CloudSettings {
  /** resolution relative to the output */
  scale: number;
  steps: number;
  lightSteps: number;
  /** metres the march reaches */
  range: number;
}

/** Ray-marched cloud layer at reduced resolution; scene shaders composite it (see cloudLookup). */
export class Clouds {
  readonly shape: Texture;
  readonly detail: Texture;
  light: Texture | null = null;
  depth: Texture | null = null;
  private targets: { w: number; h: number; layer0: Target; multiview: WebGLFramebuffer | null } | null = null;
  private frame = 0;

  constructor(private readonly dev: Device) {
    const gl = dev.gl;
    this.shape = dev.texture3D({ width: 64, height: 64, layers: 64, format: gl.RG8, wrap: 'repeat', filter: 'linear' });
    this.detail = dev.texture3D({ width: 32, height: 32, layers: 32, format: gl.R8, wrap: 'repeat', filter: 'linear' });
    // R/RG 3D textures need REPEAT on all three axes
    for (const t of [this.shape, this.detail]) {
      gl.bindTexture(gl.TEXTURE_3D, t.handle);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    }
    const gen = dev.program('cloud-noise', fullscreenVS, noiseGenFS);
    gen.use();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    for (const [tex, kind] of [
      [this.shape, 0],
      [this.detail, 1],
    ] as const) {
      for (let i = 0; i < tex.layers; i++) {
        const t = new Target(dev, tex.width, tex.height, [tex], null, i);
        t.bind();
        gen.f1('u_slice', (i + 0.5) / tex.layers).i1('u_kind', kind).f1('u_size', tex.width);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        t.dispose();
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  programs(defines: Defines): Program {
    return this.dev.program('clouds', cloudVS, cloudFS, defines);
  }

  /** (Re)creates the cloud targets for an output size. */
  ensure(w: number, h: number, multiview: boolean): void {
    const gl = this.dev.gl;
    if (this.targets && this.targets.w === w && this.targets.h === h && !!this.targets.multiview === multiview) return;
    this.light?.dispose();
    this.depth?.dispose();
    this.targets?.layer0.dispose();
    if (this.targets?.multiview) gl.deleteFramebuffer(this.targets.multiview);
    const fmt = this.dev.caps.halfFloatTarget ? gl.RGBA16F : gl.RGBA8;
    this.light = this.dev.textureArray({ width: w, height: h, layers: 2, format: fmt });
    this.depth = this.dev.textureArray({ width: w, height: h, layers: 2, format: this.dev.caps.halfFloatTarget ? gl.R16F : gl.R8 });
    const layer0 = new Target(this.dev, w, h, [this.light, this.depth], null, 0);
    let mv: WebGLFramebuffer | null = null;
    if (multiview) {
      mv = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, mv);
      const ext = this.dev.ext.multiview!;
      ext.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.light.handle, 0, 0, 2);
      ext.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, this.depth.handle, 0, 0, 2);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.targets = { w, h, layer0, multiview: mv };
  }

  /** Marches the clouds for the current frame block (both views when `multiview`). */
  render(p: Program, s: CloudSettings, base: number, top: number, coverage: number, density: number, multiview: boolean, bindAtmosphere: (p: Program) => void): void {
    const gl = this.dev.gl;
    const t = this.targets!;
    if (multiview) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.multiview);
      gl.viewport(0, 0, t.w, t.h);
    } else t.layer0.bind();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    p.use();
    bindAtmosphere(p);
    p.tex('u_shape', this.shape).tex('u_detail', this.detail);
    p.f4('u_cloudParams', base, top, coverage, density).f4('u_cloudSteps', s.steps, s.lightSteps, s.range, this.frame++ % 64);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
