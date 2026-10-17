import { type Device, type Program, Target, type Texture } from '../gl/device';
import { aerialFS, multiscatterFS, skyViewFS, transmittanceFS } from '../shaders/atmosphere';
import { fullscreenVS } from '../shaders/common';

export interface AtmosphereState {
  /** horizontal visibility near the ground (m) */
  visibility: number;
  /** extra ground fog / rain haze 0…1 */
  fog: number;
  /** cloud deck: base (m) and how much sunlight gets through below it (0…1) */
  cloudBase: number;
  cloudLight: number;
}

/** Owns the atmosphere LUTs; the medium LUTs only change with the weather, the views every frame. */
export class Atmosphere {
  readonly transmittance: Texture;
  readonly multiscatter: Texture;
  readonly skyView: Texture;
  readonly aerial: Texture;
  /** km covered by the aerial-perspective volume */
  readonly aerialRange = 120;
  readonly mie = new Float32Array(4);
  private readonly tTarget: Target;
  private readonly mTarget: Target;
  private readonly sTarget: Target;
  private readonly aTargets: Target[] = [];
  private readonly pT: Program;
  private readonly pM: Program;
  private readonly pS: Program;
  private readonly pA: Program;
  private mediumKey = '';
  private aerialCursor = 0;
  private cloud = [10, 1];

  constructor(private readonly dev: Device) {
    const gl = dev.gl;
    const fmt = dev.caps.halfFloatTarget ? gl.RGBA16F : gl.RGBA8;
    this.transmittance = dev.texture2D({ width: 256, height: 64, format: fmt });
    this.multiscatter = dev.texture2D({ width: 32, height: 32, format: fmt });
    this.skyView = dev.texture2D({ width: 192, height: 108, format: fmt, filter: 'mipmap' });
    this.aerial = dev.texture3D({ width: 64, height: 40, layers: 24, format: fmt });
    this.tTarget = new Target(dev, 256, 64, [this.transmittance], null);
    this.mTarget = new Target(dev, 32, 32, [this.multiscatter], null);
    this.sTarget = new Target(dev, 192, 108, [this.skyView], null);
    for (let i = 0; i < this.aerial.layers; i++) this.aTargets.push(new Target(dev, 64, 40, [this.aerial], null, i));
    this.pT = dev.program('atm-transmittance', fullscreenVS, transmittanceFS);
    this.pM = dev.program('atm-multiscatter', fullscreenVS, multiscatterFS);
    this.pS = dev.program('atm-skyview', fullscreenVS, skyViewFS);
    this.pA = dev.program('atm-aerial', fullscreenVS, aerialFS);
  }

  /**
   * Recomputes what changed. `height` is the camera altitude (m), `sunY` the sine of the sun's
   * elevation. `aerialLayers` limits how many aerial slices are refreshed this frame (VR budget).
   */
  update(state: AtmosphereState, height: number, sunY: number, aerialLayers = Infinity): void {
    const gl = this.dev.gl;
    const visKm = Math.max(0.3, state.visibility / 1000);
    // Koschmieder: extinction ≈ 3.912 / visibility; the rest beyond Rayleigh is haze
    const haze = Math.max(0.002, (3.912 / visKm - 0.0116) / 1.11);
    this.mie[0] = Math.min(haze, 0.6) * (1 - state.fog * 0.5);
    this.mie[1] = 1.2;
    this.mie[2] = state.fog * Math.min(haze * 2, 2.5);
    this.mie[3] = 0.35;
    this.cloud = [state.cloudBase / 1000, state.cloudLight];
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    const key = `${this.mie.join()}|${this.cloud.join()}`;
    if (key !== this.mediumKey) {
      this.mediumKey = key;
      this.tTarget.bind();
      this.pT.use().v4('u_mie', this.mie);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.mTarget.bind();
      this.pM.use().v4('u_mie', this.mie).tex('u_transmittance', this.transmittance).f4('u_cloud', this.cloud[0], this.cloud[1], 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      aerialLayers = Infinity;
    }
    const radius = 6360 + Math.max(height, 1) / 1000;
    for (const p of [this.pS, this.pA]) {
      p.use()
        .v4('u_mie', this.mie)
        .tex('u_transmittance', this.transmittance)
        .tex('u_multiscatter', this.multiscatter)
        .f3('u_sun', 0, sunY, 0)
        .f4('u_cloud', this.cloud[0], this.cloud[1], 0, 0)
        .f1('u_radius', radius);
    }
    this.sTarget.bind();
    this.pS.use();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.skyView.generateMipmap();

    this.pA.use().f1('u_range', this.aerialRange);
    const n = this.aerial.layers;
    const count = Math.min(n, aerialLayers);
    for (let k = 0; k < count; k++) {
      const i = this.aerialCursor;
      this.aerialCursor = (this.aerialCursor + 1) % n;
      this.aTargets[i].bind();
      this.pA.f1('u_slice', i / (n - 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /** Binds the LUTs a scene shader samples. */
  bind(p: Program): void {
    p.tex('u_transmittanceLut', this.transmittance).tex('u_skyViewLut', this.skyView).tex('u_aerialLut', this.aerial).v4('u_mie', this.mie);
  }
}
