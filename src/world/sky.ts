import * as THREE from 'three';
import { mulberry32 } from './noise';
import { detailTexture } from './surfaces';
import { waterSky } from './terrain';

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
    top: 0x2c66b8,
    horizon: 0xbcd2e6,
    sunColor: 0xfff0dc,
    sunIntensity: 3.8,
    hemiSky: 0xb3cdf0,
    hemiGround: 0x6a5d47,
    hemiIntensity: 1.3,
    fogNear: 500,
    fogFar: 5200,
    cloud: 0x8f9bad,
    cloudColor: 0xffffff,
    sunGlow: 1,
  },
  evening: {
    sunDir: new THREE.Vector3(-0.8, 0.09, -0.6).normalize(),
    top: 0x24447e,
    horizon: 0xf2a768,
    sunColor: 0xffa860,
    sunIntensity: 2.6,
    hemiSky: 0xd9b7a4,
    hemiGround: 0x3d3030,
    hemiIntensity: 0.75,
    fogNear: 400,
    fogFar: 5000,
    cloud: 0x6a5468,
    cloudColor: 0xffc49a,
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
    fogNear: 400,
    fogFar: 4500,
    cloud: 0x0a0d14,
    cloudColor: 0x2a3244,
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

const cloudVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying float vHeight;
  varying float vSeed;
  void main() {
    vUv = uv;
    vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(instanceMatrix[0].xyz);
    // camera-facing quad (billboard), a bit flatter than wide
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = c.xyz + (right * position.x + up * position.y * 0.7) * s * 2.4;
    vHeight = position.y;
    vSeed = fract(c.x * 0.0137 + c.z * 0.0071);
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const cloudFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform sampler2D uNoise;
  varying vec2 vUv;
  varying float vHeight;
  varying float vSeed;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = texture2D(uNoise, vUv * 0.8 + vSeed * 7.0).r;
    float n2 = texture2D(uNoise, vUv * 2.3 + vSeed * 3.0).r;
    float r = length(p) + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.2;
    float a = smoothstep(1.0, 0.45, r) * 0.9;
    if (a < 0.02) discard;
    // sunlit tops, darker flat bases
    float lit = smoothstep(-0.45, 0.35, vHeight + (n - 0.5) * 0.35);
    vec3 col = mix(uShade, uLit, lit);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const CLUSTERS = 90;
const PUFFS = 6;
const RAIN_DROPS = 1400;
const RAIN_BOX = 70;
const LAYER_SIZE = 16000;
const LAYER_TILE = 400;

export interface WeatherLook {
  /** fraction of the sky with cumulus clusters, 0…1 */
  coverage: number;
  /** cloud base above sea level (m); null = landscape default */
  base: number | null;
  /** closed cloud layer at the base */
  overcast: boolean;
  /** 0…1 */
  rain: number;
  /** visibility (m) */
  visibility: number;
}

export const CLEAR_WEATHER: WeatherLook = { coverage: 0.15, base: null, overcast: false, rain: 0, visibility: 20000 };

function cloudLayerTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(0, 0, S, S);
  const rand = mulberry32(77);
  // soft blobs, drawn wrapped so the texture tiles
  for (let i = 0; i < 160; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 10 + rand() * 40;
    const v = 150 + rand() * 105;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(LAYER_SIZE / LAYER_TILE, LAYER_SIZE / LAYER_TILE);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sky dome, sun/moon light, fog and clouds for the selected time of day. */
export class Environment {
  readonly sky: THREE.Mesh;
  readonly clouds: THREE.InstancedMesh;
  readonly horizon = new THREE.Color();
  time: TimeOfDay = 'day';
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly base: THREE.Vector3[] = [];
  private readonly scale: number[] = [];
  private cloudTimer = 0;
  private cloudBase = 1100;
  private landscapeBase = 1100;
  private weather: WeatherLook = CLEAR_WEATHER;
  private readonly layer: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private readonly rain: THREE.LineSegments;
  private readonly drops = new Float32Array(RAIN_DROPS * 3);
  private readonly rel = new THREE.Vector3();

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
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    // real-time shadows for nearby objects; the frustum follows the aircraft
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 4000;
    scene.fog = new THREE.Fog(this.horizon, 1500, 5200);
    scene.background = this.horizon;

    const rand = mulberry32(42);
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uNoise: { value: null } },
      ]),
      fog: true,
      transparent: true,
      depthWrite: false,
    });
    this.cloudMat.uniforms.uNoise.value = detailTexture();
    const clusters = CLUSTERS;
    const puffs = PUFFS;
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.cloudMat, clusters * puffs);
    this.clouds.renderOrder = 3;
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

    // closed cloud layer (overcast)
    const layerGeo = new THREE.PlaneGeometry(LAYER_SIZE, LAYER_SIZE).rotateX(-Math.PI / 2);
    this.layer = new THREE.Mesh(
      layerGeo,
      new THREE.MeshLambertMaterial({ map: cloudLayerTexture(), transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.layer.visible = false;
    this.layer.renderOrder = 2;
    scene.add(this.layer);

    // rain streaks around the aircraft
    for (let i = 0; i < this.drops.length; i++) this.drops[i] = (rand() - 0.5) * RAIN_BOX;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8c4cf, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

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
    this.hemi.color.set(l.hemiSky);
    this.hemi.groundColor.set(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    const fog = this.scene.fog as THREE.Fog;
    // THREE.Fog copies its colour, so it has to follow the horizon explicitly
    fog.color.copy(this.horizon);
    fog.near = l.fogNear;
    fog.far = l.fogFar;
    (this.cloudMat.uniforms.uLit.value as THREE.Color).set(l.cloudColor);
    (this.cloudMat.uniforms.uShade.value as THREE.Color).set(l.cloud);
    this.applyWeather();
  }

  /** Direction towards the sun (or moon) for the current time of day. */
  /**
   * Centres the shadow frustum on `centre`; it grows with height above ground so shadows stay
   * visible from altitude. Snapped to texels to avoid shimmering.
   */
  updateShadow(centre: THREE.Vector3, heightAboveGround: number): void {
    const range = THREE.MathUtils.clamp(120 + heightAboveGround * 1.1, 120, 900);
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - range) > range * 0.15) {
      cam.left = -range;
      cam.right = range;
      cam.top = range;
      cam.bottom = -range;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * cam.right) / this.sun.shadow.mapSize.x;
    const snap = (v: number) => Math.round(v / texel) * texel;
    this.sun.target.position.set(snap(centre.x), snap(centre.y), snap(centre.z));
    this.sun.position.copy(this.sun.target.position).addScaledVector(LOOKS[this.time].sunDir, 2000);
    this.sun.target.updateMatrixWorld();
  }

  get sunDirection(): THREE.Vector3 {
    return LOOKS[this.time].sunDir;
  }

  setWeather(w: WeatherLook): void {
    this.weather = w;
    this.setTime(this.time);
  }

  /** Overlays the weather on the time-of-day look. */
  private applyWeather(): void {
    const w = this.weather;
    const l = LOOKS[this.time];
    const grey = Math.max(w.overcast ? 0.55 : 0, w.rain * 0.7);
    const greyColor = new THREE.Color(this.time === 'night' ? 0x10131a : 0x8d949b);
    this.horizon.set(l.horizon).lerp(greyColor, grey);
    (this.uniforms.uTop.value as THREE.Color).set(l.top).lerp(greyColor, grey * 0.9);
    this.uniforms.uGlow.value = l.sunGlow * (1 - grey);
    this.sun.intensity = l.sunIntensity * (1 - grey * 0.75);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.horizon);
    waterSky.value.copy(this.horizon);
    fog.far = Math.min(l.fogFar, Math.max(1200, w.visibility));
    fog.near = Math.min(l.fogNear, fog.far * 0.3);
    this.clouds.count = PUFFS * Math.round(CLUSTERS * Math.max(0, Math.min(1, w.coverage)));
    this.cloudBase = w.base ?? this.landscapeBase;
    this.layer.visible = w.overcast;
    this.layer.material.color.set(this.time === 'night' ? 0x2a2e36 : 0xffffff).multiplyScalar(1 - grey * 0.35);
    this.rain.visible = w.rain > 0;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.2 + 0.25 * w.rain;
    this.cloudTimer = 0;
  }

  setCloudBase(altitude: number): void {
    this.landscapeBase = altitude;
    this.applyWeather();
  }

  get rainLevel(): number {
    return this.weather.rain;
  }

  update(dt: number, pos: THREE.Vector3, velocity?: THREE.Vector3): void {
    this.sky.position.copy(pos);
    if (this.layer.visible) {
      this.layer.position.set(Math.round(pos.x / LAYER_TILE) * LAYER_TILE, this.cloudBase + 60, Math.round(pos.z / LAYER_TILE) * LAYER_TILE);
    }
    if (this.rain.visible) {
      // drops fall at ~9 m/s; streaks show the motion relative to the aircraft
      this.rel.set(0, -9, 0);
      if (velocity) this.rel.sub(velocity);
      const half = RAIN_BOX / 2;
      const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const out = attr.array as Float32Array;
      const len = 0.03;
      const below = pos.y > this.cloudBase + 60 ? 0 : 1; // no rain above the clouds
      for (let i = 0; i < RAIN_DROPS; i++) {
        for (let a = 0; a < 3; a++) {
          let v = this.drops[i * 3 + a] + this.rel.getComponent(a) * dt;
          if (v > half) v -= RAIN_BOX;
          else if (v < -half) v += RAIN_BOX;
          this.drops[i * 3 + a] = v;
          out[i * 6 + a] = v * below;
          out[i * 6 + 3 + a] = (v + this.rel.getComponent(a) * len) * below;
        }
      }
      attr.needsUpdate = true;
      this.rain.position.copy(pos);
    }
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
