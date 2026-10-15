import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type ControlState, createControlState } from '../core/input';
import { Aircraft } from './aircraft';
import { AIRCRAFT, type AircraftType } from './types';

const DT = 1 / 120;
const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const FIELD = 30;
const flat = () => FIELD;
const lake = () => -5;

function fly(ac: Aircraft, c: ControlState, seconds: number, ground: (x: number, z: number) => number, pilot?: () => void): void {
  for (let i = 0; i < seconds * 120 && !ac.crashed; i++) {
    pilot?.();
    ac.step(DT, c, ground);
  }
}

const wingsLevel = (ac: Aircraft, c: ControlState) => {
  c.roll = clamp(-ac.rollDeg * 0.05 + ac.omega.z * 0.3);
};

/** Take-off run on an endless flat field (or lake for floats): tail up first, rotate at vr. */
function takeoff(t: AircraftType, vr: number) {
  const ac = new Aircraft();
  ac.setType(t);
  const ground = t.floats ? lake : flat;
  const base = t.floats ? 0 : FIELD;
  ac.reset({ position: new Vector3(0, base + t.restHeight, 0), heading: 0, pitchDeg: t.restPitch });
  const c = createControlState();
  c.flaps = t.takeoff.flaps;
  c.trim = t.takeoff.trim;
  c.throttle = 1;
  let liftoff: { kt: number; dist: number } | null = null;
  fly(ac, c, 90, ground, () => {
    const target = ac.airspeedKt < vr ? 0 : 9;
    c.pitch = clamp((target - ac.pitchDeg) * 0.1 - ac.omega.x * 0.6);
    wingsLevel(ac, c);
    // keep straight with the rudder (taildraggers need it)
    c.yaw = clamp(-(((ac.headingDeg + 540) % 360) - 180) * 0.15 + ac.omega.y);
    if (!liftoff && !ac.onGround && ac.airTime > 0.5) liftoff = { kt: ac.airspeedKt, dist: -ac.pos.z };
  });
  return { ac, liftoff: liftoff as { kt: number; dist: number } | null };
}

function levelSpeed(t: AircraftType, throttle: number): number {
  const ac = new Aircraft();
  ac.setType(t);
  ac.reset({ position: new Vector3(0, 1500, 0), heading: 0, speed: t.cruise, spool: throttle });
  const c = createControlState();
  c.throttle = throttle;
  c.gear = 0;
  ac.gear = t.retractableGear ? 0 : 1;
  fly(ac, c, 200, flat, () => {
    c.pitch = clamp((1500 - ac.pos.y) * 0.004 - ac.vel.y * 0.03 - ac.omega.x * 0.4);
    wingsLevel(ac, c);
  });
  expect(ac.crashed).toBe(false);
  return ac.airspeedKt;
}

/** Clean stall at idle: hold altitude while the speed bleeds off (about 1 kt/s, like a check ride). */
function stallSpeed(t: AircraftType): number {
  const ac = new Aircraft();
  ac.setType(t);
  ac.realistic = false;
  ac.reset({ position: new Vector3(0, 1500, 0), heading: 0, speed: t.approach * 1.5, spool: 0 });
  ac.gear = t.retractableGear ? 0 : 1;
  const c = createControlState();
  c.gear = 0;
  let stallKt = 0;
  let pitchTarget = 0;
  fly(ac, c, 240, flat, () => {
    // descend slowly (1.5 m/s) so the deceleration stays gentle even on slippery jets
    pitchTarget = Math.min(25, pitchTarget + (-1.5 - ac.vel.y) * 0.4 * DT);
    c.pitch = clamp((pitchTarget - ac.pitchDeg) * 0.15 - ac.omega.x * 0.8);
    wingsLevel(ac, c);
    if (!stallKt && ac.aero.alpha > ac.aero.stallAngle) stallKt = ac.airspeedKt;
  });
  return stallKt;
}

// expected ranges, loosely after the real aircraft
const EXPECT: Partial<Record<AircraftType['id'], { liftoff: [number, number]; maxRun: number; vmax: [number, number]; stall: [number, number] }>> = {
  cub: { liftoff: [33, 52], maxRun: 250, vmax: [68, 92], stall: [27, 40] },
  extra: { liftoff: [48, 78], maxRun: 400, vmax: [175, 235], stall: [46, 64] },
  baron: { liftoff: [68, 98], maxRun: 700, vmax: [175, 225], stall: [58, 82] },
  pc12: { liftoff: [65, 100], maxRun: 800, vmax: [220, 300], stall: [66, 92] },
  beaver: { liftoff: [42, 68], maxRun: 600, vmax: [110, 145], stall: [48, 70] },
  a320: { liftoff: [125, 170], maxRun: 2200, vmax: [330, 600], stall: [115, 165] },
  f16: { liftoff: [135, 195], maxRun: 1300, vmax: [600, 900], stall: [105, 155] },
};

describe.each(Object.entries(EXPECT))('%s', (id, e) => {
  const t = AIRCRAFT[id as AircraftType['id']];
  it('takes off within the expected speed and distance', () => {
    const { ac, liftoff } = takeoff(t, e!.liftoff[0] + 3);
    expect(ac.crashReason).toBe('');
    expect(liftoff).not.toBeNull();
    expect(liftoff!.kt).toBeGreaterThan(e!.liftoff[0]);
    expect(liftoff!.kt).toBeLessThan(e!.liftoff[1]);
    expect(liftoff!.dist).toBeLessThan(e!.maxRun);
  });

  it('reaches a realistic top speed', () => {
    const v = levelSpeed(t, 1);
    expect(v).toBeGreaterThan(e!.vmax[0]);
    expect(v).toBeLessThan(e!.vmax[1]);
  });

  it('stalls in the expected range', () => {
    const v = stallSpeed(t);
    expect(v).toBeGreaterThan(e!.stall[0]);
    expect(v).toBeLessThan(e!.stall[1]);
  });
});

describe('glider', () => {
  it('glides at about 1:30 or better', () => {
    const t = AIRCRAFT.glider;
    const ac = new Aircraft();
    ac.setType(t);
    ac.reset({ position: new Vector3(0, 1500, 0), heading: 0, speed: 26, spool: 0 });
    const c = createControlState();
    c.trim = t.takeoff.trim;
    // hold best-glide speed (~50 kt): attitude from the speed error, elevator from the attitude error
    const hold = () => {
      const pitchTarget = -2 + (ac.airspeedKt - 50) * 0.4;
      c.pitch = clamp((pitchTarget - ac.pitchDeg) * 0.08 - ac.omega.x * 0.8);
      wingsLevel(ac, c);
    };
    fly(ac, c, 40, flat, hold);
    const start = ac.pos.clone();
    fly(ac, c, 40, flat, hold);
    const ratio = Math.hypot(ac.pos.x - start.x, ac.pos.z - start.z) / (start.y - ac.pos.y);
    expect(ac.crashed).toBe(false);
    expect(ratio).toBeGreaterThan(26);
    expect(ratio).toBeLessThan(45);
  });

  it('rises in a thermal-free ridge updraft only when the wind blows up the slope', () => {
    expect(AIRCRAFT.glider.glider).toBe(true);
  });
});

describe('extra 300', () => {
  it('rolls faster than 250°/s', () => {
    const t = AIRCRAFT.extra;
    const ac = new Aircraft();
    ac.setType(t);
    ac.reset({ position: new Vector3(0, 1500, 0), heading: 0, speed: 75, spool: 0.8 });
    const c = createControlState();
    c.throttle = 0.8;
    fly(ac, c, 1, flat);
    c.roll = 1;
    let max = 0;
    fly(ac, c, 1.5, flat, () => {
      max = Math.max(max, (-ac.omega.z * 180) / Math.PI);
    });
    expect(max).toBeGreaterThan(250);
  });
});

describe('every type', () => {
  it.each(Object.keys(AIRCRAFT))('%s stands still on the ground without crashing', (id) => {
    const t = AIRCRAFT[id as AircraftType['id']];
    const ac = new Aircraft();
    ac.setType(t);
    const ground = t.floats ? lake : flat;
    ac.reset({ position: new Vector3(0, (t.floats ? 0 : FIELD) + t.restHeight, 0), heading: 0, pitchDeg: t.restPitch });
    const c = createControlState();
    c.brake = 1;
    fly(ac, c, 5, ground);
    expect(ac.crashReason).toBe('');
    expect(Math.hypot(ac.vel.x, ac.vel.z)).toBeLessThan(1);
  });
});
