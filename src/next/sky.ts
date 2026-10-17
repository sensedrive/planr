import * as THREE from 'three';
import type { Environment } from '../engine/render/renderer';
import type { TimeOfDay } from '../world/sky';
import { mulberry32 } from '../world/noise';

export interface WeatherLook {
  /** 0…1 share of the sky with clouds */
  coverage: number;
  /** cloud base (m) or null for the landscape's default */
  base: number | null;
  overcast: boolean;
  rain: number;
  /** horizontal visibility (m) */
  visibility: number;
}

export const CLEAR_WEATHER: WeatherLook = { coverage: 0.15, base: null, overcast: false, rain: 0, visibility: 70000 };

const LIGHT: Record<TimeOfDay, [number, number, number]> = {
  day: [-0.45, 0.62, -0.5],
  evening: [-0.8, 0.075, -0.6],
  night: [0.3, 0.5, 0.6],
};

const RAIN_DROPS = 2500;
const RAIN_BOX = 40;

/**
 * Time of day and weather as the renderer sees them, plus rain streaks around the aircraft.
 */
export class Sky {
  time: TimeOfDay = 'day';
  weather: WeatherLook = CLEAR_WEATHER;
  /** landscape default cloud base */
  landscapeBase = 1100;
  waterColor: [number, number, number] = [0.02, 0.07, 0.09];
  readonly rain: THREE.LineSegments;
  private readonly drops = new Float32Array(RAIN_DROPS * 3);
  private readonly rel = new THREE.Vector3();
  readonly env: Environment;

  constructor(scene: THREE.Object3D) {
    const rand = mulberry32(99);
    for (let i = 0; i < this.drops.length; i++) this.drops[i] = (rand() - 0.5) * RAIN_BOX;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8a96a3, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.env = {
      lightDir: [0, 1, 0],
      night: 0,
      overcast: 0,
      rain: 0,
      visibility: 70000,
      cloudBase: 1100,
      cloudTop: 2600,
      coverage: 0.3,
      waterColor: this.waterColor,
      waves: 0.4,
      exposure: 1,
    };
    this.apply();
  }

  get sunDirection(): THREE.Vector3 {
    return new THREE.Vector3(...LIGHT[this.time]).normalize();
  }

  get rainLevel(): number {
    return this.weather.rain;
  }

  get cloudBase(): number {
    return this.weather.base ?? this.landscapeBase;
  }

  setTime(t: TimeOfDay): void {
    this.time = t;
    this.apply();
  }

  setWeather(w: WeatherLook): void {
    this.weather = w;
    this.apply();
  }

  setCloudBase(base: number): void {
    this.landscapeBase = base;
    this.apply();
  }

  setWater(hex: number): void {
    const c = new THREE.Color(hex);
    // the old colours were display-referred surface tints; deep water is much darker
    this.waterColor[0] = c.r * 0.35;
    this.waterColor[1] = c.g * 0.45;
    this.waterColor[2] = c.b * 0.5;
  }

  private apply(): void {
    const e = this.env;
    const d = this.sunDirection;
    e.lightDir = [d.x, d.y, d.z];
    e.night = this.time === 'night' ? 1 : 0;
    const w = this.weather;
    e.overcast = w.overcast ? 1 : 0;
    e.rain = w.rain;
    e.visibility = Math.min(w.visibility * (w.overcast || w.rain ? 1 : 4), 80000);
    e.cloudBase = this.cloudBase;
    e.cloudTop = this.cloudBase + (w.overcast ? 900 : 1600);
    e.coverage = w.overcast ? 1 : w.coverage;
    e.waves = 0.3 + w.rain * 0.5 + (w.overcast ? 0.2 : 0);
    this.rain.visible = w.rain > 0;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.15 + 0.25 * w.rain;
  }

  update(dt: number, pos: THREE.Vector3, velocity?: THREE.Vector3): void {
    if (!this.rain.visible) return;
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
}
