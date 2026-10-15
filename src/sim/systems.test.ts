import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../core/input';
import { Aircraft } from './aircraft';
import { AIRCRAFT, type AircraftId } from './types';

const DT = 1 / 120;
const flat = () => 30;

function airborne(id: AircraftId, speed: number) {
  const ac = new Aircraft();
  ac.setType(AIRCRAFT[id]);
  ac.reset({ position: new Vector3(0, 1500, 0), heading: 0, speed, spool: 0.7 });
  const c = createControlState();
  c.throttle = 0.75;
  c.gear = 0;
  return { ac, c };
}

function run(ac: Aircraft, c: ReturnType<typeof createControlState>, seconds: number) {
  for (let i = 0; i < seconds * 120 && !ac.crashed; i++) ac.step(DT, c, flat);
}

describe('autopilot', () => {
  it.each(['c172', 'pc12', 'a320'] as const)('%s turns to the selected heading and climbs to the selected altitude', (id) => {
    const t = AIRCRAFT[id];
    const { ac, c } = airborne(id, t.cruise);
    if (id === 'a320') c.throttle = 0.9;
    ac.systems.toggle('ap', ac);
    expect(ac.systems.ap.on).toBe(true);
    const startFt = ac.systems.ap.altitudeFt;
    for (let i = 0; i < 9; i++) ac.systems.toggle('hdgUp', ac); // 090
    ac.systems.toggle('altUp', ac);
    run(ac, c, 150);
    expect(ac.crashed).toBe(false);
    expect(ac.systems.ap.on).toBe(true);
    expect(Math.abs(((ac.headingDeg - 90 + 540) % 360) - 180)).toBeLessThan(4);
    expect(Math.abs(ac.altitudeFt - (startFt + 500))).toBeLessThan(80);
    expect(Math.abs(ac.rollDeg)).toBeLessThan(3);
  });

  it('disconnects when the pilot pulls hard', () => {
    const { ac, c } = airborne('c172', 55);
    ac.systems.toggle('ap', ac);
    run(ac, c, 2);
    c.pitch = 0.9;
    ac.step(DT, c, flat);
    expect(ac.systems.ap.on).toBe(false);
    expect(ac.systems.notice).toContain('übersteuert');
  });

  it('cannot be engaged on the ground', () => {
    const ac = new Aircraft();
    ac.reset({ position: new Vector3(0, 30 + ac.type.restHeight, 0), heading: 0 });
    ac.systems.toggle('ap', ac);
    expect(ac.systems.ap.on).toBe(false);
  });
});

describe('engine start and fuel', () => {
  it.each(['c172', 'pc12', 'jet'] as const)('%s starts from cold and dark with battery, pump and ignition', (id) => {
    const t = AIRCRAFT[id];
    const ac = new Aircraft();
    ac.setType(t);
    ac.reset({ position: new Vector3(0, 30 + t.restHeight, 0), heading: 0, running: false });
    const c = createControlState();
    expect(ac.engine.running).toBe(false);
    expect(ac.systems.parkBrake).toBe(true);
    // starter without power does nothing
    ac.systems.toggle('starter', ac);
    expect(ac.systems.starting).toBe(false);
    ac.systems.toggle('battery', ac);
    ac.systems.toggle('fuelPump', ac);
    ac.systems.toggle('ignition', ac);
    ac.systems.toggle('starter', ac);
    run(ac, c, 7);
    expect(ac.engine.running).toBe(true);
    // parking brake holds against a little power
    c.throttle = 0.15;
    run(ac, c, 5);
    expect(Math.hypot(ac.vel.x, ac.vel.z)).toBeLessThan(0.5);
  });

  it('the engine stops when the ignition is switched off', () => {
    const { ac, c } = airborne('c172', 55);
    ac.systems.toggle('ignition', ac);
    run(ac, c, 1);
    expect(ac.engine.running).toBe(false);
    expect(ac.systems.notice).toContain('Zündung');
  });

  it('burns fuel and starves the engine when the tank runs dry', () => {
    const { ac, c } = airborne('c172', 55);
    c.throttle = 1;
    const before = ac.systems.fuel;
    run(ac, c, 60);
    const perHour = (before - ac.systems.fuel) * 60;
    expect(perHour).toBeGreaterThan(25);
    expect(perHour).toBeLessThan(45);
    ac.systems.fuel = 0.001;
    run(ac, c, 1);
    expect(ac.engine.running).toBe(false);
    expect(ac.systems.notice).toContain('Tank leer');
  });
});
