import * as THREE from 'three';
import { createControlState } from '../core/input';
import { Aircraft } from '../sim/aircraft';
import { AIRCRAFT, type AircraftId, type AircraftType } from '../sim/types';
import { type Airport, runwayLocal, runwayPoint } from '../world/airports';
import { scenario } from '../world/scenario';
import { type AircraftVisual, GenericModel } from '../view/genericModel';

export type ModelFactory = ((t: AircraftType) => AircraftVisual) | null;

type Height = (x: number, z: number) => number;

interface Waypoint {
  pos: THREE.Vector3;
  /** m/s */
  speed: number;
  /** rolling on the runway */
  ground?: boolean;
  /** gear and landing light out from here on */
  approach?: boolean;
}

interface Route {
  points: Waypoint[];
  /** start over at point `loopTo` after the last point; otherwise the aircraft is replaced */
  loopTo: number | null;
}

const G = 9.81;
const DEG = Math.PI / 180;
const NEUTRAL = createControlState();

/** One AI aircraft: flown kinematically along waypoints, drawn with the same model as the player's. */
class Traffic {
  readonly ac = new Aircraft();
  readonly model: AircraftVisual | null;
  route: Route = { points: [], loopTo: null };
  next = 0;
  speed = 0;
  heading = 0;
  bank = 0;
  vs = 0;
  done = false;
  /** crossing traffic slot, null for circuit and airliner traffic */
  slot: number | null = null;
  /** the airport whose runway the ground waypoints are on */
  airport: Airport | null = null;

  constructor(
    readonly type: AircraftType,
    makeModel: ModelFactory,
  ) {
    this.ac.setType(type);
    this.model = makeModel ? makeModel(type) : null;
    this.model?.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.noShadow) o.castShadow = true;
    });
  }

  start(route: Route, at: number): void {
    this.route = route;
    const p = route.points[at];
    const n = route.points[(at + 1) % route.points.length];
    this.ac.pos.copy(p.pos);
    this.heading = Math.atan2(n.pos.x - p.pos.x, -(n.pos.z - p.pos.z));
    this.speed = p.speed;
    this.next = (at + 1) % route.points.length;
    this.bank = 0;
    this.vs = 0;
    this.done = false;
    this.ac.gear = p.ground || p.approach || !this.type.retractableGear ? 1 : 0;
  }

  update(dt: number, height: Height, runwayBusy: (a: Airport) => boolean = () => false): void {
    const t = this.type;
    const pts = this.route.points;
    const wp = pts[this.next];
    const ac = this.ac;
    const dx = wp.pos.x - ac.pos.x;
    const dz = wp.pos.z - ac.pos.z;
    const dist = Math.hypot(dx, dz);

    // speed and turn: bank toward the waypoint like a pilot would (rate-limited)
    this.speed += THREE.MathUtils.clamp(wp.speed - this.speed, -1.5 * dt, (wp.ground ? 2.5 : 1.5) * dt);
    const want = Math.atan2(dx, -dz);
    const err = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    const maxBank = (wp.ground ? 0 : t.id === 'f16' ? 60 : t.id === 'a320' ? 25 : 30) * DEG;
    const v = Math.max(this.speed, 5);
    const bankTarget = THREE.MathUtils.clamp(Math.atan((v * err * 0.5) / G), -maxBank, maxBank);
    this.bank += THREE.MathUtils.clamp(bankTarget - this.bank, -0.35 * dt, 0.35 * dt);
    const rate = wp.ground ? THREE.MathUtils.clamp(err, -0.3, 0.3) : (G * Math.tan(this.bank)) / v;
    this.heading += rate * dt;

    // height: straight to the waypoint's altitude, never into the ground
    const gy = height(ac.pos.x, ac.pos.z);
    const ground = Math.max(gy, 0) + t.restHeight;
    let y: number;
    if (wp.ground) {
      // flare onto the runway instead of dropping onto it
      y = Math.max(ground, ac.pos.y - 2.5 * dt);
      this.vs = 0;
    } else {
      const time = Math.max(dist / v, 1);
      const climb = t.id === 'f16' ? 40 : t.id === 'glider' ? 2 : 5;
      this.vs += THREE.MathUtils.clamp((wp.pos.y - ac.pos.y) / time - this.vs, -2 * dt, 2 * dt);
      this.vs = THREE.MathUtils.clamp(this.vs, -climb * 1.4, climb);
      // terrain ahead: climb away from it whatever the waypoint says
      const ahead = height(ac.pos.x + Math.sin(this.heading) * v * 12, ac.pos.z - Math.cos(this.heading) * v * 12);
      if (ahead > ac.pos.y - (wp.approach ? 30 : 120)) this.vs = Math.max(this.vs, climb);
      y = Math.max(ac.pos.y + this.vs * dt, ground);
    }
    ac.pos.set(ac.pos.x + Math.sin(this.heading) * v * dt, y, ac.pos.z - Math.cos(this.heading) * v * dt);
    ac.vel.set(Math.sin(this.heading) * v, this.vs, -Math.cos(this.heading) * v);
    ac.onGround = !!wp.ground && y <= ground + 0.01;

    // attitude: flight path plus a few degrees of angle of attack, banked into turns
    const pitch = wp.ground ? t.restPitch * DEG : Math.atan2(this.vs, v) + 3 * DEG;
    ac.quat.setFromEuler(new THREE.Euler(pitch, -this.heading, -this.bank, 'YXZ'));
    ac.aero.force.y = t.mass * G * (wp.ground ? 0.3 : 1 / Math.cos(this.bank));
    ac.aero.airspeed = v;

    // engine, gear and lights for the model
    const e = ac.engine;
    e.running = t.sound !== 'glider';
    e.spool = wp.ground && this.speed > wp.speed - 1 ? 0.3 : 0.8;
    e.rpm = t.sound === 'piston' ? 2300 : t.sound === 'turboprop' ? 75 : t.sound === 'jet' ? 85 : 0;
    const gearTarget = wp.ground || wp.approach || !t.retractableGear ? 1 : 0;
    ac.gear += THREE.MathUtils.clamp(gearTarget - ac.gear, -dt / 6, dt / 6);
    ac.flaps += THREE.MathUtils.clamp((wp.approach || wp.ground ? 0.66 : 0) - ac.flaps, -dt * 0.3, dt * 0.3);
    ac.systems.landing = !!wp.approach;

    // next waypoint when close or passed
    const prev = pts[(this.next + pts.length - 1) % pts.length];
    const legX = wp.pos.x - prev.pos.x;
    const legZ = wp.pos.z - prev.pos.z;
    const passed = dx * legX + dz * legZ < 0;
    if (dist < Math.max(40, v * 1.5) || passed) {
      this.next++;
      if (this.next >= pts.length) {
        if (this.route.loopTo === null) this.done = true;
        else this.next = this.route.loopTo;
      }
      // runway occupied by the player: go around, straight ahead into the climb-out
      if (!this.done && pts[this.next].ground && !ac.onGround && this.airport && runwayBusy(this.airport)) {
        while (pts[this.next].ground) this.next = (this.next + 1) % pts.length;
        this.vs = Math.max(this.vs, 2);
      }
    }
    if (this.model) {
      this.model.update(dt, NEUTRAL, ac);
      this.model.root.position.copy(ac.pos);
      this.model.root.quaternion.copy(ac.quat);
    }
  }
}

/** Highest terrain along a straight line (sampled every 150 m, `width` m to either side). */
function maxTerrain(a: THREE.Vector3, b: THREE.Vector3, height: Height, width = 0): number {
  const n = Math.max(2, Math.ceil(a.distanceTo(b) / 150));
  const len = Math.max(a.distanceTo(b), 1);
  const sx = (-(b.z - a.z) / len) * width;
  const sz = ((b.x - a.x) / len) * width;
  let m = -Infinity;
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const z = a.z + ((b.z - a.z) * i) / n;
    m = Math.max(m, height(x, z), height(x + sx, z + sz), height(x - sx, z - sz));
  }
  return m;
}

/** Left- or right-hand circuit with touch-and-go, on whichever side the terrain allows. */
export function circuit(a: Airport, t: AircraftType, height: Height): Route | null {
  const L = a.length;
  // pattern speed capped so fast types turn inside the checked area (steep valley walls)
  const pattern = Math.min(t.cruise * 0.8, 55);
  const final = t.approach;
  // runway direction and circuit side with the lowest terrain around the circuit and under the final
  const best = [1, -1]
    .flatMap((dir) => [-900, 900, -650, 650].map((off) => ({ dir, off })))
    .map(({ dir, off }) => {
      const rp = (along: number, lateral: number) => runwayPoint(a, dir * along, dir * lateral);
      const corners = [rp(L / 2 + 900, 0), rp(L / 2 + 900, off), rp(-L / 2 - 1300, off), rp(-L / 2 - 1300, 0)];
      let top = -Infinity;
      for (let i = 0; i < 4; i++) top = Math.max(top, maxTerrain(corners[i], corners[(i + 1) % 4], height, 600));
      const finalTop = maxTerrain(rp(-L / 2 - 1500, 0), rp(-L / 2, 0), height, 100);
      // a final over high ground rules the direction out
      const score = top + Math.max(0, finalTop - a.center.y - 40) * 10;
      return { dir, off, top, score, finalTop };
    })
    .sort((p, q) => p.score - q.score)[0];
  // a strip deep in a valley with no straight final: no circuit traffic there
  if (best.finalTop - a.center.y > 80) return null;
  const { dir, off } = best;
  // circuit height 300 m above the field, more where the terrain asks for it
  const h = Math.max(300, best.top - a.center.y + 180);
  // every turn point at least 150 m above the terrain below it (except on the final)
  const p = (along: number, lateral: number, hgt: number) => {
    const q = runwayPoint(a, dir * along, dir * lateral, hgt);
    if (lateral !== 0 || along > 0) q.y = Math.max(q.y, Math.max(0, height(q.x, q.z)) + 150);
    return q;
  };
  return {
    points: [
      { pos: p(-L / 2 + 50, 0, 0), speed: final, ground: true, approach: true },
      { pos: p(-L / 2 + 350, 0, 0), speed: final * 1.05, ground: true },
      { pos: p(L / 2 + 600, 0, h * 0.5), speed: pattern },
      { pos: p(L / 2 + 900, off * 0.6, h), speed: pattern },
      { pos: p(L / 2, off, h), speed: pattern },
      { pos: p(-L / 2 - 600, off, h), speed: pattern, approach: true },
      { pos: p(-L / 2 - 1300, off * 0.6, h * 0.65), speed: final * 1.15, approach: true },
      { pos: p(-L / 2 - 1300, 0, h * 0.45), speed: final * 1.1, approach: true },
      { pos: p(-L / 2 - 400, 0, 22), speed: final, approach: true },
    ],
    loopTo: 0,
  };
}

/** Straight-in approach of an airliner from 14 km out, landing and rolling out. */
function airlinerApproach(a: Airport, t: AircraftType): Route {
  const L = a.length;
  const p = (along: number, height: number) => runwayPoint(a, along, 0, height);
  return {
    points: [
      { pos: p(-L / 2 - 14000, 750), speed: t.approach * 1.35 },
      { pos: p(-L / 2 - 9000, 480), speed: t.approach * 1.1, approach: true },
      { pos: p(-L / 2 - 2000, 105), speed: t.approach, approach: true },
      { pos: p(-L / 2 + 300, 0), speed: t.approach * 0.95, approach: true },
      { pos: p(-L / 2 + 700, 0), speed: 35, ground: true, approach: true },
      { pos: p(L / 2 - 200, 0), speed: 12, ground: true },
    ],
    loopTo: null,
  };
}

/** Cross-country flight passing near the player at a safe height above the terrain. */
function crossing(near: THREE.Vector3, t: AircraftType, height: Height, rnd: () => number): Route {
  const course = rnd() * Math.PI * 2;
  const miss = (rnd() - 0.5) * 2400;
  const dir = new THREE.Vector3(Math.sin(course), 0, -Math.cos(course));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const centre = near.clone().addScaledVector(side, miss);
  const a = centre.clone().addScaledVector(dir, -7000);
  const b = centre.clone().addScaledVector(dir, 7000);
  const above = t.id === 'glider' ? 350 : t.id === 'f16' ? 250 : 450 + rnd() * 600;
  const y = Math.max(maxTerrain(a, b, height), 0) + above;
  // put it roughly at the player's level now and then, so there is something to see
  const level = Math.max(y, near.y + (rnd() - 0.4) * 300);
  a.y = level;
  b.y = level;
  return {
    points: [
      { pos: a, speed: t.cruise },
      { pos: b, speed: t.cruise },
    ],
    loopTo: null,
  };
}

export interface TrafficAdvisory {
  text: string;
  /** distance (m) */
  distance: number;
}

const PATTERN_TYPES: AircraftId[] = ['c172', 'cub', 'pc12', 'baron'];
const CROSSING_TYPES: AircraftId[] = ['baron', 'pc12', 'jet', 'c172', 'f16', 'glider'];

/**
 * Other aircraft in the sky: circuit traffic at the home airfield, cross-country flights
 * passing near the player and (New York) airliners landing at LaGuardia.
 */
export class TrafficManager {
  readonly group = new THREE.Group();
  private readonly fleet: Traffic[] = [];
  private seed = 1;
  private crossings = 2;
  advisory: TrafficAdvisory | null = null;

  constructor(
    private readonly height: Height,
    private readonly makeModel: ModelFactory = (t) => new GenericModel(t),
  ) {
    this.group.name = 'traffic';
  }

  /** the AI aircraft (state only) */
  get aircraft(): Aircraft[] {
    return this.fleet.map((t) => t.ac);
  }

  /** AI aircraft with their role: cross-country flights or circuit/airliner traffic */
  get states(): { ac: Aircraft; crossing: boolean }[] {
    return this.fleet.map((t) => ({ ac: t.ac, crossing: t.slot !== null }));
  }

  private rnd = (): number => {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  };

  private add(id: AircraftId): Traffic {
    const tr = new Traffic(AIRCRAFT[id], this.makeModel);
    this.fleet.push(tr);
    if (tr.model) this.group.add(tr.model.root);
    return tr;
  }

  clear(): void {
    for (const tr of this.fleet) {
      if (!tr.model) continue;
      this.group.remove(tr.model.root);
      tr.model.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.fleet.length = 0;
    this.advisory = null;
  }

  /** New traffic for the current scenario; `amount` 0 = none, 1 = normal, 2 = busy. */
  start(amount: number, player: THREE.Vector3): void {
    this.clear();
    if (amount <= 0) return;
    this.seed = 1 + Math.floor(Math.random() * 100000);
    const sc = scenario();
    const airports = sc.airports;
    if (sc.id === 'nyc') {
      // LaGuardia: airliners on final to the runway the player is not using
      const lga = airports[1] ?? airports[0];
      for (let i = 0; i < amount; i++) {
        const tr = this.add('a320');
        tr.airport = lga;
        tr.start(airlinerApproach(lga, AIRCRAFT.a320), i);
      }
    } else {
      // circuit traffic at the home airfield (or the next one that allows a circuit), spread around it
      const n = amount;
      for (let i = 0; i < n; i++) {
        const type = AIRCRAFT[PATTERN_TYPES[Math.floor(this.rnd() * PATTERN_TYPES.length)]];
        const field = airports.find((a) => circuit(a, type, this.height));
        if (!field) break;
        const route = circuit(field, type, this.height)!;
        const tr = this.add(type.id);
        tr.airport = field;
        tr.start(route, 2 + Math.floor(((i + 0.5) / n) * (route.points.length - 3)));
      }
    }
    this.crossings = amount === 1 ? 2 : 4;
    for (let i = 0; i < this.crossings; i++) this.spawnCrossing(player, i);
  }

  private spawnCrossing(player: THREE.Vector3, slot: number): void {
    let id = CROSSING_TYPES[Math.floor(this.rnd() * CROSSING_TYPES.length)];
    if (scenario().id === 'nyc' && id === 'glider') id = 'c172';
    const old = this.fleet.find((t) => t.slot === slot);
    let tr = old && old.type.id === id ? old : null;
    if (old && !tr) {
      if (old.model) this.group.remove(old.model.root);
      this.fleet.splice(this.fleet.indexOf(old), 1);
    }
    tr ??= this.add(id);
    tr.slot = slot;
    // start a little way along so it is not always at the far end
    tr.start(crossing(player, tr.type, this.height, this.rnd), 0);
    const ahead = 2000 + this.rnd() * 3000;
    for (let i = 0; i < ahead / 50; i++) tr.update(50 / Math.max(tr.speed, 1), this.height);
  }

  update(dt: number, player: Aircraft): void {
    if (!this.fleet.length) return;
    this.advisory = null;
    let best = Infinity;
    const busy = (a: Airport) => {
      if (player.pos.y - a.center.y > 40) return false;
      const l = runwayLocal(a, player.pos.x, player.pos.z);
      return Math.abs(l.lateral) < a.width * 2 && Math.abs(l.along) < a.length / 2 + 300;
    };
    for (const tr of [...this.fleet]) {
      tr.update(dt, this.height, busy);
      if (tr.done) {
        if (tr.slot !== null) this.spawnCrossing(player.pos, tr.slot);
        else if (tr.airport) tr.start(airlinerApproach(tr.airport, tr.type), 0);
        continue;
      }
      const d = tr.ac.pos.distanceTo(player.pos);
      // crossing traffic far behind is recycled
      if (tr.slot !== null && d > 9000) tr.done = true;
      const dy = tr.ac.pos.y - player.pos.y;
      if (d < 2500 && Math.abs(dy) < 300 && d < best) {
        best = d;
        this.advisory = { text: this.describe(player, tr, d, dy), distance: d };
      }
    }
  }

  /** "Verkehr 2 Uhr, 1,2 km, 300 ft höher" */
  private describe(player: Aircraft, tr: Traffic, d: number, dy: number): string {
    const p = player.pos;
    const bearing = Math.atan2(tr.ac.pos.x - p.x, -(tr.ac.pos.z - p.z)) / DEG;
    let clock = Math.round((((bearing - player.headingDeg) % 360) + 360) % 360 / 30);
    if (clock === 0) clock = 12;
    const ft = Math.round((dy * 3.28084) / 100) * 100;
    const level = Math.abs(ft) < 200 ? 'gleiche Höhe' : `${Math.abs(ft)} ft ${ft > 0 ? 'höher' : 'tiefer'}`;
    const dist = d < 1000 ? `${Math.round(d / 50) * 50} m` : `${(d / 1000).toFixed(1).replace('.', ',')} km`;
    return `Verkehr ${clock} Uhr, ${dist}, ${level} (${tr.type.short})`;
  }

  /** The player flew into another aircraft? */
  collides(player: Aircraft): boolean {
    for (const tr of this.fleet) {
      const r = (player.type.model.wing.span + tr.type.model.wing.span) * 0.3;
      if (tr.ac.pos.distanceToSquared(player.pos) < r * r) return true;
    }
    return false;
  }
}
