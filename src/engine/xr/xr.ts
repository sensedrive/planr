import * as THREE from 'three';
import { WebXRController } from 'three';
import type { Device } from '../gl/device';
import { type Fov, fovFromProjection } from '../math';
import type { Output, ViewInput } from '../render/renderer';

/**
 * WebXR session handling: projection layer with a texture array (multiview, both eyes in one pass)
 * where the browser supports WebXR layers, otherwise the classic XRWebGLLayer drawn eye by eye.
 *
 * Controllers and hands are exposed like three.js's WebXRManager does (target-ray, grip and hand
 * spaces as groups with the same events), so the cockpit input code works unchanged.
 */
export class XRSystem extends THREE.EventDispatcher<{ sessionstart: object; sessionend: object }> {
  isPresenting = false;
  session: XRSession | null = null;
  /** frame callback while presenting: time (ms), frame */
  onFrame: ((time: number, frame: XRFrame) => void) | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private binding: XRWebGLBinding | null = null;
  private projLayer: XRProjectionLayer | null = null;
  private baseLayer: XRWebGLLayer | null = null;
  private readonly controllers: WebXRController[] = [];
  private readonly sources: (XRInputSource | null)[] = [];
  /** fixed foveated rendering level 0…1 */
  foveation = 1;
  /** resolution relative to the headset's recommendation */
  scale = 1;

  constructor(private readonly dev: Device) {
    super();
  }

  static async supported(): Promise<boolean> {
    return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false));
  }

  private controller(i: number): WebXRController {
    let c = this.controllers[i];
    if (!c) {
      c = new WebXRController();
      this.controllers[i] = c;
    }
    return c;
  }

  getController(i: number): THREE.XRTargetRaySpace {
    return this.controller(i).getTargetRaySpace();
  }

  getControllerGrip(i: number): THREE.XRGripSpace {
    return this.controller(i).getGripSpace();
  }

  getHand(i: number): THREE.XRHandSpace {
    return this.controller(i).getHandSpace();
  }

  async start(): Promise<void> {
    if (this.session || !navigator.xr) return;
    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers'],
    });
    const gl = this.dev.gl;
    await (gl as WebGL2RenderingContext & { makeXRCompatible(): Promise<void> }).makeXRCompatible();
    this.session = session;
    this.refSpace = await session.requestReferenceSpace('local-floor');

    const useLayers = this.dev.caps.multiview && typeof XRWebGLBinding !== 'undefined' && 'XRProjectionLayer' in window;
    if (useLayers) {
      try {
        this.binding = new XRWebGLBinding(session, gl);
        this.projLayer = this.binding.createProjectionLayer({
          textureType: 'texture-array',
          colorFormat: gl.RGBA8,
          depthFormat: 0,
          scaleFactor: this.scale,
        });
        this.projLayer.fixedFoveation = this.foveation;
        session.updateRenderState({ layers: [this.projLayer] } as XRRenderStateInit);
      } catch (e) {
        console.warn('XR layers unavailable, falling back to XRWebGLLayer', e);
        this.binding = null;
        this.projLayer = null;
      }
    }
    if (!this.projLayer) {
      this.baseLayer = new XRWebGLLayer(session, gl, { antialias: true, alpha: false, depth: true, framebufferScaleFactor: this.scale });
      if ('fixedFoveation' in this.baseLayer) (this.baseLayer as XRWebGLLayer & { fixedFoveation: number }).fixedFoveation = this.foveation;
      session.updateRenderState({ baseLayer: this.baseLayer, depthNear: 0.05, depthFar: 100000 });
    }

    const forward = (e: XRInputSourceEvent) => {
      const i = this.sources.indexOf(e.inputSource);
      if (i < 0) return;
      const c = this.controllers[i];
      if (!c) return;
      c.update(e.inputSource, e.frame, this.refSpace!);
      c.dispatchEvent({ type: e.type, data: e.inputSource } as never);
    };
    for (const t of ['select', 'selectstart', 'selectend', 'squeeze', 'squeezestart', 'squeezeend'] as const) session.addEventListener(t, forward as EventListener);
    session.addEventListener('inputsourceschange', (e) => this.onSources(e as XRInputSourcesChangeEvent));
    session.addEventListener('end', () => this.onEnd());
    this.isPresenting = true;
    this.dispatchEvent({ type: 'sessionstart' });
    // inputs that are already connected
    this.onSources({ added: [...session.inputSources], removed: [] } as unknown as XRInputSourcesChangeEvent);
    session.requestAnimationFrame(this.loop);
  }

  end(): void {
    void this.session?.end();
  }

  private onSources(e: XRInputSourcesChangeEvent): void {
    for (const s of e.removed) {
      const i = this.sources.indexOf(s);
      if (i >= 0) {
        this.sources[i] = null;
        this.controllers[i]?.disconnect(s);
      }
    }
    for (const s of e.added) {
      let i = this.sources.indexOf(s);
      if (i < 0) {
        for (let k = 0; k < this.controllers.length; k++) {
          if (k >= this.sources.length) {
            this.sources.push(s);
            i = k;
            break;
          }
          if (this.sources[k] === null) {
            this.sources[k] = s;
            i = k;
            break;
          }
        }
        if (i < 0) continue;
      }
      this.controllers[i]?.connect(s);
    }
  }

  private onEnd(): void {
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      if (s) this.controllers[i]?.disconnect(s);
      this.sources[i] = null;
    }
    this.session = null;
    this.projLayer = null;
    this.baseLayer = null;
    this.binding = null;
    this.isPresenting = false;
    this.dispatchEvent({ type: 'sessionend' });
  }

  private readonly loop = (time: number, frame: XRFrame) => {
    if (!this.session) return;
    this.session.requestAnimationFrame(this.loop);
    for (let i = 0; i < this.controllers.length; i++) {
      const s = this.sources[i];
      if (s) this.controllers[i].update(s, frame, this.refSpace!);
    }
    this.frame = frame;
    this.onFrame?.(time, frame);
    this.frame = null;
  };

  private frame: XRFrame | null = null;

  /**
   * Head pose and per-eye views for the current frame in reference-space coordinates, plus where to
   * render them. Null when there is no pose (tracking lost).
   */
  views(): { head: XRRigidTransform; views: { local: Float32Array; fov: Fov }[]; output: Output } | null {
    const frame = this.frame;
    if (!frame || !this.refSpace) return null;
    const pose = frame.getViewerPose(this.refSpace);
    if (!pose) return null;
    const views = pose.views.map((v) => ({ local: v.transform.matrix, fov: fovFromProjection(v.projectionMatrix) }));
    if (this.projLayer && this.binding) {
      const sub = this.binding.getViewSubImage(this.projLayer, pose.views[0]);
      return {
        head: pose.transform,
        views,
        output: { kind: 'xr-multiview', color: sub.colorTexture, width: sub.viewport.width, height: sub.viewport.height },
      };
    }
    const layer = this.baseLayer!;
    return {
      head: pose.transform,
      views,
      output: {
        kind: 'xr-views',
        framebuffer: layer.framebuffer,
        viewports: pose.views.map((v) => {
          const vp = layer.getViewport(v)!;
          return [vp.x, vp.y, vp.width, vp.height] as [number, number, number, number];
        }),
      },
    };
  }
}

/** World-space view inputs for the renderer: reference-space views placed by the rig's world matrix. */
export function rigViews(rig: THREE.Object3D, views: { local: Float32Array; fov: Fov }[]): ViewInput[] {
  rig.updateMatrixWorld();
  const m = new THREE.Matrix4();
  return views.map((v) => {
    m.multiplyMatrices(rig.matrixWorld, new THREE.Matrix4().fromArray(Array.from(v.local)));
    return { matrix: m.elements.slice(), fov: v.fov };
  });
}
