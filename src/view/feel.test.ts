import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Aircraft } from '../sim/aircraft';
import { AIRCRAFT } from '../sim/types';
import { FlightFeel } from './feel';

function hold(feel: FlightFeel, ac: Aircraft, g: number, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) {
    ac.gLoad = g;
    feel.update(1 / 60, ac, true);
  }
}

describe('flight feel', () => {
  it('greys out under sustained high G, the fighter pilot later', () => {
    const cessna = new Aircraft();
    cessna.reset({ position: new Vector3(0, 1000, 0), heading: 0, speed: 50 });
    const feel = new FlightFeel();
    hold(feel, cessna, 6, 4);
    expect(feel.blackout).toBeGreaterThan(0.5);

    const f16 = new Aircraft();
    f16.setType(AIRCRAFT.f16);
    f16.reset({ position: new Vector3(0, 1000, 0), heading: 0, speed: 150 });
    const feel2 = new FlightFeel();
    hold(feel2, f16, 6, 4);
    expect(feel2.blackout).toBeLessThan(0.1);
    // and recovers at 1 G
    hold(feel, cessna, 1, 6);
    expect(feel.blackout).toBeLessThan(0.05);
  });

  it('reds out under negative G', () => {
    const ac = new Aircraft();
    ac.reset({ position: new Vector3(0, 1000, 0), heading: 0, speed: 50 });
    const feel = new FlightFeel();
    hold(feel, ac, -3, 3);
    expect(feel.redout).toBeGreaterThan(0.5);
  });

  it('shakes on the runway roll but not when parked', () => {
    const ac = new Aircraft();
    ac.reset({ position: new Vector3(0, 0, 0), heading: 0 });
    ac.engine.running = false;
    const feel = new FlightFeel();
    hold(feel, ac, 1, 1);
    expect(feel.offset.length()).toBeLessThan(0.002);
    ac.vel.set(0, 0, -25);
    let max = 0;
    for (let i = 0; i < 60; i++) {
      feel.update(1 / 60, ac, true);
      max = Math.max(max, feel.offset.length());
    }
    expect(max).toBeGreaterThan(0.002);
    expect(feel.rumble).toBeGreaterThan(0.3);
  });
});
