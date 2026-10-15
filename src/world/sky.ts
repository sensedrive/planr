import * as THREE from 'three';
import { mulberry32 } from './terrain';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, -0.5).normalize();
export const HORIZON = new THREE.Color(0xc4dbee);

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always on the far plane
    gl_Position.z *= 0.99999;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : uHorizon;
    float s = max(dot(d, uSunDir), 0.0);
    col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.25);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome with a sun; follow the camera/aircraft each frame. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTop: { value: new THREE.Color(0x3d78c2) },
      uHorizon: { value: HORIZON },
      uSunDir: { value: SUN_DIR },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.name = 'sky';
  return sky;
}

export function createLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5b5040, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sun);
}

const CLOUD_BOX = 14000;

/** Low-poly cumulus clusters that wrap around the aircraft. */
export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  private readonly base: THREE.Vector3[] = [];
  private readonly scale: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(clusters = 45) {
    const rand = mulberry32(42);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x6a7480 });
    const puffs = 6;
    this.mesh = new THREE.InstancedMesh(geo, mat, clusters * puffs);
    this.mesh.frustumCulled = false;
    for (let c = 0; c < clusters; c++) {
      const cx = (rand() - 0.5) * CLOUD_BOX;
      const cz = (rand() - 0.5) * CLOUD_BOX;
      const cy = 1100 + rand() * 500;
      for (let i = 0; i < puffs; i++) {
        this.base.push(new THREE.Vector3(cx + (rand() - 0.5) * 300, cy + rand() * 60, cz + (rand() - 0.5) * 200));
        this.scale.push(70 + rand() * 90);
      }
    }
    this.update(0, 0);
  }

  update(x: number, z: number): void {
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      this.p.set(
        b.x + CLOUD_BOX * Math.round((x - b.x) / CLOUD_BOX),
        b.y,
        b.z + CLOUD_BOX * Math.round((z - b.z) / CLOUD_BOX),
      );
      const s = this.scale[i];
      this.s.set(s, s * 0.6, s);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
