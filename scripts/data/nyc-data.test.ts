import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Integrity checks for the generated New York data in public/data/nyc.
const dir = new URL('../../public/data/nyc/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8'));
const { nx, nz, x0, z0, cell } = meta.grid;
const heights = new Int16Array(readFileSync(new URL('height.i16', dir)).buffer.slice(0));
const cover = readFileSync(new URL('cover.u8', dir));

const at = (lat: number, lon: number) => {
  const x = (lon - meta.origin.lon) * meta.metersPerDegree.lon;
  const z = -(lat - meta.origin.lat) * meta.metersPerDegree.lat;
  const k = Math.round((z - z0) / cell) * nx + Math.round((x - x0) / cell);
  return { h: heights[k] / 10, cover: cover[k] };
};

describe('NYC data', () => {
  it('grids match the metadata', () => {
    expect(heights.length).toBe(nx * nz);
    expect(cover.length).toBe(nx * nz);
  });

  it('knows where the rivers and the park are', () => {
    expect(at(40.76, -74.007).cover).toBe(meta.cover.water); // Hudson
    expect(at(40.745, -73.966).cover).toBe(meta.cover.water); // East River
    expect(at(40.781, -73.966).cover).toBe(meta.cover.park); // Central Park
    expect(at(40.758, -73.9855).cover).toBe(meta.cover.urban); // Times Square
    expect(at(40.758, -73.9855).h).toBeGreaterThan(0);
  });

  it('contains Manhattan and the outer-borough buildings with sane heights', () => {
    const b = readFileSync(new URL('buildings.bin', dir));
    const n = b.readUInt32LE(0);
    expect(n).toBeGreaterThan(70000);
    let o = 4;
    let tallest = 0;
    for (let i = 0; i < n; i++) {
      const count = b.readUInt16LE(o);
      tallest = Math.max(tallest, b.readInt16LE(o + 2) / 10);
      o += 6 + count * 4;
    }
    expect(o).toBe(b.length);
    expect(tallest).toBeGreaterThan(400); // One WTC / Central Park Tower
    expect(tallest).toBeLessThan(560);
  });
});
