import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { approachAxis, type ControlState, createControlState } from '../core/input';
import { HOME, runwayPoint } from '../world/airports';
import { surfaceHeight } from '../world/terrain';
import { Aircraft } from './aircraft';
import { type AircraftType, C172, JET } from './types';

const DT = 1 / 120;
const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));

function onRunway(t: AircraftType): Aircraft {
  const ac = new Aircraft();
  ac.setType(t);
  ac.reset({ position: runwayPoint(HOME, -HOME.length / 2 + 60, 0, t.restHeight), heading: HOME.heading });
  return ac;
}

function inAir(t: AircraftType, altitude: number, speed: number, spool: number): Aircraft {
  const ac = new Aircraft();
  ac.setType(t);
  ac.reset({ position: new Vector3(0, altitude, 0), heading: 0, speed, spool });
  return ac;
}

/** Runs the simulation; `pilot` may adjust the controls before every step. Stops on a crash. */
function fly(ac: Aircraft, c: ControlState, seconds: number, pilot?: (t: number) => void): void {
  for (let i = 0; i < seconds * 120 && !ac.crashed; i++) {
    pilot?.(i * DT);
    ac.step(DT, c, surfaceHeight);
  }
}

const wingsLevel = (ac: Aircraft, c: ControlState) => {
  c.roll = clamp(-ac.rollDeg * 0.05 + ac.omega.z * 0.3);
};

/** Banks gently to track the runway 36 centreline (x = 0, heading 360). */
const trackCentreline = (ac: Aircraft, c: ControlState) => {
  const hdgErr = ((ac.headingDeg + 540) % 360) - 180;
  const wanted = clamp(-ac.pos.x * 0.3, -20, 20);
  const bank = clamp((wanted - hdgErr) * 1.2, -12, 12);
  c.roll = clamp((bank - ac.rollDeg) * 0.05 + ac.omega.z * 0.3);
};

/** Takeoff run with a gentle rotation to `pitchDeg`. Returns liftoff speed and distance. */
function takeoff(t: AircraftType, vr: number, pitchDeg = 10) {
  const ac = onRunway(t);
  const c = createControlState();
  if (t.id === 'jet') {
    c.flaps = 1 / 3;
    c.trim = 0.25;
  }
  c.throttle = 1;
  const z0 = ac.pos.z;
  let liftoff: { kt: number; dist: number; x: number } | null = null;
  fly(ac, c, 60, () => {
    if (ac.airspeedKt > vr) c.pitch = clamp((pitchDeg - ac.pitchDeg) * 0.1 - ac.omega.x * 0.6);
    wingsLevel(ac, c);
    if (!liftoff && !ac.onGround && ac.airTime > 0.5) liftoff = { kt: ac.airspeedKt, dist: z0 - ac.pos.z, x: ac.pos.x };
  });
  return { ac, liftoff: liftoff as { kt: number; dist: number; x: number } | null };
}

/** Holds altitude with the elevator at fixed throttle; returns the settled airspeed in knots. */
function levelSpeed(t: AircraftType, throttle: number): number {
  const ac = inAir(t, 1500, t.cruise, throttle);
  const c = createControlState();
  c.throttle = throttle;
  c.gear = 0;
  fly(ac, c, 150, () => {
    c.pitch = clamp((1500 - ac.pos.y) * 0.004 - ac.vel.y * 0.03 - ac.omega.x * 0.4);
    wingsLevel(ac, c);
  });
  expect(ac.crashed).toBe(false);
  return ac.airspeedKt;
}

/** Idle, elevator ramps to full over 25 s; returns the speed when the wing stalls. */
function stallSpeed(t: AircraftType, realistic: boolean) {
  const ac = inAir(t, 1500, t.cruise, 0);
  ac.realistic = realistic;
  const c = createControlState();
  c.gear = 0;
  let stallKt = 0;
  let warnKt = 0;
  let minPitchAfter = 90;
  fly(ac, c, 40, (time) => {
    c.pitch = Math.min(1, time / 25);
    wingsLevel(ac, c);
    if (!warnKt && ac.stallWarning) warnKt = ac.airspeedKt;
    if (!stallKt && ac.aero.alpha > ac.aero.stallAngle) stallKt = ac.airspeedKt;
    if (stallKt) minPitchAfter = Math.min(minPitchAfter, ac.pitchDeg);
  });
  return { ac, stallKt, warnKt, minPitchAfter };
}

/**
 * Stabilised 3° approach to runway 36 and a flare, flown by a small cascaded autopilot:
 * pitch-attitude hold inside, speed via pitch and glide path via throttle outside.
 */
function land(t: AircraftType, vApp: number) {
  const ac = new Aircraft();
  ac.setType(t);
  const before = 2500;
  const glide = Math.tan((3 * Math.PI) / 180);
  ac.reset({
    position: runwayPoint(HOME, -HOME.length / 2 - before, 0, (before + 300) * glide + t.restHeight),
    heading: 0,
    speed: vApp / 1.944,
    pathDeg: -3,
    flaps: 1,
    spool: t.id === 'jet' ? 0.5 : 0.3,
  });
  ac.gear = 1;
  const c = createControlState();
  c.flaps = 1;
  c.throttle = ac.engine.spool;
  const ground = HOME.center.y + t.restHeight;
  const aimZ = HOME.length / 2 - 300;
  let integ = 0;
  let touchdown: { kt: number; fpm: number; along: number } | null = null;
  const holdPitch = (target: number) => {
    const e = target - ac.pitchDeg;
    integ = clamp(integ + e * 0.02 * DT, -0.6, 0.6);
    c.pitch = clamp(e * 0.08 + integ - ac.omega.x * 1.5);
  };
  fly(ac, c, 150, () => {
    const agl = ac.pos.y - ground;
    if (touchdown || (ac.onGround && agl < 1)) {
      if (!touchdown) touchdown = { kt: ac.airspeedKt, fpm: ac.verticalSpeedFpm, along: HOME.length / 2 - ac.pos.z };
      c.throttle = 0;
      c.brake = 1;
      c.pitch = 0;
    } else if (agl > 10) {
      holdPitch(clamp((ac.airspeedKt - vApp) * 0.4, -6, 8));
      const vsTarget = -ac.aero.airspeed * Math.sin((3 * Math.PI) / 180) + ((ac.pos.z - aimZ) * glide - agl) * 0.08;
      c.throttle = clamp(c.throttle + (vsTarget - ac.vel.y) * 0.08 * DT, 0, 1);
    } else {
      // flare: idle and raise the nose to arrest the sink
      c.throttle = 0;
      holdPitch(clamp(3 + (-0.3 - ac.vel.y) * 3, 2, 10));
    }
    trackCentreline(ac, c);
  });
  return { ac, touchdown: touchdown as { kt: number; fpm: number; along: number } | null };
}

describe('Cessna-like single', () => {
  it('lifts off around 55–65 kt within 300 m', () => {
    const { ac, liftoff } = takeoff(C172, 50);
    expect(ac.crashed).toBe(false);
    expect(liftoff).not.toBeNull();
    expect(liftoff!.kt).toBeGreaterThan(52);
    expect(liftoff!.kt).toBeLessThan(68);
    expect(liftoff!.dist).toBeLessThan(300);
    // stays on the runway with realistic prop effects and no rudder
    expect(Math.abs(liftoff!.x)).toBeLessThan(HOME.width / 2);
  });

  it('reaches realistic level speeds', () => {
    const full = levelSpeed(C172, 1);
    expect(full).toBeGreaterThan(110);
    expect(full).toBeLessThan(130);
    const cruise = levelSpeed(C172, 0.6);
    expect(cruise).toBeGreaterThan(85);
    expect(cruise).toBeLessThan(105);
  });

  it('stalls in the low 40s with a warning first and a nose drop', () => {
    const { ac, stallKt, warnKt, minPitchAfter } = stallSpeed(C172, false);
    expect(ac.crashed).toBe(false);
    expect(stallKt).toBeGreaterThan(36);
    expect(stallKt).toBeLessThan(50);
    expect(warnKt).toBeGreaterThan(stallKt);
    expect(minPitchAfter).toBeLessThan(5);
  });

  it('spins in realistic mode without numerical blow-up', () => {
    const { ac } = stallSpeed(C172, true);
    expect(ac.crashReason).not.toBe('Flugzustand außer Kontrolle');
    expect(Number.isFinite(ac.pos.y)).toBe(true);
  });

  it('lands softly on a stabilised approach and stops on the runway', () => {
    const { ac, touchdown } = land(C172, 62);
    expect(ac.crashed).toBe(false);
    expect(touchdown).not.toBeNull();
    expect(touchdown!.fpm).toBeGreaterThan(-500);
    expect(touchdown!.along).toBeGreaterThan(0);
    expect(ac.airspeedKt).toBeLessThan(5);
  });

  it('survives a clumsy keyboard takeoff', () => {
    const ac = onRunway(C172);
    const c = createControlState();
    c.throttle = 1;
    let rotate: number | null = null;
    fly(ac, c, 60, (time) => {
      if (rotate === null && ac.airspeedKt > 55) rotate = time;
      const target = rotate !== null && time < rotate + 1 ? 1 : 0;
      c.pitch = approachAxis(c.pitch, target, DT, 1.5);
      wingsLevel(ac, c);
    });
    expect(ac.crashed).toBe(false);
    expect(ac.pos.y - HOME.center.y).toBeGreaterThan(50);
  });
});

describe('jet trainer', () => {
  it('lifts off around 110–130 kt within 900 m', () => {
    const { ac, liftoff } = takeoff(JET, 105);
    expect(ac.crashed).toBe(false);
    expect(liftoff!.kt).toBeGreaterThan(105);
    expect(liftoff!.kt).toBeLessThan(135);
    expect(liftoff!.dist).toBeLessThan(900);
  });

  it('tops out around 400 kt', () => {
    const v = levelSpeed(JET, 1);
    expect(v).toBeGreaterThan(370);
    expect(v).toBeLessThan(440);
  });

  it('stalls clean around 100 kt', () => {
    const { stallKt } = stallSpeed(JET, false);
    expect(stallKt).toBeGreaterThan(88);
    expect(stallKt).toBeLessThan(112);
  });

  it('lands with gear down on a stabilised approach', () => {
    const { ac, touchdown } = land(JET, 125);
    expect(ac.crashed).toBe(false);
    expect(touchdown).not.toBeNull();
    expect(touchdown!.fpm).toBeGreaterThan(-600);
    expect(ac.airspeedKt).toBeLessThan(5);
  });

  it('belly-lands when the gear is up', () => {
    const ac = onRunway(JET);
    ac.gear = 0;
    ac.pos.y += 0.3;
    ac.onGround = false;
    const c = createControlState();
    c.gear = 0;
    fly(ac, c, 3);
    expect(ac.crashed).toBe(true);
    expect(ac.crashReason).toContain('Bauchlandung');
  });

  it('cannot retract the gear on the ground', () => {
    const ac = onRunway(JET);
    const c = createControlState();
    c.gear = 0;
    fly(ac, c, 8);
    expect(ac.gear).toBe(1);
    expect(ac.crashed).toBe(false);
  });
});
