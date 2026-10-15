import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Aircraft } from '../sim/aircraft';
import { AIRCRAFT } from '../sim/types';
import { setScenario, home } from '../world/scenario';
import { createAlps } from '../world/scenarios/alps';
import { createFjord } from '../world/scenarios/fjord';
import { surfaceHeight } from '../world/terrain';
import { circuit, TrafficManager } from './traffic';

describe.each([
  ['alps', createAlps],
  ['fjord', createFjord],
] as const)('traffic in %s', (_name, create) => {
  it('flies circuits and crossings without touching the terrain (except on the runway)', () => {
    setScenario(create());
    const player = new Aircraft();
    const h = home();
    player.reset({ position: h.center.clone().setY(h.center.y + 1500), heading: 0, speed: 50 });
    const tm = new TrafficManager(surfaceHeight, null);
    tm.start(2, player.pos);
    let lowest = Infinity;
    let lowestCrossing = Infinity;
    for (let i = 0; i < 600 * 10; i++) {
      tm.update(0.1, player);
      for (const { ac, crossing } of tm.states) {
        expect(Number.isFinite(ac.pos.x + ac.pos.y + ac.pos.z)).toBe(true);
        const agl = ac.pos.y - Math.max(0, surfaceHeight(ac.pos.x, ac.pos.z)) - ac.type.restHeight;
        lowest = Math.min(lowest, agl);
        if (crossing) lowestCrossing = Math.min(lowestCrossing, agl);
      }
    }
    // nobody flies into the ground; cross-country traffic keeps well clear of it
    expect(lowest).toBeGreaterThan(-0.5);
    expect(lowestCrossing).toBeGreaterThan(120);
  });
});

describe('circuit', () => {
  it('touches down on the runway and keeps flying the pattern', () => {
    setScenario(createAlps());
    const h = home();
    const route = circuit(h, AIRCRAFT.c172, surfaceHeight)!;
    expect(route).not.toBeNull();
    expect(route.points.some((p) => p.ground)).toBe(true);
    // circuit height at least 300 m above the field
    expect(Math.max(...route.points.map((p) => p.pos.y - h.center.y))).toBeGreaterThanOrEqual(300);
  });

  it('goes around while the player stands on the runway', () => {
    setScenario(createAlps());
    const h = home();
    const player = new Aircraft();
    player.reset({ position: h.center.clone().setY(h.center.y + player.type.restHeight), heading: h.heading });
    const tm = new TrafficManager(surfaceHeight, null);
    tm.start(1, new Vector3(1e5, 0, 1e5));
    let landed = false;
    for (let i = 0; i < 400 * 10; i++) {
      tm.update(0.1, player);
      if (tm.aircraft.some((a) => a.onGround && a.pos.distanceTo(h.center) < h.length)) landed = true;
      expect(tm.collides(player)).toBe(false);
    }
    expect(landed).toBe(false);
  });
});
