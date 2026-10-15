import * as THREE from 'three';
import { type ControlState, createControlState } from '../core/input';
import type { Aircraft, StartSpot } from '../sim/aircraft';
import { AIRCRAFT } from '../sim/types';
import { HOME, MOUNTAIN, runwayPoint } from '../world/airports';
import { surfaceHeight } from '../world/terrain';
import { rateLanding } from './landing';
import { RingCourse } from './rings';
import { loadBest, type MissionId, saveBest, type Settings } from './settings';
import type { Weather } from './weather';

const DEG = Math.PI / 180;
const M_TO_FT = 3.28084;

export interface Notice {
  title: string;
  subtitle: string;
  until: number;
}

function clock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function distance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** Start positions, goals, scoring and engine failures for the selectable missions. */
export class Missions {
  readonly course = new RingCourse();
  mission: MissionId = 'free';
  /** short status line (cockpit + HUD) */
  status = '';
  /** where the cockpit arrow should point */
  target: THREE.Vector3 | null = null;
  notice: Notice | null = null;

  private time = 0;
  private finished = false;
  private failAt = Infinity;
  private failAgl = Infinity;
  private failure: Settings['failure'] = 'off';
  private readonly lastPos = new THREE.Vector3();

  constructor(
    private readonly aircraft: Aircraft,
    private readonly weather: Weather,
  ) {}

  private notify(title: string, subtitle = '', seconds = 5): void {
    this.notice = { title, subtitle, until: performance.now() + seconds * 1000 };
  }

  private spotFor(id: MissionId): StartSpot {
    const t = this.aircraft.type;
    const jet = t.id === 'jet';
    const runwayStart = (): StartSpot => ({
      position: runwayPoint(HOME, -HOME.length / 2 + (jet ? 60 : 40), 0, t.restHeight),
      heading: HOME.heading,
    });
    switch (id) {
      case 'airstart': {
        const s = runwayStart();
        s.position.y += 600;
        return { ...s, speed: t.cruise, spool: 0.65 };
      }
      case 'landing': {
        // 3 km before the threshold on a 3° path to the aiming point
        const before = 3000;
        const height = (before + 300) * Math.tan(3 * DEG);
        return {
          position: runwayPoint(HOME, -HOME.length / 2 - before, 0, height + 1.2),
          heading: HOME.heading,
          speed: t.approach,
          pathDeg: -3,
          flaps: 1,
          spool: jet ? 0.45 : 0.3,
        };
      }
      case 'rings':
        return { position: this.course.start.clone(), heading: this.course.heading, speed: jet ? 90 : 48, spool: 0.7 };
      default:
        return runwayStart();
    }
  }

  start(settings: Settings, c: ControlState): void {
    this.mission = settings.mission;
    const a = this.aircraft;
    a.setType(AIRCRAFT[settings.aircraft]);
    const spot = this.spotFor(settings.mission);
    a.realistic = settings.realism === 'real';
    a.reset(spot);
    Object.assign(c, createControlState());
    c.flaps = spot.flaps ?? 0;
    c.throttle = spot.spool ?? 0;
    // the jet takes off with the first flap notch and nose-up takeoff trim (~140 kt hands-off)
    if (a.type.id === 'jet' && !spot.speed) {
      c.flaps = 1 / 3;
      c.trim = 0.25;
    }
    // airborne starts: gear down only on final approach
    if (a.type.retractableGear && spot.speed && settings.mission !== 'landing') c.gear = 0;
    a.gear = c.gear;
    this.weather.configure(settings.wind, HOME.heading);
    this.time = 0;
    this.finished = false;
    this.notice = null;
    this.lastPos.copy(a.pos);
    this.failure = settings.failure;
    this.failAt = settings.failure === 'random' ? 40 + Math.random() * 200 : Infinity;
    // an engine failure after takeoff only makes sense when starting on the runway
    this.failAgl = settings.failure === 'takeoff' && !spot.speed ? 80 + Math.random() * 70 : Infinity;

    this.course.reset();
    this.course.group.visible = settings.mission === 'rings';
    switch (settings.mission) {
      case 'landing':
        this.notify('Landeanflug Piste ' + HOME.labelA, 'PAPI: 2 weiß + 2 rot = richtiger Gleitpfad', 7);
        break;
      case 'rings':
        this.notify('Ringparcours', `${this.course.rings.length} Ringe – flieg durch den orangen`, 6);
        break;
      case 'crosscountry':
        this.notify('Streckenflug', `Lande auf dem ${MOUNTAIN.name} (Pfeil auf dem Panel)`, 7);
        break;
    }
  }

  update(dt: number): void {
    const a = this.aircraft;
    if (this.notice && performance.now() > this.notice.until) this.notice = null;
    if (a.crashed) {
      this.status = '';
      return;
    }
    if (!this.finished) this.time += dt;

    // engine failures
    const agl = a.pos.y - surfaceHeight(a.pos.x, a.pos.z) - 1.2;
    if (!a.engine.failed && !a.onGround) {
      if (this.failure === 'random' && a.airTime > 0) this.failAt -= dt;
      const fail = this.failAt <= 0 || (agl > this.failAgl && a.vel.y > 0);
      if (fail) {
        a.engine.failed = true;
        this.notify('Motorausfall!', '~65 kn halten und ein Landefeld suchen', 6);
      }
    }

    // landing rating on every touchdown
    const td = a.touchdown;
    if (td) {
      a.touchdown = null;
      const r = rateLanding(td);
      this.notify(r.title, r.detail, 7);
      if (this.mission === 'landing' && !this.finished) {
        this.finished = true;
        const best = loadBest('landing');
        if (best === null || r.stars > best) saveBest('landing', r.stars);
      }
      if (this.mission === 'crosscountry' && !this.finished && r.airport === MOUNTAIN && r.stars > 0) {
        this.finished = true;
        const best = loadBest('crosscountry');
        const record = best === null || this.time < best;
        if (record) saveBest('crosscountry', this.time);
        this.notify(`Ziel erreicht in ${clock(this.time)}`, `${r.title.slice(0, 3)} · ${record ? 'neue Bestzeit!' : `Bestzeit ${clock(best!)}`}`, 9);
      }
    }

    switch (this.mission) {
      case 'landing': {
        const aim = runwayPoint(HOME, -HOME.length / 2 + 300, 0);
        this.target = this.finished ? null : aim;
        const d = Math.hypot(a.pos.x - aim.x, a.pos.z - aim.z);
        this.status = this.finished ? `Bestwert ${'★'.repeat(loadBest('landing') ?? 0)}` : `Aufsetzpunkt ${distance(d)} · ${Math.round(a.airspeedKt)} kn`;
        break;
      }
      case 'rings': {
        if (this.course.check(this.lastPos, a.pos)) {
          if (this.course.done) {
            this.finished = true;
            const best = loadBest('rings');
            const record = best === null || this.time < best;
            if (record) saveBest('rings', this.time);
            this.notify(`Parcours geschafft: ${clock(this.time)}`, record ? 'Neue Bestzeit!' : `Bestzeit ${clock(best!)}`, 8);
          } else {
            this.notify(`Ring ${this.course.next}/${this.course.rings.length}`, clock(this.time), 1.5);
          }
        }
        const t = this.course.target;
        this.target = t;
        this.status = t
          ? `Ring ${this.course.next + 1}/${this.course.rings.length} · ${distance(a.pos.distanceTo(t))} · ${clock(this.time)}`
          : `Ziel · ${clock(this.time)}`;
        break;
      }
      case 'crosscountry': {
        const t = MOUNTAIN.center;
        this.target = this.finished ? null : t;
        const d = Math.hypot(a.pos.x - t.x, a.pos.z - t.z);
        this.status = this.finished
          ? `Gelandet · ${clock(this.time)}`
          : `${MOUNTAIN.name} ${MOUNTAIN.labelA}/${MOUNTAIN.labelB} · ${distance(d)} · Platzhöhe ${Math.round(t.y * M_TO_FT)} ft · ${clock(this.time)}`;
        break;
      }
      default:
        this.target = null;
        this.status = '';
    }
    this.lastPos.copy(a.pos);
  }
}
