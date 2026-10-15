import * as THREE from 'three';
import type { ButtonId, Controls3D } from '../cockpit/controls3d';
import type { ControlState } from '../core/input';

/**
 * Desktop: click cockpit handles. Left click = down / more / nose-up / right,
 * right click = the opposite; the gear lever toggles. A drag (mouse look) is not a click.
 */
export class CockpitMouse {
  visuals: Controls3D | null = null;
  enabled = true;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private down: { x: number; y: number; button: number } | null = null;
  private hovered: THREE.Mesh | null = null;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    private readonly controls: ControlState,
    private readonly onHint: (label: string) => void,
    private readonly onButton: (id: ButtonId) => void = () => {},
  ) {
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, button: e.button };
    });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || !this.enabled || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const button = this.pickButton(e);
      if (button) {
        this.onButton(button);
        return;
      }
      const handle = this.pick(e);
      if (!handle?.click) return;
      handle.click(this.controls, d.button === 2 ? -1 : 1);
      this.onHint(handle.label);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.enabled || e.buttons) return;
      const handle = this.pick(e);
      const glow = handle?.click ? handle.glow : null;
      if (glow !== this.hovered) {
        if (this.hovered) this.hovered.visible = false;
        this.hovered = glow;
        if (glow) glow.visible = true;
        this.dom.style.cursor = glow ? 'pointer' : '';
      }
    });
  }

  private pickButton(e: PointerEvent): ButtonId | null {
    if (!this.visuals) return null;
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.visuals.buttons.map((b) => b.mesh),
      false,
    )[0];
    return hit ? (this.visuals.buttons.find((b) => b.mesh === hit.object)?.id ?? null) : null;
  }

  private pick(e: PointerEvent) {
    if (!this.visuals) return null;
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const handles = this.visuals.handles;
    // the (invisible) glow spheres are bigger than the knobs and make small handles easy to hit
    const targets = handles.flatMap((h) => [h.hit, h.glow]);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    return handles.find((h) => h.hit === hits[0].object || h.glow === hits[0].object) ?? null;
  }
}
