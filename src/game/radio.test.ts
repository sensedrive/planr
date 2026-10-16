import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aircraft } from '../sim/aircraft';
import { AIRCRAFT } from '../sim/types';
import { makeAirport, runwayPoint } from '../world/airports';
import { type RadioContext, RadioScript, runwayFor, spokenCallsign, windWords } from './radio';
import { spellDigits, type TrafficRadio } from './traffic';

const field = makeAirport('home', 'Talflugplatz', 0, 0, 30, 240, 1200, 30);

function context(player: Aircraft, traffic: TrafficRadio[] = []): RadioContext {
  return { player, airports: [field], traffic, advisory: null, windFrom: 235, windKt: 8, ground: 30 };
}

function run(script: RadioScript, ctx: RadioContext, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) script.update(0.1, ctx);
}

describe('radio phrases', () => {
  it('spells digits and callsigns the radio way', () => {
    expect(spellDigits('24')).toBe('zwo vier');
    expect(spokenCallsign('D-EPLR')).toBe('Delta Lima Romeo');
    expect(spokenCallsign('DLH 421')).toBe('Lufthansa vier zwo eins');
    expect(windWords(235, 8).speech).toBe('Wind zwo vier null Grad, 8 Knoten');
    expect(windWords(0, 1).text).toBe('Wind ruhig');
  });

  it('picks the runway designator for the direction flown', () => {
    expect(runwayFor(field, 238)).toBe('24');
    expect(runwayFor(field, 62)).toBe('06');
    expect(runwayFor(field, 150)).toBeNull();
  });
});

describe('RadioScript', () => {
  let script: RadioScript;
  let player: Aircraft;
  beforeEach(() => {
    script = new RadioScript();
    script.reset('c172');
    player = new Aircraft();
    player.setType(AIRCRAFT.c172);
  });

  it('clears the player for take-off after lining up on the runway', () => {
    player.reset({ position: runwayPoint(field, -500, 0, 1), heading: 240 });
    run(script, context(player), 3);
    const t = script.next();
    expect(t?.text).toContain('Piste 24, Start frei');
    expect(t?.speech).toContain('Delta Lima Romeo');
    expect(t?.speech).toContain('Piste zwo vier');
    run(script, context(player), 5);
    expect(script.next()).toBeNull();
  });

  it('holds the player while traffic is on final', () => {
    player.reset({ position: runwayPoint(field, -500, 0, 1), heading: 240 });
    const onFinal: TrafficRadio = {
      id: 7, callsign: 'D-EKAB', spoken: 'Delta Alfa Bravo', type: AIRCRAFT.cub, airport: field, runway: '24',
      leg: 'final', pos: runwayPoint(field, -1500, 0, 60), crossing: false,
    };
    run(script, context(player, [onFinal]), 3);
    expect(script.next()?.text).toContain('Position halten');
    onFinal.leg = 'upwind';
    onFinal.pos = runwayPoint(field, 2000, 0, 200);
    run(script, context(player, [onFinal]), 1);
    expect(script.queue.some((q) => q.text.includes('Start frei'))).toBe(true);
  });

  it('clears the player to land on a stabilised final and welcomes them after the rollout', () => {
    player.reset({ position: runwayPoint(field, -600 - 2500, 0, 160), heading: 240, speed: 40, pathDeg: -3 });
    run(script, context(player), 0.5);
    const t = script.next();
    expect(t?.text).toContain('Piste 24, Landung frei');
    // on the ground and slow again
    player.onGround = true;
    player.vel.set(0, 0, 0);
    run(script, context(player), 0.5);
    const welcome = script.queue.find((q) => q.text.includes('willkommen'));
    expect(welcome?.text).toContain('Talflugplatz');
  });

  it('reports circuit legs of the traffic once per leg, with the tower answering the final', () => {
    player.reset({ position: new Vector3(500, 400, 500), heading: 0, speed: 50 });
    const tr: TrafficRadio = {
      id: 3, callsign: 'D-EKAB', spoken: 'Delta Alfa Bravo', type: AIRCRAFT.c172, airport: field, runway: '24',
      leg: 'crosswind', pos: new Vector3(800, 330, 0), crossing: false,
    };
    const ctx = context(player, [tr]);
    run(script, ctx, 1);
    expect(script.queue).toHaveLength(0); // nothing to say on crosswind
    tr.leg = 'downwind';
    run(script, ctx, 1);
    expect(script.queue.map((q) => q.text)).toEqual(['Talflugplatz Turm, D-EKAB, Gegenanflug Piste 24']);
    tr.leg = 'final';
    run(script, ctx, 1);
    const texts = script.queue.map((q) => q.text);
    expect(texts[1]).toBe('D-EKAB, Endanflug Piste 24');
    expect(texts[2]).toContain('Aufsetzen und Durchstarten frei');
  });

  it('gives traffic information, not more often than every 45 s per aircraft', () => {
    player.reset({ position: new Vector3(0, 900, -5000), heading: 0, speed: 50 });
    const ctx = context(player);
    ctx.advisory = { text: '', distance: 1200, id: 9, clock: 2, ft: 300, type: AIRCRAFT.baron };
    run(script, ctx, 1);
    const t = script.next();
    expect(t?.text).toBe('D-EPLR, Verkehr 2 Uhr, 1,2 km, 300 ft höher, Baron');
    expect(t?.speech).toContain('auf 2 Uhr, 1,2 Kilometer, 300 Fuß höher');
    run(script, ctx, 30);
    expect(script.next()).toBeNull();
    run(script, ctx, 20);
    expect(script.next()?.text).toContain('Verkehr 2 Uhr');
  });

  it('drops stale chatter but keeps calls to the player', () => {
    player.reset({ position: new Vector3(500, 400, 500), heading: 0, speed: 50 });
    const tr: TrafficRadio = {
      id: 3, callsign: 'D-EKAB', spoken: 'x', type: AIRCRAFT.c172, airport: field, runway: '24', leg: 'crosswind', pos: new Vector3(), crossing: false,
    };
    const ctx = context(player, [tr]);
    run(script, ctx, 0.2);
    tr.leg = 'downwind';
    run(script, ctx, 20);
    expect(script.next()).toBeNull();
  });
});
