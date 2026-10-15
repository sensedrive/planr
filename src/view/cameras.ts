import * as THREE from 'three';
import { EYE } from '../cockpit/stick';

export type CameraMode = 'cockpit' | 'chase';

const CHASE_OFFSET = new THREE.Vector3(0, 2.8, 13);
const Y = new THREE.Vector3(0, 1, 0);
/** desktop cockpit looks slightly down so the panel is in view */
const COCKPIT_PITCH = -0.2;

/**
 * Desktop: cockpit view (mouse-look) or smoothed chase view.
 * VR: the camera lives in `xrRig`, a child of the aircraft, so the head moves freely in the cabin.
 */
export class CameraRig {
  mode: CameraMode = 'cockpit';
  readonly xrRig = new THREE.Group();
  private yaw = 0;
  private pitch = COCKPIT_PITCH;
  private readonly smoothQuat = new THREE.Quaternion();
  private readonly look = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private recenterIn = -1;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    private readonly aircraft: THREE.Object3D,
    dom: HTMLElement,
  ) {
    this.xrRig.name = 'xr-rig';
    this.xrRig.position.copy(EYE);
    aircraft.add(this.xrRig);
    scene.add(camera);

    let dragging = false;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', () => (dragging = false));
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw -= e.movementX * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.2, 1.2);
    });
    dom.addEventListener('dblclick', () => this.resetLook());
  }

  toggle(): void {
    this.mode = this.mode === 'cockpit' ? 'chase' : 'cockpit';
    this.resetLook();
  }

  private resetLook(): void {
    this.yaw = 0;
    this.pitch = this.mode === 'cockpit' ? COCKPIT_PITCH : 0;
  }

  get inCockpit(): boolean {
    return this.mode === 'cockpit' || this.camera.parent === this.xrRig;
  }

  onXRStart(): void {
    this.xrRig.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.recenterIn = 0.4; // wait for the first head poses
  }

  onXREnd(): void {
    this.scene.add(this.camera);
    this.xrRig.position.copy(EYE);
    this.xrRig.rotation.set(0, 0, 0);
  }

  /** Places the rig so the current head pose maps onto the pilot eye point, facing forward. */
  recenter(): void {
    if (this.camera.parent !== this.xrRig) return;
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const headYaw = this.euler.y;
    this.xrRig.rotation.set(0, -headYaw, 0);
    this.v.copy(this.camera.position).applyAxisAngle(Y, -headYaw);
    this.xrRig.position.copy(EYE).sub(this.v);
  }

  update(dt: number): void {
    if (this.camera.parent === this.xrRig) {
      if (this.recenterIn > 0) {
        this.recenterIn -= dt;
        if (this.recenterIn <= 0) this.recenter();
      }
      return;
    }
    const ac = this.aircraft;
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.look.setFromEuler(this.euler);
    if (this.mode === 'cockpit') {
      this.camera.position.copy(EYE).applyQuaternion(ac.quaternion).add(ac.position);
      this.camera.quaternion.copy(ac.quaternion).multiply(this.look);
      this.smoothQuat.copy(ac.quaternion);
    } else {
      this.smoothQuat.slerp(ac.quaternion, 1 - Math.exp(-dt * 3));
      const orient = this.smoothQuat.clone().multiply(this.look);
      this.camera.position.copy(CHASE_OFFSET).applyQuaternion(orient).add(ac.position);
      this.camera.up.set(0, 1, 0).applyQuaternion(this.smoothQuat);
      this.camera.lookAt(this.v.set(0, 1.2, 0).applyQuaternion(this.smoothQuat).add(ac.position));
    }
  }
}
