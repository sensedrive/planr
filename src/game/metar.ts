import type { WeatherLook } from '../world/sky';

export interface Metar {
  raw: string;
  windFrom: number;
  windKt: number;
  gustKt: number;
  look: WeatherLook;
}

interface MetarJson {
  rawOb: string;
  wdir: number | string;
  wspd: number;
  wgst?: number;
  visib: number | string;
  clouds?: { cover: string; base: number | null }[];
}

const COVER: Record<string, number> = { SKC: 0, CLR: 0, FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, OVX: 1 };

/** Current weather at LaGuardia (via the same-origin proxy), mapped to wind and a sky look. */
export async function fetchMetar(): Promise<Metar> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/metar`);
  if (!res.ok) throw new Error(`METAR ${res.status}`);
  const [m] = (await res.json()) as MetarJson[];
  const clouds = (m.clouds ?? []).filter((c) => c.base !== null);
  const lowest = clouds.find((c) => (COVER[c.cover] ?? 0) >= 0.45) ?? clouds[0];
  const coverage = Math.max(0, ...clouds.map((c) => COVER[c.cover] ?? 0));
  const visib = typeof m.visib === 'string' ? parseFloat(m.visib) : m.visib;
  const wet = /(^|\s)[-+]?(TS)?(RA|DZ|SN|SH)/.test(m.rawOb.replace(/^METAR\s+\S+\s+\S+/, ''));
  return {
    raw: m.rawOb,
    windFrom: typeof m.wdir === 'number' ? m.wdir : 0,
    windKt: m.wspd ?? 0,
    gustKt: m.wgst ?? 0,
    look: {
      coverage: Math.min(1, coverage),
      base: lowest?.base ? Math.max(150, lowest.base * 0.3048) : null,
      overcast: coverage >= 0.75,
      rain: wet ? 1 : 0,
      visibility: Number.isFinite(visib) ? Math.max(800, visib * 1609) : 16000,
    },
  };
}
