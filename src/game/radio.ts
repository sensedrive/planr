import type { Aircraft } from '../sim/aircraft';
import type { AircraftId } from '../sim/types';
import { type Airport, runwayLocal } from '../world/airports';
import { type Leg, spellCallsign, spellDigits, type TrafficAdvisory, type TrafficRadio } from './traffic';

/** Who is talking: the tower, or another aircraft. */
export type Station = 'tower' | 'traffic';

export interface Transmission {
  station: Station;
  /** short speaker label for the caption ("TWR", "D-EKLR") */
  from: string;
  /** caption */
  text: string;
  /** what the voice says (digits spelled the radio way) */
  speech: string;
  /** voice pitch 0.5…1.5, so stations sound different */
  pitch: number;
  /** addressed to the player: goes ahead of chatter in the queue */
  priority: boolean;
  /** script time it was queued (s) */
  at: number;
}

export interface RadioContext {
  player: Aircraft;
  airports: Airport[];
  traffic: TrafficRadio[];
  advisory: TrafficAdvisory | null;
  /** wind direction (°, from) and speed (kt) */
  windFrom: number;
  windKt: number;
  /** height of the ground below the player (m) */
  ground: number;
}

/** the player's registration per type */
const PLAYER_CALLSIGN: Record<AircraftId, string> = {
  c172: 'D-EPLR',
  cub: 'D-EJPC',
  extra: 'D-EXTR',
  baron: 'D-IBAR',
  pc12: 'HB-FPL',
  beaver: 'C-FDHB',
  glider: 'D-KPLR',
  jet: 'D-IJET',
  a320: 'DLH 9PL',
  f16: 'VIPER 1',
};

const LEG_TEXT: Partial<Record<Leg, string>> = {
  downwind: 'Gegenanflug',
  base: 'Queranflug',
  final: 'Endanflug',
  approach: 'im Anflug, 15 Kilometer',
};

/** Spoken callsign: phonetic letters, flight numbers digit by digit. */
export function spokenCallsign(cs: string): string {
  const m = /^([A-Z]+) (\d+)([A-Z]*)$/.exec(cs);
  if (m) {
    const airline = m[1] === 'DLH' ? 'Lufthansa' : m[1] === 'VIPER' ? 'Viper' : m[1];
    return `${airline} ${spellDigits(m[2])}${m[3] ? ' ' + spellCallsign(m[3], true) : ''}`;
  }
  return spellCallsign(cs);
}

/** Runway designator for flying along `headingDeg`, or null when not lined up with it. */
export function runwayFor(a: Airport, headingDeg: number, tolerance = 35): string | null {
  const d = Math.abs(((headingDeg - a.heading + 540) % 360) - 180);
  if (d < tolerance) return a.labelA;
  if (d > 180 - tolerance) return a.labelB;
  return null;
}

export function windWords(from: number, kt: number): { text: string; speech: string } {
  if (kt < 2) return { text: 'Wind ruhig', speech: 'Wind ruhig' };
  const deg = String((Math.round(from / 10) * 10) % 360 || 360).padStart(3, '0');
  const k = Math.round(kt);
  return { text: `Wind ${deg}° ${k} kt`, speech: `Wind ${spellDigits(deg)} Grad, ${k} Knoten` };
}

/** "1,2 km" / "800 m" and the spoken form. */
function distanceWords(m: number): { text: string; speech: string } {
  if (m < 1000) {
    const r = Math.round(m / 100) * 100;
    return { text: `${r} m`, speech: `${r} Meter` };
  }
  const km = (m / 1000).toFixed(1).replace('.', ',').replace(',0', '');
  return { text: `${km} km`, speech: `${km} Kilometer` };
}

/** short spoken names of the traffic types */
const TYPE_WORD: Record<AircraftId, string> = {
  c172: 'eine Cessna',
  cub: 'eine Piper Cub',
  extra: 'eine Extra',
  baron: 'eine zweimotorige Baron',
  pc12: 'eine Pilatus PC-12',
  beaver: 'eine Beaver',
  glider: 'ein Segelflugzeug',
  jet: 'ein Businessjet',
  a320: 'ein Airbus A320',
  f16: 'ein Militärjet',
};

const MAX_QUEUE = 4;
/** chatter older than this is dropped instead of read out late (s) */
const STALE = 15;

/**
 * Tower and traffic radio script: watches the player and the AI traffic and produces the
 * calls a pilot would hear — position reports in the circuit, take-off and landing clearances
 * and traffic information. Pure logic; something else speaks the queue.
 */
export class RadioScript {
  readonly queue: Transmission[] = [];
  time = 0;
  callsign = 'D-EPLR';
  /** player's spoken callsign */
  private cs = '';
  private readonly lastLeg = new Map<number, Leg | null>();
  /** take-off clearance state for the current stop on a runway */
  private lineUp = 0;
  private takeoffCleared = false;
  private holdIssued = false;
  /** airport and runway the player was cleared to land on */
  private landingCleared: { airport: Airport; runway: string } | null = null;
  private landedCalled = false;
  private wasOnGround = true;
  private readonly advised = new Map<number, number>();
  /** first update after a reset only learns where the traffic is, without a burst of reports */
  private primed = false;

  /** New flight: forget the clearances. */
  reset(type: AircraftId): void {
    this.callsign = PLAYER_CALLSIGN[type];
    this.cs = spokenCallsign(this.callsign);
    this.queue.length = 0;
    this.lastLeg.clear();
    this.advised.clear();
    this.lineUp = 0;
    this.takeoffCleared = false;
    this.holdIssued = false;
    this.landingCleared = null;
    this.landedCalled = false;
    this.wasOnGround = true;
    this.primed = false;
  }

  private send(station: Station, from: string, text: string, speech: string, priority: boolean, pitch = 1): void {
    const t: Transmission = { station, from, text, speech, pitch, priority, at: this.time };
    if (priority) {
      // ahead of the chatter, but after earlier calls to the player
      const i = this.queue.findIndex((q) => !q.priority);
      this.queue.splice(i < 0 ? this.queue.length : i, 0, t);
    } else this.queue.push(t);
    while (this.queue.length > MAX_QUEUE) {
      const drop = this.queue.findIndex((q) => !q.priority);
      this.queue.splice(drop < 0 ? 0 : drop, 1);
    }
  }

  private tower(text: string, speech: string): void {
    this.send('tower', 'TWR', text, speech, true, 0.95);
  }

  /** Next call to read out, skipping stale chatter. */
  next(): Transmission | null {
    while (this.queue.length) {
      const t = this.queue.shift()!;
      if (t.priority || this.time - t.at < STALE) return t;
    }
    return null;
  }

  update(dt: number, ctx: RadioContext): void {
    this.time += dt;
    if (!this.primed) {
      for (const tr of ctx.traffic) this.lastLeg.set(tr.id, tr.leg);
      this.primed = true;
    }
    this.trafficReports(ctx);
    this.takeoff(dt, ctx);
    this.landing(ctx);
    this.trafficInfo(ctx);
    this.wasOnGround = ctx.player.onGround;
  }

  private nearestAirport(ctx: RadioContext, x: number, z: number, within: number): Airport | null {
    let best: Airport | null = null;
    let bestD = within;
    for (const a of ctx.airports) {
      const d = Math.hypot(a.center.x - x, a.center.z - z);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** AI aircraft report their circuit legs, the tower answers the final. */
  private trafficReports(ctx: RadioContext): void {
    const p = ctx.player.pos;
    for (const tr of ctx.traffic) {
      if (tr.crossing) continue;
      const prev = this.lastLeg.get(tr.id);
      this.lastLeg.set(tr.id, tr.leg);
      if (prev === undefined || tr.leg === prev || !tr.leg || !tr.airport) continue;
      const words = LEG_TEXT[tr.leg];
      // only what can be heard: the player near that airfield
      if (!words || Math.hypot(tr.airport.center.x - p.x, tr.airport.center.z - p.z) > 15000) continue;
      const rw = tr.runway;
      const pitch = 0.8 + ((tr.id * 37) % 9) * 0.05;
      const first = tr.leg === 'downwind' || tr.leg === 'approach';
      const station = `${tr.airport.name} Turm`;
      this.send(
        'traffic',
        tr.callsign,
        `${first ? `${station}, ` : ''}${tr.callsign}, ${words} Piste ${rw}`,
        `${first ? `${station}, ` : ''}${tr.spoken}, ${words} Piste ${spellDigits(rw)}`,
        false,
        pitch,
      );
      if (tr.leg === 'final') {
        const w = windWords(ctx.windFrom, ctx.windKt);
        const what = tr.type.id === 'a320' ? 'Landung frei' : 'Aufsetzen und Durchstarten frei';
        this.send('tower', 'TWR', `${tr.callsign}, Piste ${rw}, ${what}, ${w.text}`, `${tr.spoken}, Piste ${spellDigits(rw)}, ${what}, ${w.speech}`, false, 0.95);
      }
    }
  }

  /** an AI aircraft on final to this airport within `m` of the field */
  private finalTraffic(ctx: RadioContext, a: Airport, m: number): TrafficRadio | null {
    return (
      ctx.traffic.find(
        (t) => t.airport === a && (t.leg === 'final' || t.leg === 'landing') && Math.hypot(t.pos.x - a.center.x, t.pos.z - a.center.z) < m,
      ) ?? null
    );
  }

  /** Standing on a runway with the engine running: take-off clearance (or hold for traffic). */
  private takeoff(dt: number, ctx: RadioContext): void {
    const ac = ctx.player;
    if (!ac.onGround) {
      this.lineUp = 0;
      this.takeoffCleared = false;
      this.holdIssued = false;
      return;
    }
    const a = this.nearestAirport(ctx, ac.pos.x, ac.pos.z, 3000);
    const rw = a && runwayFor(a, ac.headingDeg, 25);
    const speed = Math.hypot(ac.vel.x, ac.vel.z);
    const local = a && runwayLocal(a, ac.pos.x, ac.pos.z);
    const onRunway = !!local && Math.abs(local.lateral) < a!.width && Math.abs(local.along) < a!.length / 2;
    const ready = onRunway && rw && speed < 3 && (ac.engine.running || ac.type.glider) && !ac.crashed;
    if (!ready || this.takeoffCleared) {
      if (!onRunway) this.lineUp = 0;
      return;
    }
    this.lineUp += dt;
    if (this.lineUp < 2) return;
    const w = windWords(ctx.windFrom, ctx.windKt);
    const traffic = this.finalTraffic(ctx, a!, 3500);
    if (traffic) {
      if (!this.holdIssued) {
        this.holdIssued = true;
        this.tower(`${this.callsign}, Position halten, Verkehr im Endanflug`, `${this.cs}, halten Sie Position, Verkehr im Endanflug`);
      }
      return;
    }
    this.takeoffCleared = true;
    this.tower(`${this.callsign}, ${w.text}, Piste ${rw}, Start frei`, `${this.cs}, ${w.speech}, Piste ${spellDigits(rw!)}, Start frei`);
  }

  /** Lined up on a final: landing clearance; after the rollout a word from the tower. */
  private landing(ctx: RadioContext): void {
    const ac = ctx.player;
    if (ac.crashed) return;
    if (ac.onGround) {
      if (!this.wasOnGround && this.landingCleared) this.landedCalled = false;
      const speed = Math.hypot(ac.vel.x, ac.vel.z);
      if (this.landingCleared && !this.landedCalled && speed < 15) {
        this.landedCalled = true;
        const a = this.landingCleared.airport;
        this.tower(`${this.callsign}, willkommen in ${a.name}, Piste verlassen, rollen Sie zum Vorfeld`, `${this.cs}, willkommen in ${a.name}, Piste verlassen, rollen Sie zum Vorfeld`);
        this.landingCleared = null;
      }
      return;
    }
    const agl = ac.pos.y - ctx.ground;
    if (this.landingCleared) {
      // went away (go-around far out, or flew off): the clearance lapses
      const a = this.landingCleared.airport;
      if (Math.hypot(a.center.x - ac.pos.x, a.center.z - ac.pos.z) > 9000) this.landingCleared = null;
      return;
    }
    for (const a of ctx.airports) {
      const rw = runwayFor(a, ac.headingDeg, 30);
      if (!rw) continue;
      const l = runwayLocal(a, ac.pos.x, ac.pos.z);
      // distance to the threshold ahead, measured along the runway direction we fly
      const along = rw === a.labelA ? l.along : -l.along;
      const toThreshold = -a.length / 2 - along;
      if (toThreshold < 300 || toThreshold > 7000 || Math.abs(l.lateral) > 450) continue;
      if (agl > 120 + toThreshold * 0.12 || agl < 15 || ac.vel.y > 2) continue;
      const w = windWords(ctx.windFrom, ctx.windKt);
      const ahead = this.finalTraffic(ctx, a, 2500);
      const number = ahead ? `, Nummer 2, Verkehr vor Ihnen ist ${TYPE_WORD[ahead.type.id]} im kurzen Endanflug` : '';
      this.landingCleared = { airport: a, runway: rw };
      this.landedCalled = false;
      this.tower(`${this.callsign}${number}, Piste ${rw}, Landung frei, ${w.text}`,
        `${this.cs}${number}, Piste ${spellDigits(rw)}, Landung frei, ${w.speech}`,
      );
      return;
    }
  }

  /** "Verkehrsinformation: eine Cessna auf 2 Uhr, 1,2 Kilometer, 300 Fuß höher" */
  private trafficInfo(ctx: RadioContext): void {
    const adv = ctx.advisory;
    // the tower gives traffic information to aircraft in the air
    if (!adv || adv.distance > 2500 || ctx.player.onGround) return;
    const last = this.advised.get(adv.id);
    if (last !== undefined && this.time - last < 45) return;
    this.advised.set(adv.id, this.time);
    const d = distanceWords(adv.distance);
    const level = Math.abs(adv.ft) < 200 ? 'gleiche Höhe' : `${Math.abs(adv.ft)} ft ${adv.ft > 0 ? 'höher' : 'tiefer'}`;
    const levelSpoken = Math.abs(adv.ft) < 200 ? 'gleiche Höhe' : `${Math.abs(adv.ft)} Fuß ${adv.ft > 0 ? 'höher' : 'tiefer'}`;
    const what = TYPE_WORD[adv.type.id];
    this.send(
      'tower',
      'TWR',
      `${this.callsign}, Verkehr ${adv.clock} Uhr, ${d.text}, ${level}, ${adv.type.short}`,
      `${this.cs}, Verkehrsinformation, ${what} auf ${adv.clock} Uhr, ${d.speech}, ${levelSpoken}`,
      true,
      0.95,
    );
  }
}
