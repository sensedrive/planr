import * as THREE from 'three';

const fragment = /* glsl */ `
  uniform float uK;
  uniform float uB;
  uniform float uR;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float inner = mix(1.1, 0.42, uK);
    float comfort = smoothstep(inner, inner + 0.35, r) * min(1.0, uK * 1.6);
    // G: tunnel vision closing in, then everything goes dark
    float gi = mix(1.3, 0.05, uB);
    float tunnel = max(smoothstep(gi, gi + 0.6, r) * min(1.0, uB * 2.0), smoothstep(0.65, 1.0, uB));
    float black = max(comfort, tunnel);
    float red = uR * 0.8;
    float a = 1.0 - (1.0 - black) * (1.0 - red);
    vec3 col = vec3(0.55, 0.02, 0.02) * red * (1.0 - black) / max(a, 1e-3);
    gl_FragColor = vec4(col, a);
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
  private readonly uniforms = { uK: { value: 0 }, uB: { value: 0 }, uR: { value: 0 } };
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

  /**
   * `rate` = angular speed of the aircraft in rad/s; `blackout` and `redout` (0…1) are the
   * G effects, shown even with the comfort vignette switched off.
   */
  update(dt: number, rate: number, active: boolean, blackout = 0, redout = 0): void {
    const target = this.enabled && active ? THREE.MathUtils.clamp((rate - 0.3) / 0.9, 0, 1) : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 6 : 2));
    this.uniforms.uK.value = this.k;
    this.uniforms.uB.value = blackout;
    this.uniforms.uR.value = redout;
    this.mesh.visible = this.k > 0.01 || blackout > 0.01 || redout > 0.01;
  }
}
