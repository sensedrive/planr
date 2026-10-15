import * as THREE from 'three';

const fragment = /* glsl */ `
  uniform float uK;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float inner = mix(1.1, 0.42, uK);
    float a = smoothstep(inner, inner + 0.35, r) * min(1.0, uK * 1.6);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Comfort vignette: darkens the periphery while the aircraft rotates quickly.
 * Attached to the camera so it stays head-locked in VR.
 */
export class Vignette {
  enabled = true;
  private readonly mesh: THREE.Mesh;
  private readonly uniforms = { uK: { value: 0 } };
  private k = 0;

  constructor(camera: THREE.Camera) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.position.z = -0.1;
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  /** `rate` = angular speed of the aircraft in rad/s. */
  update(dt: number, rate: number, active: boolean): void {
    const target = this.enabled && active ? THREE.MathUtils.clamp((rate - 0.3) / 0.9, 0, 1) : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 6 : 2));
    this.uniforms.uK.value = this.k;
    this.mesh.visible = this.k > 0.01;
  }
}
