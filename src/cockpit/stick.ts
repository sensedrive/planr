import * as THREE from 'three';
import { clamp, type ControlState } from '../core/input';

/** Pilot eye point in aircraft coordinates (left seat). */
export const EYE = new THREE.Vector3(-0.3, 0.6, -0.6);

export const STICK = {
  pivot: new THREE.Vector3(EYE.x, -0.5, -0.95),
  length: 0.6,
  /** hand travel (m) for full deflection */
  travel: 0.13,
};
const STICK_ANGLE = Math.atan(STICK.travel / STICK.length);

export const THROTTLE = {
  pivot: new THREE.Vector3(-0.5, -0.05, -0.8),
  length: 0.24,
  /** lever angle at idle (+, tilted back) and full power (−) */
  maxAngle: 0.4,
};

const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d1d1f });
const gripMat = new THREE.MeshLambertMaterial({ color: 0x2a2724 });
const redMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
const knobMat = new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x111111 });
const highlightMat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35, depthWrite: false });

/** Control stick and throttle lever, visually driven by the ControlState. */
export class Controls3D {
  readonly group = new THREE.Group();
  private readonly stick = new THREE.Group();
  private readonly lever = new THREE.Group();
  readonly stickGlow: THREE.Mesh;
  readonly throttleGlow: THREE.Mesh;

  constructor() {
    // stick: pivot group rotates, shaft points up
    this.stick.position.copy(STICK.pivot);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, STICK.length, 8).translate(0, STICK.length / 2, 0), darkMat);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.12, 10).translate(0, STICK.length + 0.02, 0), gripMat);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).translate(0, STICK.length + 0.085, -0.008), redMat);
    this.stickGlow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8).translate(0, STICK.length + 0.03, 0), highlightMat);
    this.stickGlow.visible = false;
    this.stick.add(shaft, grip, button, this.stickGlow);
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 10).translate(0, 0.06, 0), darkMat);
    boot.position.copy(STICK.pivot);

    // throttle: lever on the left console
    this.lever.position.copy(THROTTLE.pivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, THROTTLE.length, 0.02).translate(0, THROTTLE.length / 2, 0), darkMat);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.07).translate(0, THROTTLE.length + 0.01, 0), knobMat);
    this.throttleGlow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8).translate(0, THROTTLE.length + 0.01, 0), highlightMat);
    this.throttleGlow.visible = false;
    this.lever.add(arm, knob, this.throttleGlow);
    const quadrant = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.32), darkMat);
    quadrant.position.copy(THROTTLE.pivot).add(new THREE.Vector3(0, -0.03, 0));

    this.group.add(this.stick, boot, this.lever, quadrant);
  }

  update(c: ControlState): void {
    this.stick.rotation.set(clamp(c.pitch) * STICK_ANGLE, 0, -clamp(c.roll) * STICK_ANGLE);
    this.lever.rotation.x = throttleAngle(c.throttle);
  }
}

export function throttleAngle(throttle: number): number {
  return THROTTLE.maxAngle - clamp(throttle, 0, 1) * 2 * THROTTLE.maxAngle;
}

/** Stick grip position (aircraft coordinates) for the given deflection. */
export function stickHead(pitch: number, roll: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .set(0, STICK.length + 0.03, 0)
    .applyEuler(new THREE.Euler(clamp(pitch) * STICK_ANGLE, 0, -clamp(roll) * STICK_ANGLE))
    .add(STICK.pivot);
}

export function throttleHead(throttle: number, out: THREE.Vector3): THREE.Vector3 {
  const a = throttleAngle(throttle);
  return out.set(0, Math.cos(a) * THROTTLE.length, Math.sin(a) * THROTTLE.length).add(THROTTLE.pivot);
}

/** Inverse of throttleHead along Z: lever position from a hand target. */
export function throttleFromZ(z: number): number {
  const s = clamp((z - THROTTLE.pivot.z) / THROTTLE.length);
  const a = Math.asin(s);
  return clamp((THROTTLE.maxAngle - a) / (2 * THROTTLE.maxAngle), 0, 1);
}
