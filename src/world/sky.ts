import * as THREE from 'three';
import { mulberry32 } from './noise';

export type TimeOfDay = 'day' | 'evening' | 'night';

interface Look {
  sunDir: THREE.Vector3;
  top: number;
  horizon: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloud: number;
  cloudColor: number;
  sunGlow: number;
}

const LOOKS: Record<TimeOfDay, Look> = {
  day: {
    sunDir: new THREE.Vector3(-0.45, 0.62, -0.5).normalize(),
    top: 0x3d78c2,
    horizon: 0xc4dbee,
    sunColor: 0xfff1dc,
    sunIntensity: 2.4,
    hemiSky: 0xcfe3ff,
    hemiGround: 0x5b5040,
    hemiIntensity: 1.4,
    fogNear: 1500,
    fogFar: 5200,
    cloud: 0x6a7480,
    cloudColor: 0xffffff,
    sunGlow: 1,
  },
  evening: {
    sunDir: new THREE.Vector3(-0.8, 0.09, -0.6).normalize(),
    top: 0x2a4a86,
    horizon: 0xf0a56a,
    sunColor: 0xffb070,
    sunIntensity: 1.6,
    hemiSky: 0xf2c3a0,
    hemiGround: 0x3d3030,
    hemiIntensity: 0.9,
    fogNear: 1200,
    fogFar: 5000,
    cloud: 0x5a3a40,
    cloudColor: 0xe8b8a0,
    sunGlow: 1.6,
  },
  night: {
    sunDir: new THREE.Vector3(0.3, 0.5, 0.6).normalize(), // moon
    top: 0x02040c,
    horizon: 0x141c30,
    sunColor: 0x9fb4ff,
    sunIntensity: 0.15,
    hemiSky: 0x40507a,
    hemiGround: 0x101010,
    hemiIntensity: 0.22,
    fogNear: 900,
    fogFar: 4500,
    cloud: 0x0c1018,
    cloudColor: 0x1a2030,
    sunGlow: 0.15,
  },
};

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
  uniform float uGlow;
  uniform float uStars;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : uHorizon;
    float s = max(dot(d, uSunDir), 0.0);
    col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.25) * uGlow;
    if (uStars > 0.0 && h > 0.05) {
      vec3 cell = floor(d * 300.0);
      float star = step(0.9975, hash(cell));
      col += vec3(star) * uStars * smoothstep(0.05, 0.3, h);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUD_BOX = 14000;

/** Sky dome, sun/moon light, fog and clouds for the selected time of day. */
export class Environment {
  readonly sky: THREE.Mesh;
  readonly clouds: THREE.InstancedMesh;
  readonly horizon = new THREE.Color();
  time: TimeOfDay = 'day';
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly cloudMat: THREE.MeshLambertMaterial;
  private readonly base: THREE.Vector3[] = [];
  private readonly scale: number[] = [];
  private cloudTimer = 0;
  private cloudBase = 1100;

  constructor(private readonly scene: THREE.Scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: this.horizon },
      uSunDir: { value: new THREE.Vector3() },
      uGlow: { value: 1 },
      uStars: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky, this.sun, this.hemi);
    scene.fog = new THREE.Fog(this.horizon, 1500, 5200);
    scene.background = this.horizon;

    const rand = mulberry32(42);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const clusters = 45;
    const puffs = 6;
    this.clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.cloudMat, clusters * puffs);
    this.clouds.frustumCulled = false;
    for (let c = 0; c < clusters; c++) {
      const cx = (rand() - 0.5) * CLOUD_BOX;
      const cz = (rand() - 0.5) * CLOUD_BOX;
      const cy = rand() * 500; // offset above the cloud base
      for (let i = 0; i < puffs; i++) {
        this.base.push(new THREE.Vector3(cx + (rand() - 0.5) * 300, cy + rand() * 60, cz + (rand() - 0.5) * 200));
        this.scale.push(70 + rand() * 90);
      }
    }
    scene.add(this.clouds);
    this.setTime('day');
    this.placeClouds(0, 0);
  }

  setTime(time: TimeOfDay): void {
    this.time = time;
    const l = LOOKS[time];
    this.horizon.set(l.horizon);
    (this.uniforms.uTop.value as THREE.Color).set(l.top);
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(l.sunDir);
    this.uniforms.uGlow.value = l.sunGlow;
    this.uniforms.uStars.value = time === 'night' ? 0.8 : 0;
    this.sun.color.set(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.position.copy(l.sunDir).multiplyScalar(1000);
    this.hemi.color.set(l.hemiSky);
    this.hemi.groundColor.set(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    const fog = this.scene.fog as THREE.Fog;
    // THREE.Fog copies its colour, so it has to follow the horizon explicitly
    fog.color.copy(this.horizon);
    fog.near = l.fogNear;
    fog.far = l.fogFar;
    this.cloudMat.emissive.set(l.cloud);
    this.cloudMat.color.set(l.cloudColor);
  }

  setCloudBase(altitude: number): void {
    this.cloudBase = altitude;
    this.cloudTimer = 0;
  }

  update(dt: number, pos: THREE.Vector3): void {
    this.sky.position.copy(pos);
    this.cloudTimer -= dt;
    if (this.cloudTimer <= 0) {
      this.cloudTimer = 0.5;
      this.placeClouds(pos.x, pos.z);
    }
  }

  private placeClouds(x: number, z: number): void {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      p.set(b.x + CLOUD_BOX * Math.round((x - b.x) / CLOUD_BOX), this.cloudBase + b.y, b.z + CLOUD_BOX * Math.round((z - b.z) / CLOUD_BOX));
      const sc = this.scale[i];
      s.set(sc, sc * 0.6, sc);
      m.compose(p, q, s);
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
