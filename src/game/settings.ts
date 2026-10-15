import { type AircraftId, AIRCRAFT } from '../sim/types';
import type { ScenarioId } from '../world/scenario';
import type { TimeOfDay } from '../world/sky';
import type { WindSetting } from './weather';

export type MissionId = 'free' | 'airstart' | 'landing' | 'rings' | 'crosscountry' | 'ditching';

export interface Settings {
  scenario: ScenarioId;
  aircraft: AircraftId;
  mission: MissionId;
  wind: WindSetting;
  sky: 'clear' | 'clouds' | 'rain' | 'live';
  time: TimeOfDay;
  realism: 'simple' | 'real';
  failure: 'off' | 'random' | 'takeoff';
  /** ground starts: engine running or cold and dark */
  start: 'ready' | 'cold';
  vignette: 'off' | 'on';
  /** head shake from runway, turbulence, buffet */
  shake: 'off' | 'on';
  /** AI aircraft in the sky */
  traffic: 'off' | 'normal' | 'busy';
  /** seat height offset in metres */
  seat: number;
  /** stick hand travel for full deflection in metres */
  stick: number;
}

export interface Choice {
  value: string | number;
  label: string;
  /** only offered in these landscapes */
  only?: ScenarioId[];
}

export function choiceAvailable(ch: Choice, s: Settings): boolean {
  return !ch.only || ch.only.includes(s.scenario);
}

export interface OptionDef {
  key: keyof Settings;
  label: string;
  choices: Choice[];
  /** applied immediately, without restarting the flight */
  live?: boolean;
}

export const OPTIONS: OptionDef[] = [
  {
    key: 'scenario',
    label: 'Landschaft',
    choices: [
      { value: 'alps', label: 'Alpental' },
      { value: 'fjord', label: 'Fjordküste' },
      { value: 'nyc', label: 'New York' },
    ],
  },
  {
    key: 'aircraft',
    label: 'Flugzeug',
    choices: Object.values(AIRCRAFT).map((a) => ({ value: a.id, label: a.short })),
  },
  {
    key: 'mission',
    label: 'Mission',
    choices: [
      { value: 'free', label: 'Freiflug' },
      { value: 'airstart', label: 'Luftstart' },
      { value: 'landing', label: 'Landung' },
      { value: 'rings', label: 'Ringe' },
      { value: 'crosscountry', label: 'Streckenflug', only: ['alps', 'fjord'] },
      { value: 'ditching', label: 'Notwasserung', only: ['nyc'] },
    ],
  },
  {
    key: 'wind',
    label: 'Wind',
    choices: [
      { value: 'calm', label: 'Ruhig' },
      { value: 'light', label: 'Leicht' },
      { value: 'strong', label: 'Stark' },
      { value: 'gusty', label: 'Böig' },
    ],
  },
  {
    key: 'sky',
    label: 'Wetter',
    choices: [
      { value: 'clear', label: 'Klar' },
      { value: 'clouds', label: 'Bewölkt' },
      { value: 'rain', label: 'Regen' },
      { value: 'live', label: 'Live (KLGA)', only: ['nyc'] },
    ],
  },
  {
    key: 'time',
    label: 'Tageszeit',
    choices: [
      { value: 'day', label: 'Tag' },
      { value: 'evening', label: 'Abend' },
      { value: 'night', label: 'Nacht' },
    ],
  },
  {
    key: 'realism',
    label: 'Flugverhalten',
    choices: [
      { value: 'simple', label: 'Einfach' },
      { value: 'real', label: 'Realistisch' },
    ],
  },
  {
    key: 'failure',
    label: 'Motorausfall',
    choices: [
      { value: 'off', label: 'Aus' },
      { value: 'random', label: 'Zufällig' },
      { value: 'takeoff', label: 'Nach Start' },
    ],
  },
  {
    key: 'traffic',
    label: 'Flugverkehr',
    choices: [
      { value: 'off', label: 'Aus' },
      { value: 'normal', label: 'Normal' },
      { value: 'busy', label: 'Viel' },
    ],
  },
  {
    key: 'start',
    label: 'Start am Boden',
    choices: [
      { value: 'ready', label: 'Motor läuft' },
      { value: 'cold', label: 'Kalt & dunkel' },
    ],
  },
  {
    key: 'vignette',
    label: 'Komfort-Vignette',
    live: true,
    choices: [
      { value: 'off', label: 'Aus' },
      { value: 'on', label: 'An' },
    ],
  },
  {
    key: 'shake',
    label: 'Wackeln & Vibration',
    live: true,
    choices: [
      { value: 'off', label: 'Aus' },
      { value: 'on', label: 'An' },
    ],
  },
  {
    key: 'seat',
    label: 'Sitzhöhe',
    live: true,
    choices: [
      { value: -0.1, label: '−10 cm' },
      { value: -0.05, label: '−5' },
      { value: 0, label: '0' },
      { value: 0.05, label: '+5' },
      { value: 0.1, label: '+10 cm' },
    ],
  },
  {
    key: 'stick',
    label: 'Knüppelweg (VR)',
    live: true,
    choices: [
      { value: 0.09, label: 'Kurz' },
      { value: 0.13, label: 'Mittel' },
      { value: 0.17, label: 'Lang' },
    ],
  },
];

export const DEFAULT_SETTINGS: Settings = {
  scenario: 'alps',
  aircraft: 'c172',
  mission: 'free',
  wind: 'light',
  sky: 'clouds',
  time: 'day',
  realism: 'real',
  failure: 'off',
  start: 'ready',
  vignette: 'on',
  shake: 'on',
  traffic: 'normal',
  seat: 0,
  stick: 0.13,
};

const KEY = 'planr.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // storage unavailable – use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Best results are kept per landscape and aircraft (`mission:scenario:aircraft`). */
export function bestKey(mission: string, s: Pick<Settings, 'scenario' | 'aircraft'>): string {
  return `${mission}:${s.scenario}:${s.aircraft}`;
}

export function loadBest(key: string): number | null {
  try {
    const v = localStorage.getItem(`planr.best.${key}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function saveBest(key: string, value: number): void {
  try {
    localStorage.setItem(`planr.best.${key}`, String(value));
  } catch {
    // ignore
  }
}
