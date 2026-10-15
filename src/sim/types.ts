import { Vector3 } from 'three';
import { type AeroParams, C172_AERO, JET_AERO, makeAero } from './aero';
import { Engine, JetEngine, NoEngine, type PowerPlant, Turboprop } from './engine';
import { C172_CONTACTS, type Contact, contact, JET_CONTACTS } from './ground';

export type AircraftId = 'c172' | 'jet' | 'cub' | 'extra' | 'baron' | 'pc12' | 'beaver' | 'glider' | 'a320' | 'f16';

const DEG = Math.PI / 180;

/** Geometry the exterior model and the physics share (aircraft coordinates: −Z nose, +Y up). */
export interface ModelSpec {
  body: { noseZ: number; tailZ: number; radius: number; squash?: number; color: number; accent: number };
  nose: 'prop' | 'jet' | 'airliner' | 'glider';
  wing: { y: number; z: number; span: number; root: number; tip: number; sweep: number; dihedral: number; thick: number; tipTanks?: boolean };
  tail: { type: 'conventional' | 'T'; z: number; hSpan: number; hChord: number; vHeight: number; vChord: number };
  engines:
    | { kind: 'nose-prop'; y: number; z: number; radius: number; blades: number }
    | { kind: 'twin-prop'; x: number; y: number; z: number; radius: number; blades: number }
    | { kind: 'pods'; x: number; y: number; z: number; radius: number; length: number }
    | { kind: 'internal' }
    | { kind: 'none' };
  canopy: 'cabin' | 'bubble' | 'airliner';
  struts?: boolean;
}

export type GearSpec =
  | { type: 'tricycle'; nose: [z: number, bottom: number]; main: [z: number, track: number, bottom: number] }
  | { type: 'taildragger'; main: [z: number, track: number, bottom: number]; tail: [z: number, bottom: number] }
  | { type: 'floats'; front: number; back: number; track: number; bottom: number }
  | { type: 'glider'; main: [z: number, bottom: number]; nose: [z: number, y: number]; tail: [z: number, y: number] };

export interface AircraftType {
  id: AircraftId;
  name: string;
  /** short menu label */
  short: string;
  mass: number;
  /** about body X (pitch), Y (yaw), Z (roll) */
  inertia: Vector3;
  aero: AeroParams;
  contacts: Contact[];
  createEngine(): PowerPlant;
  /** propeller effects (torque, P-factor) apply */
  propeller: boolean;
  retractableGear: boolean;
  gear: GearSpec;
  /** flap angle at full deflection, degrees (display); 0 = no flaps */
  flapDegrees: number;
  /** pilot eye point in aircraft coordinates */
  eye: Vector3;
  cockpit: 'cabin' | 'canopy';
  cockpitHalfWidth: number;
  /** CG height above the ground and pitch (deg) when standing */
  restHeight: number;
  restPitch: number;
  /** airborne start speed (m/s) for air starts */
  cruise: number;
  /** final approach speed (m/s) */
  approach: number;
  /** take-off configuration */
  takeoff: { flaps: number; trim: number };
  sound: 'piston' | 'turboprop' | 'jet' | 'glider';
  hud: boolean;
  floats: boolean;
  /** cannot take off by itself: always starts in the air */
  glider: boolean;
  /** fastest successful ditching (kt) */
  ditchLimitKt: number;
  /** wing bending: radians per g of extra load, and natural frequency (Hz) */
  wingFlex: { perG: number; hz: number };
  model: ModelSpec;
  instruments: { maxKt: number; greenArc: [number, number]; yellowArc: [number, number]; flapArc: [number, number]; engine: 'rpm' | 'n1' | 'tq' | 'vario'; maxRpm?: number };
}

// ---- helpers ------------------------------------------------------------------------------

function inertia(mass: number, span: number, length: number): Vector3 {
  const roll = mass * span * span * 0.012;
  const pitch = mass * length * length * 0.027;
  return new Vector3(pitch, roll + pitch * 0.9, roll);
}

/** Wheel/float contacts from the gear description, springs scaled to the weight. */
function gearContacts(g: GearSpec, mass: number): Contact[] {
  const W = mass * 9.81;
  const k = (share: number) => (W * share) / 0.06;
  switch (g.type) {
    case 'tricycle': {
      const [nz, nb] = g.nose;
      const [mz, track, mb] = g.main;
      return [
        contact(0, nb, nz, 'nose', 'Bugfahrwerk', k(0.7), k(0.7) * 0.1),
        contact(-track / 2, mb, mz, 'main', 'Hauptfahrwerk', k(0.45), k(0.45) * 0.1),
        contact(track / 2, mb, mz, 'main', 'Hauptfahrwerk', k(0.45), k(0.45) * 0.1),
      ];
    }
    case 'taildragger': {
      const [mz, track, mb] = g.main;
      const [tz, tb] = g.tail;
      return [
        contact(-track / 2, mb, mz, 'main', 'Hauptfahrwerk', k(0.5), k(0.5) * 0.1),
        contact(track / 2, mb, mz, 'main', 'Hauptfahrwerk', k(0.5), k(0.5) * 0.1),
        contact(0, tb, tz, 'tail', 'Spornrad', k(0.25), k(0.25) * 0.12),
      ];
    }
    case 'floats': {
      const out: Contact[] = [];
      // most of the load rides on the step just behind the centre of gravity, so the
      // nose can be raised on the water; bow and stern only catch pitching
      // bow and stern curve up out of the water, so they only dip in when pitching
      const step = (g.front + g.back) / 2;
      for (const [z, share, lift] of [[g.front, 0.08, 0.12], [step, 0.42, 0], [g.back, 0.08, 0.3]])
        for (const s of [-1, 1]) out.push(contact((s * g.track) / 2, g.bottom + lift, z, 'float', 'Schwimmer', k(share), k(share) * 0.35));
      return out;
    }
    case 'glider': {
      const [mz, mb] = g.main;
      return [
        contact(0, mb, mz, 'main', 'Rad', k(0.9), k(0.9) * 0.1),
        contact(0, g.nose[1], g.nose[0], 'skid', 'Bugkufe', k(0.4), k(0.4) * 0.1),
        contact(0, g.tail[1], g.tail[0], 'skid', 'Spornrad', k(0.3), k(0.3) * 0.1),
      ];
    }
  }
}

/** Points that must never touch the ground: wing tips, nose, belly, fin, prop tips, engine pods. */
function crashContacts(m: ModelSpec, glider: boolean): Contact[] {
  const w = m.wing;
  const tipY = w.y + Math.tan(w.dihedral * DEG) * (w.span / 2);
  const tipZ = w.z + w.sweep + w.tip / 2;
  const belly = -m.body.radius * (m.body.squash ?? 1);
  const out: Contact[] = [
    // a glider may rest a wing tip on the ground
    contact(-w.span / 2, tipY, tipZ, glider ? 'skid' : 'crash', 'Flügelspitze', glider ? 8000 : 0, glider ? 800 : 0),
    contact(w.span / 2, tipY, tipZ, glider ? 'skid' : 'crash', 'Flügelspitze', glider ? 8000 : 0, glider ? 800 : 0),
    contact(0, belly * 0.6, m.body.noseZ + 0.3, 'crash', 'Bug'),
    contact(0, belly, (m.body.noseZ + m.body.tailZ) * 0.25, 'crash', 'Rumpf'),
    contact(0, m.tail.vHeight + m.body.radius * 0.3, m.tail.z + m.tail.vChord * 0.5, 'crash', 'Seitenleitwerk'),
  ];
  const e = m.engines;
  if (e.kind === 'nose-prop') out.push(contact(0, e.y - e.radius, e.z, 'crash', 'Propeller'));
  if (e.kind === 'twin-prop') for (const s of [-1, 1]) out.push(contact(s * e.x, e.y - e.radius, e.z, 'crash', 'Propeller'));
  if (e.kind === 'pods') for (const s of [-1, 1]) out.push(contact(s * e.x, e.y - e.radius, e.z, 'crash', 'Triebwerk'));
  return out;
}

function restOf(g: GearSpec): { height: number; pitch: number } {
  switch (g.type) {
    case 'tricycle':
      return { height: -g.main[2] - 0.03, pitch: 0 };
    case 'taildragger': {
      const [mz, , mb] = g.main;
      const [tz, tb] = g.tail;
      const pitch = Math.atan2(tb - mb, tz - mz);
      return { height: -(mb * Math.cos(pitch) - mz * Math.sin(pitch)) - 0.03, pitch: pitch / DEG };
    }
    case 'floats':
      return { height: -g.bottom - 0.25, pitch: 0 };
    case 'glider':
      return { height: -g.main[1] - 0.02, pitch: 0 };
  }
}

interface Def extends Omit<AircraftType, 'inertia' | 'contacts' | 'restHeight' | 'restPitch' | 'retractableGear' | 'floats'> {
  length: number;
  retract?: boolean;
  contacts?: Contact[];
  rest?: { height: number; pitch: number };
}

function make(d: Def): AircraftType {
  const rest = d.rest ?? restOf(d.gear);
  return {
    ...d,
    inertia: inertia(d.mass, d.aero.b, d.length),
    contacts: d.contacts ?? [...gearContacts(d.gear, d.mass), ...crashContacts(d.model, d.glider)],
    restHeight: rest.height,
    restPitch: rest.pitch,
    retractableGear: d.retract ?? false,
    floats: d.gear.type === 'floats',
  };
}

// ---- the fleet ------------------------------------------------------------------------------

export const C172: AircraftType = {
  ...make({
    id: 'c172',
    name: 'Cessna-artig (C172)',
    short: 'Cessna',
    mass: 1000,
    length: 8.3,
    aero: C172_AERO,
    contacts: C172_CONTACTS,
    rest: { height: 1.17, pitch: 0 },
    createEngine: () => new Engine({ power: 118_000, staticThrust: 2900 }),
    propeller: true,
    gear: { type: 'tricycle', nose: [-1.55, -1.2], main: [0.25, 2.5, -1.2] },
    flapDegrees: 30,
    eye: new Vector3(-0.3, 0.6, -0.6),
    cockpit: 'cabin',
    cockpitHalfWidth: 0.62,
    cruise: 55,
    approach: 34,
    takeoff: { flaps: 0, trim: 0 },
    sound: 'piston',
    hud: false,
    glider: false,
    ditchLimitKt: 75,
    wingFlex: { perG: 0.008, hz: 4 },
    model: {
      body: { noseZ: -2.3, tailZ: 5.0, radius: 0.62, squash: 1.3, color: 0xf2f1ec, accent: 0xb8322a },
      nose: 'prop',
      wing: { y: 1.05, z: -1.05, span: 11, root: 1.5, tip: 1.5, sweep: 0, dihedral: 1.7, thick: 0.14 },
      tail: { type: 'conventional', z: 4.1, hSpan: 3.4, hChord: 1.0, vHeight: 1.4, vChord: 1.0 },
      engines: { kind: 'nose-prop', y: -0.15, z: -2.4, radius: 0.85, blades: 2 },
      canopy: 'cabin',
      struts: true,
    },
    instruments: { maxKt: 180, greenArc: [48, 129], yellowArc: [129, 163], flapArc: [40, 85], engine: 'rpm' },
  }),
};

export const JET: AircraftType = make({
  id: 'jet',
  name: 'Jet-Trainer (L-39)',
  short: 'L-39',
  mass: 4500,
  length: 12.1,
  aero: JET_AERO,
  contacts: JET_CONTACTS,
  rest: { height: 1.52, pitch: 0 },
  createEngine: () => new JetEngine(16_900),
  propeller: false,
  retract: true,
  gear: { type: 'tricycle', nose: [-3.2, -1.55], main: [0.35, 2.6, -1.55] },
  flapDegrees: 44,
  eye: new Vector3(0, 0.95, -2.3),
  cockpit: 'canopy',
  cockpitHalfWidth: 0.42,
  cruise: 110,
  approach: 62,
  takeoff: { flaps: 1 / 3, trim: 0.25 },
  sound: 'jet',
  hud: true,
  glider: false,
  ditchLimitKt: 150,
  wingFlex: { perG: 0.004, hz: 6 },
  model: {
    body: { noseZ: -5.6, tailZ: 5.2, radius: 0.62, color: 0xdfe3e6, accent: 0x1f4e8c },
    nose: 'jet',
    wing: { y: -0.4, z: -0.9, span: 9.46, root: 2.6, tip: 1.4, sweep: 0.45, dihedral: 2.5, thick: 0.16, tipTanks: true },
    tail: { type: 'conventional', z: 3.9, hSpan: 4.2, hChord: 1.2, vHeight: 1.9, vChord: 1.6 },
    engines: { kind: 'internal' },
    canopy: 'bubble',
  },
  instruments: { maxKt: 450, greenArc: [100, 350], yellowArc: [350, 410], flapArc: [85, 170], engine: 'n1' },
});

export const CUB = make({
  id: 'cub',
  name: 'Piper Cub (Spornrad)',
  short: 'Cub',
  mass: 550,
  length: 6.8,
  aero: makeAero({ S: 16.6, b: 10.7, c: 1.6, CL0: 0.3, CLa: 5.0, CD0: 0.045, k: 0.06, Clda: 0.09, Clp: -0.5, Cmde: 0.33, Cm0: 0.07, propWash: 350, flapCL: 0 }),
  createEngine: () => new Engine({ power: 48_000, staticThrust: 1500, idleRpm: 600, maxRpm: 2300 }),
  propeller: true,
  gear: { type: 'taildragger', main: [-0.5, 1.8, -1.35], tail: [4.6, -0.35] },
  flapDegrees: 0,
  eye: new Vector3(0, 0.62, 0.15),
  cockpit: 'cabin',
  cockpitHalfWidth: 0.38,
  cruise: 33,
  approach: 24,
  takeoff: { flaps: 0, trim: 0 },
  sound: 'piston',
  hud: false,
  glider: false,
  ditchLimitKt: 55,
  wingFlex: { perG: 0.012, hz: 3.5 },
  model: {
    body: { noseZ: -2.2, tailZ: 4.9, radius: 0.42, squash: 1.4, color: 0xf2c12e, accent: 0x111111 },
    nose: 'prop',
    wing: { y: 1.0, z: -0.9, span: 10.7, root: 1.6, tip: 1.6, sweep: 0, dihedral: 1.0, thick: 0.13 },
    tail: { type: 'conventional', z: 4.0, hSpan: 3.2, hChord: 0.9, vHeight: 1.1, vChord: 0.9 },
    engines: { kind: 'nose-prop', y: 0.05, z: -2.3, radius: 0.9, blades: 2 },
    canopy: 'cabin',
    struts: true,
  },
  instruments: { maxKt: 120, greenArc: [35, 90], yellowArc: [90, 105], flapArc: [0, 0], engine: 'rpm' },
});

export const EXTRA = make({
  id: 'extra',
  name: 'Extra 300 (Kunstflug)',
  short: 'Extra 300',
  mass: 800,
  length: 7.1,
  aero: makeAero({
    S: 10.7, b: 8.0, c: 1.34, CL0: 0, CLa: 4.9, stallAngle: 15.5 * DEG, CD0: 0.022, k: 0.06,
    Cm0: 0.0, Cma: -0.5, Cmq: -9, Cmde: 0.42, Clda: 0.18, Clp: -0.5, Cndr: 0.12, Cnb: 0.09, propWash: 900, flapCL: 0,
  }),
  createEngine: () => new Engine({ power: 220_000, staticThrust: 4800, idleRpm: 700, maxRpm: 2700 }),
  propeller: true,
  gear: { type: 'taildragger', main: [-0.6, 1.9, -1.25], tail: [4.4, -0.4] },
  flapDegrees: 0,
  eye: new Vector3(0, 0.72, 0.2),
  cockpit: 'canopy',
  cockpitHalfWidth: 0.36,
  cruise: 75,
  approach: 38,
  takeoff: { flaps: 0, trim: 0.15 },
  sound: 'piston',
  hud: false,
  glider: false,
  ditchLimitKt: 75,
  wingFlex: { perG: 0.002, hz: 8 },
  model: {
    body: { noseZ: -2.3, tailZ: 4.6, radius: 0.5, squash: 1.2, color: 0xf4f4f2, accent: 0xd02a2a },
    nose: 'prop',
    wing: { y: -0.25, z: -0.95, span: 8.0, root: 1.9, tip: 0.85, sweep: 0.3, dihedral: 0, thick: 0.18 },
    tail: { type: 'conventional', z: 3.8, hSpan: 3.0, hChord: 0.9, vHeight: 1.2, vChord: 1.0 },
    engines: { kind: 'nose-prop', y: 0.1, z: -2.4, radius: 0.95, blades: 3 },
    canopy: 'bubble',
  },
  instruments: { maxKt: 280, greenArc: [60, 158], yellowArc: [158, 220], flapArc: [0, 0], engine: 'rpm', maxRpm: 3000 },
});

export const BARON = make({
  id: 'baron',
  name: 'Beech Baron (zweimotorig)',
  short: 'Baron',
  mass: 2300,
  length: 9.1,
  aero: makeAero({ S: 18.5, b: 11.5, c: 1.65, CL0: 0.25, CLa: 4.9, CD0: 0.026, k: 0.05, Clda: 0.07, Cmde: 0.33, Cm0: 0.04, flapCL: 0.5, gearCD: 0.015, propWash: 500 }),
  createEngine: () => new Engine({ power: 448_000, staticThrust: 9000, idleRpm: 700, maxRpm: 2700 }),
  propeller: false,
  retract: true,
  gear: { type: 'tricycle', nose: [-2.3, -1.35], main: [0.35, 3.2, -1.35] },
  flapDegrees: 30,
  eye: new Vector3(-0.3, 0.55, -1.2),
  cockpit: 'cabin',
  cockpitHalfWidth: 0.62,
  cruise: 85,
  approach: 48,
  takeoff: { flaps: 0, trim: 0.15 },
  sound: 'piston',
  hud: false,
  glider: false,
  ditchLimitKt: 95,
  wingFlex: { perG: 0.006, hz: 4.5 },
  model: {
    body: { noseZ: -3.3, tailZ: 5.8, radius: 0.62, squash: 1.2, color: 0xf3f3f1, accent: 0x1c3f7a },
    nose: 'airliner',
    wing: { y: -0.45, z: -0.9, span: 11.5, root: 2.0, tip: 1.2, sweep: 0.15, dihedral: 6, thick: 0.18 },
    tail: { type: 'conventional', z: 4.8, hSpan: 4.0, hChord: 1.1, vHeight: 1.7, vChord: 1.3 },
    engines: { kind: 'twin-prop', x: 2.3, y: -0.25, z: -1.6, radius: 0.95, blades: 3 },
    canopy: 'cabin',
  },
  instruments: { maxKt: 260, greenArc: [80, 195], yellowArc: [195, 223], flapArc: [70, 122], engine: 'rpm' },
});

export const PC12 = make({
  id: 'pc12',
  name: 'Pilatus PC-12 (Turboprop)',
  short: 'PC-12',
  mass: 4500,
  length: 14.4,
  aero: makeAero({ S: 25.8, b: 16.3, c: 1.65, CL0: 0.3, CLa: 5.0, CD0: 0.024, k: 0.045, Clda: 0.06, Cmde: 0.33, Cm0: 0.05, flapCL: 0.75, flapCD: 0.05, gearCD: 0.012, propWash: 400 }),
  createEngine: () => new Turboprop(895_000, 15_000),
  propeller: true,
  retract: true,
  gear: { type: 'tricycle', nose: [-3.0, -1.6], main: [0.5, 4.5, -1.6] },
  flapDegrees: 40,
  eye: new Vector3(-0.35, 0.7, -2.2),
  cockpit: 'cabin',
  cockpitHalfWidth: 0.7,
  cruise: 120,
  approach: 45,
  takeoff: { flaps: 0.4, trim: 0.2 },
  sound: 'turboprop',
  hud: false,
  glider: false,
  ditchLimitKt: 95,
  wingFlex: { perG: 0.01, hz: 3 },
  model: {
    body: { noseZ: -4.3, tailZ: 9.5, radius: 0.8, squash: 1.15, color: 0xf5f5f3, accent: 0x7a1f2b },
    nose: 'prop',
    wing: { y: -0.55, z: -0.8, span: 16.3, root: 2.2, tip: 1.0, sweep: 0.1, dihedral: 4, thick: 0.2 },
    tail: { type: 'T', z: 8.0, hSpan: 5.6, hChord: 1.2, vHeight: 2.6, vChord: 1.8 },
    engines: { kind: 'nose-prop', y: 0.1, z: -4.4, radius: 1.3, blades: 4 },
    canopy: 'cabin',
  },
  instruments: { maxKt: 300, greenArc: [80, 236], yellowArc: [236, 260], flapArc: [65, 165], engine: 'tq' },
});

export const BEAVER = make({
  id: 'beaver',
  name: 'DHC-2 Beaver (Wasserflugzeug)',
  short: 'Beaver',
  mass: 2050,
  length: 10.8,
  aero: makeAero({ S: 23.2, b: 14.6, c: 1.59, CL0: 0.4, CLa: 5.0, CD0: 0.05, k: 0.05, Clda: 0.07, Cmde: 0.33, Cm0: 0.08, flapCL: 0.8, propWash: 500 }),
  createEngine: () => new Engine({ power: 336_000, staticThrust: 7000, idleRpm: 600, maxRpm: 2300 }),
  propeller: true,
  gear: { type: 'floats', front: -2.6, back: 2.6, track: 2.7, bottom: -2.6 },
  flapDegrees: 40,
  eye: new Vector3(-0.3, 0.55, -1.0),
  cockpit: 'cabin',
  cockpitHalfWidth: 0.62,
  cruise: 55,
  approach: 32,
  takeoff: { flaps: 0.5, trim: 0.2 },
  sound: 'piston',
  hud: false,
  glider: false,
  ditchLimitKt: 75,
  wingFlex: { perG: 0.01, hz: 3.5 },
  model: {
    body: { noseZ: -2.7, tailZ: 6.5, radius: 0.7, squash: 1.25, color: 0xd7a21c, accent: 0x183a6b },
    nose: 'prop',
    wing: { y: 1.05, z: -1.1, span: 14.6, root: 1.6, tip: 1.6, sweep: 0, dihedral: 2, thick: 0.15 },
    tail: { type: 'conventional', z: 5.3, hSpan: 4.6, hChord: 1.2, vHeight: 1.8, vChord: 1.4 },
    engines: { kind: 'nose-prop', y: -0.05, z: -2.75, radius: 1.3, blades: 3 },
    canopy: 'cabin',
    struts: true,
  },
  instruments: { maxKt: 180, greenArc: [55, 123], yellowArc: [123, 155], flapArc: [50, 100], engine: 'rpm' },
});

export const GLIDER = make({
  id: 'glider',
  name: 'Segelflugzeug (ASK 21)',
  short: 'Segler',
  mass: 500,
  length: 8.4,
  aero: makeAero({
    S: 17.95, b: 17, c: 1.1, CL0: 0.3, CLa: 5.5, stallAngle: 11.5 * DEG, CD0: 0.0095, k: 0.022,
    Cma: -0.8, Cmq: -14, Cmde: 0.35, Cm0: 0.07, Clda: 0.09, Clp: -0.55, Cndr: 0.06, Cnb: 0.08, propWash: 0,
    // the flap lever works the air brakes: less lift, much more drag
    flapCL: -0.25, flapCD: 0.07, flapStall: -2 * DEG,
  }),
  createEngine: () => new NoEngine(),
  propeller: false,
  gear: { type: 'glider', main: [0.1, -0.85], nose: [-2.4, -0.62], tail: [5.6, -0.3] },
  flapDegrees: 0,
  eye: new Vector3(0, 0.42, -2.0),
  cockpit: 'canopy',
  cockpitHalfWidth: 0.34,
  cruise: 28,
  approach: 26,
  takeoff: { flaps: 0, trim: 0.2 },
  sound: 'glider',
  hud: false,
  glider: true,
  ditchLimitKt: 55,
  wingFlex: { perG: 0.035, hz: 2 },
  model: {
    body: { noseZ: -3.6, tailZ: 5.9, radius: 0.38, squash: 1.3, color: 0xfbfbfb, accent: 0xe03c28 },
    nose: 'glider',
    wing: { y: 0.05, z: -0.3, span: 17, root: 1.4, tip: 0.45, sweep: 0.2, dihedral: 3, thick: 0.1 },
    tail: { type: 'T', z: 4.9, hSpan: 3.2, hChord: 0.8, vHeight: 1.4, vChord: 1.1 },
    engines: { kind: 'none' },
    canopy: 'bubble',
  },
  instruments: { maxKt: 160, greenArc: [40, 97], yellowArc: [97, 151], flapArc: [0, 0], engine: 'vario' },
});

export const A320 = make({
  id: 'a320',
  name: 'Verkehrsflugzeug (A320)',
  short: 'A320',
  mass: 64_000,
  length: 37.6,
  aero: makeAero({
    S: 122.6, b: 34.1, c: 4.2, CL0: 0.2, CLa: 5.2, stallAngle: 13 * DEG, CD0: 0.021, k: 0.045,
    Cm0: 0.03, Cma: -1.0, Cmq: -20, Cmde: 0.45, trimRange: 0.6, Clda: 0.035, Clp: -0.5, Cndr: 0.05, Cnr: -0.2, Cnb: 0.12,
    flapCL: 1.2, flapStall: 2 * DEG, flapCD: 0.07, gearCD: 0.02, propWash: 0, mcrit: 0.78,
  }),
  createEngine: () => new JetEngine(240_000),
  propeller: false,
  retract: true,
  gear: { type: 'tricycle', nose: [-11.5, -3.6], main: [1.4, 7.6, -3.6] },
  flapDegrees: 40,
  eye: new Vector3(-0.5, 1.0, -15.6),
  cockpit: 'cabin',
  cockpitHalfWidth: 1.0,
  cruise: 130,
  approach: 70,
  takeoff: { flaps: 1 / 3, trim: 0.3 },
  sound: 'jet',
  hud: false,
  glider: false,
  ditchLimitKt: 150,
  wingFlex: { perG: 0.03, hz: 1.2 },
  model: {
    body: { noseZ: -18.5, tailZ: 19.0, radius: 2.0, color: 0xf6f7f8, accent: 0x14407a },
    nose: 'airliner',
    wing: { y: -1.2, z: -4.5, span: 34.1, root: 6.5, tip: 1.6, sweep: 7.5, dihedral: 5, thick: 0.5 },
    tail: { type: 'conventional', z: 13.5, hSpan: 12.5, hChord: 3.2, vHeight: 5.8, vChord: 5.0 },
    engines: { kind: 'pods', x: 5.7, y: -2.4, z: -6.0, radius: 0.95, length: 4.2 },
    canopy: 'airliner',
  },
  instruments: { maxKt: 400, greenArc: [140, 350], yellowArc: [350, 380], flapArc: [110, 200], engine: 'n1' },
});

export const F16 = make({
  id: 'f16',
  name: 'Kampfjet (F-16)',
  short: 'F-16',
  mass: 12_000,
  length: 15,
  aero: makeAero({
    S: 27.9, b: 9.96, c: 3.45, CL0: 0.1, CLa: 4.0, stallAngle: 25 * DEG, CD0: 0.019, k: 0.12,
    Cm0: 0.01, Cma: -0.4, Cmq: -10, Cmde: 0.25, trimRange: 0.5, Clda: 0.06, Clp: -0.4, Cndr: 0.07, Cnb: 0.1,
    flapCL: 0.35, flapStall: 2 * DEG, flapCD: 0.03, gearCD: 0.02, propWash: 0, mcrit: 0.9,
  }),
  createEngine: () => new JetEngine(76_000, 127_000),
  propeller: false,
  retract: true,
  gear: { type: 'tricycle', nose: [-4.0, -1.75], main: [0.8, 2.4, -1.75] },
  flapDegrees: 20,
  eye: new Vector3(0, 1.0, -4.6),
  cockpit: 'canopy',
  cockpitHalfWidth: 0.4,
  cruise: 160,
  approach: 75,
  takeoff: { flaps: 0, trim: 0.15 },
  sound: 'jet',
  hud: true,
  glider: false,
  ditchLimitKt: 170,
  wingFlex: { perG: 0.001, hz: 9 },
  model: {
    body: { noseZ: -8.0, tailZ: 7.0, radius: 0.65, squash: 1.1, color: 0x8b959f, accent: 0x5c6670 },
    nose: 'jet',
    wing: { y: -0.2, z: -1.8, span: 9.96, root: 5.0, tip: 1.0, sweep: 3.8, dihedral: 0, thick: 0.15 },
    tail: { type: 'conventional', z: 4.6, hSpan: 5.6, hChord: 1.8, vHeight: 3.2, vChord: 2.4 },
    engines: { kind: 'internal' },
    canopy: 'bubble',
  },
  instruments: { maxKt: 800, greenArc: [150, 600], yellowArc: [600, 750], flapArc: [130, 300], engine: 'n1' },
});

export const AIRCRAFT: Record<AircraftId, AircraftType> = {
  c172: C172,
  cub: CUB,
  extra: EXTRA,
  baron: BARON,
  beaver: BEAVER,
  pc12: PC12,
  glider: GLIDER,
  jet: JET,
  a320: A320,
  f16: F16,
};
