import { Vector3 } from 'three';
import { type AeroParams, C172_AERO, JET_AERO } from './aero';
import { Engine, JetEngine, type PowerPlant } from './engine';
import { C172_CONTACTS, type Contact, JET_CONTACTS } from './ground';

export type AircraftId = 'c172' | 'jet';

export interface AircraftType {
  id: AircraftId;
  name: string;
  mass: number;
  /** about body X (pitch), Y (yaw), Z (roll) */
  inertia: Vector3;
  aero: AeroParams;
  contacts: Contact[];
  createEngine(): PowerPlant;
  /** propeller effects (torque, P-factor) apply */
  propeller: boolean;
  retractableGear: boolean;
  /** flap angle at full deflection, degrees (display) */
  flapDegrees: number;
  /** pilot eye point in aircraft coordinates */
  eye: Vector3;
  cockpit: 'cabin' | 'canopy';
  /** CG height above the runway when standing */
  restHeight: number;
  /** airborne start speed (m/s) for air starts */
  cruise: number;
  /** final approach speed (m/s) */
  approach: number;
  instruments: { maxKt: number; greenArc: [number, number]; yellowArc: [number, number]; flapArc: [number, number]; engine: 'rpm' | 'n1' };
}

export const C172: AircraftType = {
  id: 'c172',
  name: 'Cessna-artig',
  mass: 1000,
  inertia: new Vector3(1825, 2667, 1285),
  aero: C172_AERO,
  contacts: C172_CONTACTS,
  createEngine: () => new Engine(),
  propeller: true,
  retractableGear: false,
  flapDegrees: 30,
  eye: new Vector3(-0.3, 0.6, -0.6),
  cockpit: 'cabin',
  restHeight: 1.17,
  cruise: 55,
  approach: 34,
  instruments: { maxKt: 180, greenArc: [48, 129], yellowArc: [129, 163], flapArc: [40, 85], engine: 'rpm' },
};

export const JET: AircraftType = {
  id: 'jet',
  name: 'Jet-Trainer',
  mass: 4500,
  inertia: new Vector3(22_000, 26_000, 6_000),
  aero: JET_AERO,
  contacts: JET_CONTACTS,
  createEngine: () => new JetEngine(),
  propeller: false,
  retractableGear: true,
  flapDegrees: 44,
  eye: new Vector3(0, 0.95, -2.3),
  cockpit: 'canopy',
  restHeight: 1.52,
  cruise: 110,
  approach: 62,
  instruments: { maxKt: 450, greenArc: [100, 350], yellowArc: [350, 410], flapArc: [85, 170], engine: 'n1' },
};

export const AIRCRAFT: Record<AircraftId, AircraftType> = { c172: C172, jet: JET };
