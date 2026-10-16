import { clamp, type ControlState } from '../core/input';
import type { Aircraft } from './aircraft';
import type { AircraftId, AircraftType } from './types';

/** Everything on the switch panel. */
export type SwitchId =
  | 'battery'
  | 'fuelPump'
  | 'ignition'
  | 'starter'
  | 'nav'
  | 'beacon'
  | 'strobe'
  | 'landing'
  | 'panel'
  | 'parkBrake'
  | 'com'
  | 'ap'
  | 'apHdg'
  | 'apAlt'
  | 'hdgDown'
  | 'hdgUp'
  | 'altDown'
  | 'altUp';

/** Switches available in this aircraft (a glider has no engine and no autopilot). */
export function switchesFor(type: AircraftType): SwitchId[] {
  const all: SwitchId[] = ['battery', 'fuelPump', 'ignition', 'starter', 'nav', 'beacon', 'strobe', 'landing', 'panel', 'parkBrake'];
  return type.glider ? all.filter((s) => s !== 'fuelPump' && s !== 'ignition' && s !== 'starter' && s !== 'beacon') : all;
}

/** usable fuel (kg) and burn at full power (kg/h), loosely after the real aircraft */
const FUEL: Record<AircraftId, [number, number]> = {
  c172: [150, 38],
  cub: [50, 16],
  extra: [130, 75],
  baron: [430, 140],
  pc12: [1200, 280],
  beaver: [290, 90],
  glider: [0, 0],
  jet: [820, 600],
  a320: [18_000, 5_400],
  f16: [3_200, 4_000],
};

const DEG = 180 / Math.PI;
const FT = 3.28084;
/** afterburners drink about five times the dry fuel flow */
const REHEAT_FACTOR = 5;

/** Electrics, fuel, engine start, lights and a simple two-axis autopilot. */
export class Systems {
  battery = true;
  fuelPump = true;
  ignition = true;
  nav = true;
  beacon = true;
  strobe = true;
  landing = false;
  panel = false;
  parkBrake = false;
  /** COM radio (tower and traffic calls); needs the battery */
  com = true;
  /** kg */
  fuel = 0;
  capacity = 0;
  /** kg/h at full power */
  private maxBurn = 0;
  /** seconds the starter keeps cranking after the START button */
  private cranking = 0;

  readonly ap = { on: false, hdg: true, alt: true, heading: 0, altitudeFt: 0 };
  /** pitch attitude the altitude hold is steering to (degrees) */
  private apPitch = 0;
  /** stick commands the autopilot wrote last, to tell them apart from the pilot's */
  private apOut = { pitch: 0, roll: 0 };
  /** last message for the pilot ("Autopilot aus", "Tank leer"), consumers clear it */
  notice = '';
  private glider = false;
  private electricGear = false;

  /** `running` = ready to go; otherwise cold and dark with the parking brake set. */
  reset(type: AircraftType, running: boolean): void {
    [this.capacity, this.maxBurn] = FUEL[type.id];
    this.fuel = this.capacity;
    this.glider = type.glider;
    this.electricGear = type.retractableGear;
    this.battery = running || type.glider;
    this.fuelPump = running && !type.glider;
    this.ignition = running && !type.glider;
    this.nav = running;
    this.beacon = running && !type.glider;
    this.strobe = running;
    this.landing = false;
    this.panel = false;
    this.parkBrake = !running;
    this.com = running || type.glider;
    this.cranking = 0;
    this.ap.on = false;
    this.notice = '';
  }

  get starting(): boolean {
    return this.cranking > 0;
  }

  get fuelFraction(): number {
    return this.capacity > 0 ? this.fuel / this.capacity : 0;
  }

  /** Can the electric gear / flap motors run? */
  get powered(): boolean {
    return this.battery;
  }

  isOn(id: SwitchId): boolean {
    switch (id) {
      case 'starter':
        return this.cranking > 0;
      case 'ap':
        return this.ap.on;
      case 'apHdg':
        return this.ap.on && this.ap.hdg;
      case 'apAlt':
        return this.ap.on && this.ap.alt;
      case 'hdgDown':
      case 'hdgUp':
      case 'altDown':
      case 'altUp':
        return false;
      default:
        return this[id];
    }
  }

  /** Flip a switch or press a button. */
  toggle(id: SwitchId, ac: Aircraft): void {
    switch (id) {
      case 'starter':
        if (!this.battery) this.notice = 'Batterie ist aus';
        else if (ac.engine.running) this.notice = 'Triebwerk läuft bereits';
        else this.cranking = 6;
        return;
      case 'ap':
        if (this.ap.on) this.disengage('');
        else this.engage(ac);
        return;
      case 'apHdg':
        if (!this.ap.on) this.engage(ac);
        this.ap.hdg = !this.ap.hdg;
        this.ap.heading = Math.round(ac.headingDeg);
        return;
      case 'apAlt':
        if (!this.ap.on) this.engage(ac);
        this.ap.alt = !this.ap.alt;
        this.ap.altitudeFt = Math.round(ac.altitudeFt / 100) * 100;
        this.apPitch = ac.pitchDeg;
        return;
      case 'hdgDown':
      case 'hdgUp':
        this.ap.heading = (this.ap.heading + (id === 'hdgUp' ? 10 : -10) + 360) % 360;
        return;
      case 'altDown':
      case 'altUp':
        this.ap.altitudeFt = Math.max(0, this.ap.altitudeFt + (id === 'altUp' ? 500 : -500));
        return;
      default:
        this[id] = !this[id];
        if (!this.battery) this.ap.on = false;
    }
  }

  private engage(ac: Aircraft): void {
    if (!this.battery) {
      this.notice = 'Batterie ist aus';
      return;
    }
    if (ac.onGround) {
      this.notice = 'Autopilot nur im Flug';
      return;
    }
    this.ap.on = true;
    this.ap.hdg = true;
    this.ap.alt = true;
    this.ap.heading = Math.round(ac.headingDeg);
    this.ap.altitudeFt = Math.round(ac.altitudeFt / 100) * 100;
    this.apPitch = ac.pitchDeg;
  }

  private disengage(reason: string): void {
    this.ap.on = false;
    this.notice = reason || 'Autopilot aus';
  }

  /** Physics-rate update: starter, fuel, engine starvation and the parking brake. */
  step(dt: number, ac: Aircraft, c: ControlState): void {
    const engine = ac.engine;
    const canRun = !this.glider && this.ignition && this.fuel > 0;
    if (this.cranking > 0) {
      this.cranking -= dt;
      if (!this.battery) this.cranking = 0;
      else engine.crank(dt, canRun);
      if (engine.running) this.cranking = 0;
    }
    if (engine.running && !canRun && !this.glider) {
      engine.running = false;
      this.notice = this.fuel <= 0 ? 'Tank leer – Triebwerk aus' : 'Zündung aus – Triebwerk aus';
    }
    if (engine.running) {
      const reheat = (engine as { reheat?: boolean }).reheat ? REHEAT_FACTOR : 1;
      this.fuel = Math.max(0, this.fuel - ((this.maxBurn * (0.12 + 0.88 * engine.spool) * reheat) / 3600) * dt);
    }
    if (this.parkBrake) c.brake = 1;
  }

  /**
   * Autopilot: overrides stick inputs to hold heading and altitude. Strong pilot input,
   * a stall or touching the ground disconnects it.
   */
  fly(dt: number, ac: Aircraft, c: ControlState): void {
    if (!this.ap.on) return;
    if (!this.battery) return this.disengage('Autopilot aus – kein Strom');
    if (ac.onGround || ac.crashed) return this.disengage('');
    const pilot = (v: number, ap: number) => Math.abs(v) > 0.5 && Math.abs(v - ap) > 0.05;
    if (pilot(c.pitch, this.apOut.pitch) || pilot(c.roll, this.apOut.roll)) return this.disengage('Autopilot vom Piloten übersteuert');
    if (ac.stallWarning) return this.disengage('Autopilot aus – Strömungsabriss');

    // lateral: bank toward the selected heading (max 25°), otherwise wings level
    let bank = 0;
    if (this.ap.hdg) {
      const err = ((this.ap.heading - ac.headingDeg + 540) % 360) - 180;
      bank = clamp(err * 1.2, -25, 25);
    }
    c.roll = clamp((bank - ac.rollDeg) * 0.04 + ac.omega.z * 0.4);

    // vertical: climb/descend toward the selected altitude (≤ 1000 ft/min), hold it there
    if (this.ap.alt) {
      const errFt = this.ap.altitudeFt - ac.altitudeFt;
      // climb less when the speed gets low, so the autopilot never pulls into a stall
      const approach = ac.type.approach;
      const margin = clamp((ac.aero.airspeed - approach * 1.2) / (approach * 0.3), 0, 1);
      const vsTarget = clamp(errFt * 3, -1000, 1000 * margin) / FT / 60;
      this.apPitch = clamp(this.apPitch + (vsTarget - ac.vel.y) * 0.5 * dt, -10, 15);
    }
    c.pitch = clamp((this.apPitch - ac.pitchDeg) * 0.12 - ac.omega.x * DEG * 0.012);
    this.apOut.pitch = c.pitch;
    this.apOut.roll = c.roll;
  }

  /** Is the radio receiving? */
  get radioOn(): boolean {
    return this.com && this.battery;
  }

  /** The gear can only move with electric (hydraulic pump) power. */
  gearCanMove(): boolean {
    return !this.electricGear || this.battery;
  }
}
