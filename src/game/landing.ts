import type { Touchdown } from '../sim/aircraft';
import { type Airport, airportAt, runwayLocal } from '../world/airports';

const AIM_POINT = 300; // m after the threshold

export interface LandingResult {
  airport: Airport | null;
  stars: number;
  title: string;
  detail: string;
}

function grade(value: number, limits: [number, number, number]): number {
  return value <= limits[0] ? 3 : value <= limits[1] ? 2 : value <= limits[2] ? 1 : 0;
}

/** Rates a touchdown: sink rate, centreline offset, touchdown point and bank. */
export function rateLanding(td: Touchdown): LandingResult {
  const a = airportAt(td.position.x, td.position.z);
  if (!a) {
    return { airport: null, stars: 0, title: 'Außenlandung', detail: `${Math.round(-td.vsFpm)} ft/min` };
  }
  const p = runwayLocal(a, td.position.x, td.position.z);
  // which way did we land? heading close to runway A → threshold A at along = -len/2
  const diff = Math.abs(((td.headingDeg - a.heading + 540) % 360) - 180);
  const towardA = diff < 90;
  const fromThreshold = towardA ? p.along + a.length / 2 : a.length / 2 - p.along;
  const sink = Math.max(0, -td.vsFpm);
  const offset = Math.abs(p.lateral);
  const zone = Math.abs(fromThreshold - AIM_POINT);

  const sSink = grade(sink, [200, 400, 650]);
  const sLine = grade(offset, [2.5, 5, 9]);
  const sZone = grade(zone, [120, 250, 450]);
  const sBank = grade(Math.abs(td.bankDeg), [3, 6, 10]);
  const stars = Math.min(sSink, Math.round((sSink + sLine + sZone + sBank) / 4));
  const titles = ['Hart gelandet', 'Gelandet', 'Gute Landung', 'Butterweich!'];
  const label = towardA ? a.labelA : a.labelB;
  return {
    airport: a,
    stars,
    title: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  ${titles[stars]}`,
    detail: `${a.name} ${label} · ${Math.round(sink)} ft/min · ${offset.toFixed(1)} m neben Mitte · ${Math.round(fromThreshold)} m hinter Schwelle`,
  };
}
