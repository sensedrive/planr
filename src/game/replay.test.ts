import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createFrame, FlightRecorder, LIGHT } from './replay';

function frame(t: number, x = t) {
  const f = createFrame();
  f.t = t;
  f.pos.set(x, 100 + x, -2 * x);
  f.throttle = Math.min(1, t / 10);
  f.rpm = 1000 + t * 10;
  return f;
}

describe('FlightRecorder', () => {
  it('records at most at its sample rate', () => {
    const rec = new FlightRecorder(20, 10);
    let stored = 0;
    // render frames at 90 Hz for 2 s
    for (let i = 0; i <= 180; i++) if (rec.record(frame(i / 90))) stored++;
    expect(stored).toBeGreaterThanOrEqual(39);
    expect(stored).toBeLessThanOrEqual(41);
    expect(rec.length).toBe(stored);
    expect(rec.startTime).toBe(0);
    expect(rec.endTime).toBeCloseTo(2, 1);
  });

  it('keeps only the last N seconds in the ring buffer', () => {
    const rec = new FlightRecorder(20, 3);
    expect(rec.capacity).toBe(60);
    for (let i = 0; i < 200; i++) rec.record(frame(i / 20));
    expect(rec.length).toBe(60);
    expect(rec.endTime).toBeCloseTo(199 / 20);
    expect(rec.startTime).toBeCloseTo(140 / 20);
    expect(rec.duration).toBeCloseTo(59 / 20);
    // oldest and newest survive the wrap-around in the right order
    expect(rec.sample(rec.startTime).pos.x).toBeCloseTo(7);
    expect(rec.sample(rec.endTime).pos.x).toBeCloseTo(9.95);
  });

  it('interpolates positions and controls between frames', () => {
    const rec = new FlightRecorder(20, 60);
    for (let i = 0; i < 100; i++) rec.record(frame(i / 20));
    const s = rec.sample(1.025); // halfway between frames 20 and 21
    expect(s.t).toBeCloseTo(1.025);
    expect(s.pos.x).toBeCloseTo(1.025);
    expect(s.pos.y).toBeCloseTo(101.025);
    expect(s.pos.z).toBeCloseTo(-2.05);
    expect(s.rpm).toBeCloseTo(1010.25);
    expect(s.throttle).toBeCloseTo(0.1025);
  });

  it('interpolates the attitude along the shortest arc', () => {
    const rec = new FlightRecorder(10, 10);
    const a = frame(0);
    a.quat.setFromAxisAngle(new Vector3(0, 1, 0), 0);
    const b = frame(0.1);
    b.quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    rec.record(a);
    rec.record(b);
    const s = rec.sample(0.05);
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
    expect(s.quat.angleTo(expected)).toBeLessThan(1e-6);
    expect(s.quat.length()).toBeCloseTo(1);
  });

  it('clamps outside the recorded range and keeps flags from the earlier frame', () => {
    const rec = new FlightRecorder(20, 10);
    const a = frame(5);
    a.onGround = true;
    a.lights = LIGHT.power | LIGHT.nav;
    const b = frame(5.05);
    b.onGround = false;
    b.engineRunning = true;
    b.lights = LIGHT.power | LIGHT.landing;
    rec.record(a);
    rec.record(b);
    expect(rec.sample(0).pos.x).toBeCloseTo(5);
    expect(rec.sample(99).pos.x).toBeCloseTo(5.05);
    const mid = rec.sample(5.04);
    expect(mid.onGround).toBe(true);
    expect(mid.engineRunning).toBe(false);
    expect(mid.lights).toBe(LIGHT.power | LIGHT.nav);
    const end = rec.sample(5.05);
    expect(end.engineRunning).toBe(true);
    expect(end.lights & LIGHT.landing).toBeTruthy();
  });

  it('starts over when the time goes backwards (new flight) and can be forced', () => {
    const rec = new FlightRecorder(20, 10);
    for (let i = 0; i < 50; i++) rec.record(frame(i / 20));
    rec.record(frame(0.2));
    expect(rec.length).toBe(1);
    expect(rec.record(frame(0.21))).toBe(false);
    expect(rec.record(frame(0.21), true)).toBe(true);
    expect(rec.length).toBe(2);
    rec.clear();
    expect(rec.length).toBe(0);
    expect(rec.duration).toBe(0);
  });

  it('returns the frame unchanged when empty', () => {
    const rec = new FlightRecorder();
    const f = frame(3);
    expect(rec.sample(1, f).pos.x).toBe(3);
  });
});
