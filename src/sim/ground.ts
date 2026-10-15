import { Quaternion, Vector3 } from 'three';
import { clamp, type ControlState } from '../core/input';

export type HeightFn = (x: number, z: number) => number;

type ContactKind = 'nose' | 'main' | 'skid' | 'crash';

export interface Contact {
  p: Vector3; // body-frame position relative to the centre of gravity
  kind: ContactKind;
  k: number; // spring N/m
  c: number; // damper N·s/m
  label: string;
}

export const contact = (x: number, y: number, z: number, kind: ContactKind, label: string, k = 0, c = 0): Contact => ({
  p: new Vector3(x, y, z),
  kind,
  k,
  c,
  label,
});

export const C172_CONTACTS: Contact[] = [
  contact(0, -1.2, -1.55, 'nose', 'Bugfahrwerk', 120_000, 9_000),
  contact(-1.25, -1.2, 0.25, 'main', 'Hauptfahrwerk', 70_000, 6_000),
  contact(1.25, -1.2, 0.25, 'main', 'Hauptfahrwerk', 70_000, 6_000),
  contact(0, -0.35, 4.7, 'skid', 'Sporn', 30_000, 3_000),
  contact(-5.5, 1.05, -0.3, 'crash', 'Flügelspitze'),
  contact(5.5, 1.05, -0.3, 'crash', 'Flügelspitze'),
  contact(0, -1.0, -2.38, 'crash', 'Propeller'),
  contact(0, -0.75, -0.2, 'crash', 'Rumpf'),
  contact(0, -0.6, -1.8, 'crash', 'Motorhaube'),
  contact(0, 1.65, 4.9, 'crash', 'Seitenleitwerk'),
];

export const JET_CONTACTS: Contact[] = [
  contact(0, -1.55, -3.2, 'nose', 'Bugfahrwerk', 150_000, 15_000),
  contact(-1.3, -1.55, 0.35, 'main', 'Hauptfahrwerk', 250_000, 25_000),
  contact(1.3, -1.55, 0.35, 'main', 'Hauptfahrwerk', 250_000, 25_000),
  contact(0, -0.55, 4.9, 'skid', 'Heck', 120_000, 12_000),
  contact(-4.73, -0.35, 0.3, 'crash', 'Flügelspitze'),
  contact(4.73, -0.35, 0.3, 'crash', 'Flügelspitze'),
  contact(0, -0.45, -5.2, 'crash', 'Bug'),
  contact(0, -0.72, -1.2, 'crash', 'Rumpf'),
  contact(0, -0.65, 1.8, 'crash', 'Rumpf'),
  contact(0, 2.0, 5.2, 'crash', 'Seitenleitwerk'),
];

/** Wheel compression beyond this breaks the gear. */
const MAX_COMPRESSION = 0.4;

export interface GroundResult {
  onGround: boolean;
  crash: string | null;
  /** the crash happened on water */
  water: boolean;
}

const UP = new Vector3(0, 1, 0);
const omegaW = new Vector3();
const fw = new Vector3();
const dir = new Vector3();
const side = new Vector3();
const r = new Vector3();
const wp = new Vector3();
const vP = new Vector3();
const F = new Vector3();
const result: GroundResult = { onGround: false, crash: null, water: false };

/**
 * Spring-damper landing gear with rolling/braking/side friction.
 * Adds world-frame force and torque (about the CG) to the accumulators.
 */
export function computeGround(
  contacts: Contact[],
  /** 0 retracted … 1 down and locked */
  gear: number,
  pos: Vector3,
  vel: Vector3,
  quat: Quaternion,
  omegaBody: Vector3,
  c: ControlState,
  height: HeightFn,
  forceW: Vector3,
  torqueW: Vector3,
): GroundResult {
  result.onGround = false;
  result.crash = null;
  result.water = false;

  omegaW.copy(omegaBody).applyQuaternion(quat);
  fw.set(0, 0, -1).applyQuaternion(quat);
  fw.y = 0;
  if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1);
  fw.normalize();
  const groundSpeed = Math.hypot(vel.x, vel.z);

  const gearDown = gear > 0.98;
  for (const ct of contacts) {
    const wheel = ct.kind === 'nose' || ct.kind === 'main';
    if (wheel && !gearDown) continue;
    r.copy(ct.p).applyQuaternion(quat);
    wp.copy(pos).add(r);
    const h = height(wp.x, wp.z);
    if (h < 0 && wp.y < 0) {
      result.crash = 'Im Wasser gelandet';
      result.water = true;
      return result;
    }
    const d = h - wp.y;
    if (d <= 0) continue;
    if (ct.kind === 'crash') {
      result.crash = gear < 0.98 ? 'Bauchlandung – Fahrwerk war nicht ausgefahren' : `${ct.label} hat den Boden berührt`;
      return result;
    }
    if (ct.kind !== 'skid' && d > MAX_COMPRESSION) {
      result.crash = 'Harte Landung – Fahrwerk gebrochen';
      return result;
    }
    result.onGround = true;

    vP.crossVectors(omegaW, r).add(vel);
    const Fn = Math.max(0, ct.k * d - ct.c * vP.y);
    F.set(0, Fn, 0);

    if (ct.kind === 'skid') {
      const vh = Math.hypot(vP.x, vP.z);
      if (vh > 1e-4) {
        const f = Math.min(vh * 3000, 0.45 * Fn) / vh;
        F.x -= vP.x * f;
        F.z -= vP.z * f;
      }
    } else {
      dir.copy(fw);
      if (ct.kind === 'nose') dir.applyAxisAngle(UP, (-clamp(c.yaw) * 0.35) / (1 + groundSpeed / 20));
      side.crossVectors(dir, UP);
      const mu = ct.kind === 'main' ? 0.025 + clamp(c.brake, 0, 1) * 0.65 : 0.025;
      const fLong = -clamp(vP.dot(dir) * 4000, -mu * Fn, mu * Fn);
      const fLat = -clamp(vP.dot(side) * 5000, -0.85 * Fn, 0.85 * Fn);
      F.addScaledVector(dir, fLong).addScaledVector(side, fLat);
    }

    forceW.add(F);
    torqueW.add(r.cross(F));
  }
  return result;
}
