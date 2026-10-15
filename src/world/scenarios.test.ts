import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createControlState } from '../core/input';
import { Aircraft } from '../sim/aircraft';
import { C172 } from '../sim/types';
import { runwayLocal, runwayPoint } from './airports';
import { home, scenario, setScenario } from './scenario';
import { createFjord } from './scenarios/fjord';
import { surfaceHeight, terrainHeight } from './terrain';

setScenario(createFjord());

describe('fjord coast', () => {
  it('has a flat home runway at the fjord head, inland', () => {
    const h = home();
    expect(h.center.x).toBeGreaterThan(5000);
    for (const along of [-h.length / 2, 0, h.length / 2]) {
      const p = runwayPoint(h, along, 0);
      expect(terrainHeight(p.x, p.z)).toBeCloseTo(h.center.y, 1);
    }
  });

  it('has steep fjord walls and sea west of the coast', () => {
    expect(terrainHeight(-9000, 0)).toBeLessThan(0);
    // somewhere within 6 km of the home field the ground rises above 500 m
    const h = home();
    let max = 0;
    for (let a = 0; a < 360; a += 10) {
      for (let d = 500; d <= 6000; d += 250) {
        const r = (a * Math.PI) / 180;
        max = Math.max(max, terrainHeight(h.center.x + Math.sin(r) * d, h.center.z - Math.cos(r) * d));
      }
    }
    expect(max).toBeGreaterThan(500);
  });

  it('builds a ring course that clears the terrain', () => {
    const course = scenario().ringCourse(terrainHeight);
    expect(course.rings.length).toBeGreaterThan(5);
    for (const r of course.rings) expect(r.y - Math.max(0, terrainHeight(r.x, r.z))).toBeGreaterThan(30);
  });

  it('the island airfield lies on dry land in the sea', () => {
    const isl = scenario().destination!;
    const p = runwayLocal(isl, isl.center.x, isl.center.z);
    expect(Math.abs(p.along)).toBeLessThan(1);
    expect(terrainHeight(isl.center.x, isl.center.z)).toBeGreaterThan(0);
    expect(terrainHeight(isl.center.x - 2500, isl.center.z)).toBeLessThan(0);
  });
});

describe('ditching', () => {
  const overSea = (vs: number, pitchDeg: number, kt: number) => {
    const ac = new Aircraft();
    ac.setType(C172);
    ac.reset({ position: new Vector3(-9000, 1.6, 0), heading: 0, speed: kt / 1.944 });
    ac.quat.setFromAxisAngle(new Vector3(1, 0, 0), (pitchDeg * Math.PI) / 180);
    ac.vel.y = vs / 196.85;
    ac.engine.failed = true;
    const c = createControlState();
    for (let i = 0; i < 240 && !ac.crashed; i++) ac.step(1 / 120, c, surfaceHeight);
    return ac;
  };

  it('succeeds when slow, level and gently sinking', () => {
    const ac = overSea(-250, 4, 55);
    expect(ac.crashed).toBe(true);
    expect(ac.ditched).toBe(true);
  });

  it('fails nose-first and fast', () => {
    const ac = overSea(-1500, -12, 110);
    expect(ac.crashed).toBe(true);
    expect(ac.ditched).toBe(false);
    expect(ac.crashReason).toContain('misslungen');
  });
});
