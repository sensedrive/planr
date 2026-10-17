import type * as THREE from 'three';

/** What the VR input code needs from an XR system: three.js's WebXRManager and the engine's XRSystem both fit. */
export interface XRControllerSource {
  getController(index: number): THREE.XRTargetRaySpace;
  getControllerGrip(index: number): THREE.XRGripSpace;
  getHand(index: number): THREE.XRHandSpace;
}
