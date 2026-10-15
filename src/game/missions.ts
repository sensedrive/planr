import * as THREE from 'three';
import { type ControlState, createControlState } from '../core/input';
import type { Aircraft, StartSpot } from '../sim/aircraft';
import { AIRCRAFT } from '../sim/types';
import { runwayPoint } from '../world/airports';
import { home, scenario } from '../world/scenario';
import { surfaceHeight } from '../world/terrain';
import { rateLanding } from './landing';
import { RingCourse } from './rings';
import { bestKey, loadBest, type MissionId, saveBest, type Settings } from './settings';
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
/**
 * Nearest stretch of open water to the home field with room for a floatplane take-off run:
 * 700 m ahead, 100 m behind and 40 m to either side must all be water.
 */
function waterStart(restHeight: number): StartSpot | null {
  const h = home();
  const wet = (x: number, z: number) => surfaceHeight(x, z) < -1.5;
  for (let r = 300; r <= 7000; r += 150) {
    for (let a = 0; a < 360; a += 15) {
      const x = h.center.x + Math.sin((a * Math.PI) / 180) * r;
      const z = h.center.z - Math.cos((a * Math.PI) / 180) * r;
      if (!wet(x, z)) continue;
      for (let hd = 0; hd < 360; hd += 30) {
        const fx = Math.sin((hd * Math.PI) / 180);
        const fz = -Math.cos((hd * Math.PI) / 180);
        let ok = true;
        for (let d = -100; d <= 700 && ok; d += 50)
          for (const side of [-40, 0, 40]) if (!wet(x + fx * d - fz * side, z + fz * d + fx * side)) ok = false;
        if (ok) return { position: new THREE.Vector3(x, restHeight, z), heading: hd };
      }
    }
  }
  return null;
}

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

  private settings: Pick<Settings, 'scenario' | 'aircraft'> = { scenario: 'alps', aircraft: 'c172' };

  private key(mission: MissionId): string {
    return bestKey(mission, this.settings);
  }

  /** Shows a message to the pilot (desktop HUD and VR board). */
  announce(title: string, subtitle = '', seconds = 5): void {
    this.notify(title, subtitle, seconds);
  }

  private notify(title: string, subtitle = '', seconds = 5): void {
    this.notice = { title, subtitle, until: performance.now() + seconds * 1000 };
  }

  private spotFor(id: MissionId): StartSpot {
    const t = this.aircraft.type;
    const turbine = t.sound === 'jet' || t.sound === 'turboprop';
    const HOME = home();
    // big aircraft line up a bit further down the runway so the tail is on the asphalt
    const lineUp = Math.max(40, t.model.body.tailZ + 30);
    const runwayStart = (): StartSpot => ({
      position: runwayPoint(HOME, -HOME.length / 2 + lineUp, 0, t.restHeight),
      heading: HOME.heading,
      pitchDeg: t.restPitch,
    });
    // a floatplane starts on the water, a glider in the air
    if (t.floats && (id === 'free' || id === 'crosscountry')) return waterStart(t.restHeight) ?? { ...airStart(), speed: t.cruise, spool: 0.6 };
    if (t.glider && (id === 'free' || id === 'crosscountry')) id = 'airstart';
    function airStart(): StartSpot {
      const s = runwayStart();
      s.pitchDeg = 0;
        // 600 m above the field, but always well clear of the terrain ahead (fjords, mountains)
        let ahead = 0;
        for (let d = 0; d <= 5000; d += 100) {
          const p = runwayPoint(HOME, -HOME.length / 2 + d, 0);
          ahead = Math.max(ahead, surfaceHeight(p.x, p.z));
        }
      s.position.y = Math.max(HOME.center.y + 600, ahead + 400);
      return s;
    }
    switch (id) {
      case 'airstart':
        return { ...airStart(), speed: t.cruise, spool: t.glider ? 0 : 0.65 };
      case 'landing': {
        // 3 km before the threshold on a 3° path to the aiming point
        const before = 3000;
        const height = (before + 300) * Math.tan(3 * DEG);
        return {
          position: runwayPoint(HOME, -HOME.length / 2 - before, 0, height + 1.2),
          heading: HOME.heading,
          speed: t.approach,
          pathDeg: -3,
          flaps: t.glider ? 0 : 1,
          spool: t.glider ? 0 : turbine ? 0.45 : 0.3,
        };
      }
      case 'rings':
        return {
          position: this.course.start.clone(),
          heading: this.course.heading,
          speed: Math.max(t.approach * 1.4, Math.min(t.cruise, 90)),
          spool: t.glider ? 0 : 0.7,
        };
      case 'ditching': {
        const d = scenario().ditchingStart!;
        return { position: d.position.clone().setY(d.position.y + (turbine ? 300 : 0)), heading: d.heading, speed: t.cruise * 0.85, spool: 0 };
      }
      default:
        return runwayStart();
    }
  }

  start(settings: Settings, c: ControlState): void {
    const sc = scenario();
    this.settings = { scenario: sc.id, aircraft: settings.aircraft };
    this.mission = sc.missions.includes(settings.mission) ? settings.mission : 'free';
    const a = this.aircraft;
    a.setType(AIRCRAFT[settings.aircraft]);
    const spot = this.spotFor(this.mission);
    // cold and dark: only on the ground, gliders have nothing to start
    if (!spot.speed && settings.start === 'cold' && !a.type.glider) spot.running = false;
    a.realistic = settings.realism === 'real';
    a.reset(spot);
    Object.assign(c, createControlState());
    c.flaps = spot.flaps ?? 0;
    c.throttle = spot.spool ?? 0;
    // take-off configuration of the type (flap notch, nose-up trim) when starting on the ground
    if (!spot.speed) {
      c.flaps = a.type.takeoff.flaps;
      c.trim = a.type.takeoff.trim;
    } else if (a.type.glider) c.trim = a.type.takeoff.trim;
    // airborne starts: gear down only on final approach
    if (a.type.retractableGear && spot.speed && this.mission !== 'landing') c.gear = 0;
    a.gear = c.gear;
    if (this.mission === 'ditching') {
      a.engine.failed = true;
      c.throttle = 0;
    }
    this.weather.configure(settings.wind, home().heading);
    this.time = 0;
    this.finished = false;
    this.notice = null;
    this.lastPos.copy(a.pos);
    this.failure = settings.failure;
    this.failAt = settings.failure === 'random' ? 40 + Math.random() * 200 : Infinity;
    // an engine failure after takeoff only makes sense when starting on the runway
    this.failAgl = settings.failure === 'takeoff' && !spot.speed ? 80 + Math.random() * 70 : Infinity;

    this.course.reset();
    this.course.group.visible = this.mission === 'rings';
    switch (this.mission) {
      case 'landing':
        this.notify(`Landeanflug ${home().name} ${home().labelA}`, 'PAPI: 2 weiß + 2 rot = richtiger Gleitpfad', 7);
        break;
      case 'rings':
        this.notify('Ringparcours', `${this.course.rings.length} Ringe – flieg durch den orangen`, 6);
        break;
      case 'crosscountry':
        this.notify('Streckenflug', `Lande auf dem ${sc.destination?.name} (Pfeil auf dem Panel)`, 7);
        break;
      case 'ditching':
        this.notify('Motorausfall über Manhattan!', 'Gleite zum Hudson und wassere: Flächen waagerecht, Nase leicht hoch, langsam', 9);
        break;
    }
  }

  update(dt: number): void {
    const a = this.aircraft;
    const sc = scenario();
    if (this.notice && performance.now() > this.notice.until) this.notice = null;
    if (a.ditched && !this.finished) {
      this.finished = true;
      if (this.mission === 'ditching') {
        const best = loadBest(this.key('ditching'));
        if (best === null || this.time < best) saveBest(this.key('ditching'), this.time);
      }
    }
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
        const best = loadBest(this.key('landing'));
        if (best === null || r.stars > best) saveBest(this.key('landing'), r.stars);
      }
      if (this.mission === 'crosscountry' && !this.finished && r.airport === sc.destination && r.stars > 0) {
        this.finished = true;
        const best = loadBest(this.key('crosscountry'));
        const record = best === null || this.time < best;
        if (record) saveBest(this.key('crosscountry'), this.time);
        this.notify(`Ziel erreicht in ${clock(this.time)}`, `${r.title.slice(0, 3)} · ${record ? 'neue Bestzeit!' : `Bestzeit ${clock(best!)}`}`, 9);
      }
    }

    switch (this.mission) {
      case 'landing': {
        const HOME = home();
        const aim = runwayPoint(HOME, -HOME.length / 2 + 300, 0);
        this.target = this.finished ? null : aim;
        const d = Math.hypot(a.pos.x - aim.x, a.pos.z - aim.z);
        this.status = this.finished ? `Bestwert ${'★'.repeat(loadBest(this.key('landing')) ?? 0)}` : `Aufsetzpunkt ${distance(d)} · ${Math.round(a.airspeedKt)} kn`;
        break;
      }
      case 'rings': {
        if (this.course.check(this.lastPos, a.pos)) {
          if (this.course.done) {
            this.finished = true;
            const best = loadBest(this.key('rings'));
            const record = best === null || this.time < best;
            if (record) saveBest(this.key('rings'), this.time);
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
        const dest = sc.destination!;
        const t = dest.center;
        this.target = this.finished ? null : t;
        const d = Math.hypot(a.pos.x - t.x, a.pos.z - t.z);
        this.status = this.finished
          ? `Gelandet · ${clock(this.time)}`
          : `${dest.name} ${dest.labelA}/${dest.labelB} · ${distance(d)} · Platzhöhe ${Math.round(t.y * M_TO_FT)} ft · ${clock(this.time)}`;
        break;
      }
      case 'ditching':
        this.target = null;
        this.status = `Motor aus · ${Math.round(a.airspeedKt)} kn · ${Math.round(Math.max(0, agl) * M_TO_FT)} ft über Grund`;
        break;
      default:
        this.target = null;
        this.status = '';
    }
    this.lastPos.copy(a.pos);
  }
}
