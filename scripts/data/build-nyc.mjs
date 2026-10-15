#!/usr/bin/env node
/**
 * Builds the New York scenario data from open sources:
 *  - elevation + river depth: Mapzen/Tilezen terrain tiles (terrarium, AWS open data)
 *  - building footprints with roof heights: NYC Open Data "Building Footprints" (5zhs-2jue)
 *  - parks: NYC Open Data "Parks Properties" (enfh-gkve)
 *  - water areas: US Census TIGER/Line AREAWATER (public domain), unzipped .shp files in <raw>/tiger/shp
 *
 * Usage: node scripts/data/build-nyc.mjs <raw-download-dir> <output-dir>
 * Raw downloads are cached in <raw-download-dir>; outputs go to <output-dir> (public/data/nyc).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error('usage: build-nyc.mjs <raw-download-dir> <output-dir>');
  process.exit(1);
}
mkdirSync(rawDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const UA = { 'User-Agent': 'planr-data-prep/1.0 (+https://github.com/sensedrive/planr)' };
const BBOX = { south: 40.68, north: 40.83, west: -74.06, east: -73.85 };
// local tangent plane origin: Times Square
const LAT0 = 40.758;
const LON0 = -73.9855;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const CELL = 15; // heightmap spacing (m)

const toLocal = (lat, lon) => [(lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT];
const toLatLon = (x, z) => [LAT0 - z / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];

async function cached(name, url, init) {
  const file = join(rawDir, name);
  if (existsSync(file)) return readFileSync(file);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      return buf;
    }
    console.warn(`  ${res.status} for ${name}, retrying…`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`download failed: ${url}`);
}

// ---------------------------------------------------------------- elevation
const Z = 14;
const lon2tile = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2tile = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

async function elevation() {
  const tx0 = Math.floor(lon2tile(BBOX.west));
  const tx1 = Math.floor(lon2tile(BBOX.east));
  const ty0 = Math.floor(lat2tile(BBOX.north));
  const ty1 = Math.floor(lat2tile(BBOX.south));
  const tiles = new Map();
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const buf = await cached(`terrarium-${Z}-${tx}-${ty}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
      tiles.set(`${tx}/${ty}`, PNG.sync.read(buf));
    }
  }
  console.log(`elevation: ${tiles.size} tiles`);
  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256);
    const ty = Math.floor(gy / 256);
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) return -20;
    const i = ((gy - ty * 256) * 256 + (gx - tx * 256)) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const sample = (lat, lon) => {
    const fx = lon2tile(lon) * 256 - 0.5;
    const fy = lat2tile(lat) * 256 - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const ax = fx - x0;
    const ay = fy - y0;
    return (
      px(x0, y0) * (1 - ax) * (1 - ay) + px(x0 + 1, y0) * ax * (1 - ay) + px(x0, y0 + 1) * (1 - ax) * ay + px(x0 + 1, y0 + 1) * ax * ay
    );
  };
  const [xMin, zMax] = toLocal(BBOX.south, BBOX.west);
  const [xMax, zMin] = toLocal(BBOX.north, BBOX.east);
  const nx = Math.floor((xMax - xMin) / CELL) + 1;
  const nz = Math.floor((zMax - zMin) / CELL) + 1;
  const heights = new Int16Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = toLatLon(xMin + i * CELL, zMin + j * CELL);
      heights[j * nx + i] = Math.round(Math.max(-3000, Math.min(3000, sample(lat, lon))) * 10);
    }
  }
  return { heights, nx, nz, x0: xMin, z0: zMin };
}

// ---------------------------------------------------------------- socrata
async function socrata(dataset, name, where, select) {
  const rows = [];
  for (let offset = 0; ; offset += 50000) {
    const q = new URLSearchParams({ $select: select, $where: where, $limit: '50000', $offset: String(offset), $order: ':id' });
    const buf = await cached(`${name}-${offset}.json`, `https://data.cityofnewyork.us/resource/${dataset}.json?${q}`);
    const page = JSON.parse(buf.toString('utf8'));
    rows.push(...page);
    console.log(`${name}: ${rows.length}`);
    if (page.length < 50000) break;
  }
  return rows;
}

const box = `within_box(the_geom, ${BBOX.north}, ${BBOX.west}, ${BBOX.south}, ${BBOX.east})`;

/** Douglas–Peucker on a closed ring of [x, z] points (last point != first). */
function simplify(points, eps) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = points[a];
    const [bx, bz] = points[b];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    let best = -1;
    let bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i][0] - ax) * dz - (points[i][1] - az) * dx) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function outerRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}

async function buildings() {
  const select = 'the_geom,height_roof,ground_elevation,base_bbl';
  const manhattan = await socrata('5zhs-2jue', 'bldg-manhattan', "starts_with(base_bbl,'1') AND height_roof > 8", select);
  // outside Manhattan: everything from about four storeys up (≈ 12 m)
  const tall = await socrata('5zhs-2jue', 'bldg-outer', `NOT starts_with(base_bbl,'1') AND height_roof > 40 AND ${box}`, select);
  const FT = 0.3048;
  const out = [];
  for (const row of [...manhattan, ...tall]) {
    const h = Number(row.height_roof) * FT;
    const g = Number(row.ground_elevation) * FT;
    // the source has a few broken records (one claims 649 km); nothing in NYC is taller than ~545 m
    if (!Number.isFinite(h) || h < 2 || h > 600) continue;
    for (const ring of outerRings(row.the_geom)) {
      let pts = ring.map(([lon, lat]) => toLocal(lat, lon));
      if (pts.length > 1) {
        const [fx, fz] = pts[0];
        const [lx, lz] = pts[pts.length - 1];
        if (fx === lx && fz === lz) pts.pop();
      }
      pts = simplify(pts, 1.2);
      if (pts.length < 3) continue;
      // area sanity: skip slivers
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[(i + 1) % pts.length];
        area += x1 * z2 - x2 * z1;
      }
      if (Math.abs(area) / 2 < 12) continue;
      if (pts.length > 255) pts = simplify(pts, 3);
      out.push({ pts, h, g });
    }
  }
  console.log(`buildings: ${out.length}`);
  // binary: u32 count, then per building u16 n, i16 roof(dm), i16 ground(dm), n × (i16 x, i16 z) at 0.5 m
  let size = 4;
  for (const b of out) size += 6 + b.pts.length * 4;
  const buf = Buffer.alloc(size);
  let o = buf.writeUInt32LE(out.length, 0);
  for (const b of out) {
    o = buf.writeUInt16LE(b.pts.length, o);
    o = buf.writeInt16LE(Math.round(Math.min(b.h, 3000) * 10), o);
    o = buf.writeInt16LE(Math.round(Math.max(-300, Math.min(b.g, 3000)) * 10), o);
    for (const [x, z] of b.pts) {
      o = buf.writeInt16LE(Math.round(Math.max(-16380, Math.min(16380, x * 2))), o);
      o = buf.writeInt16LE(Math.round(Math.max(-16380, Math.min(16380, z * 2))), o);
    }
  }
  return buf;
}

/** Minimal ESRI shapefile reader for polygon records (type 5): returns rings of [lon, lat]. */
function readShpPolygons(file) {
  const b = readFileSync(file);
  const records = [];
  let o = 100;
  while (o + 8 <= b.length) {
    const len = b.readInt32BE(o + 4) * 2;
    const rec = o + 8;
    o = rec + len;
    if (b.readInt32LE(rec) !== 5) continue;
    const numParts = b.readInt32LE(rec + 36);
    const numPoints = b.readInt32LE(rec + 40);
    const parts = [];
    for (let i = 0; i < numParts; i++) parts.push(b.readInt32LE(rec + 44 + i * 4));
    const pts = rec + 44 + numParts * 4;
    const rings = [];
    for (let p = 0; p < numParts; p++) {
      const end = p + 1 < numParts ? parts[p + 1] : numPoints;
      const ring = [];
      for (let i = parts[p]; i < end; i++) ring.push([b.readDoubleLE(pts + i * 16), b.readDoubleLE(pts + i * 16 + 8)]);
      rings.push(ring);
    }
    records.push(rings);
  }
  return records;
}

/** Even-odd rasterisation of one polygon (all rings, so holes/islands work) into `mask`. */
function rasterize(grid, rings, mask, value) {
  const local = rings.map((r) => r.map(([lon, lat]) => toLocal(lat, lon)));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of local)
    for (const [x, z] of r) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  const i0 = Math.max(0, Math.floor((minX - grid.x0) / CELL));
  const i1 = Math.min(grid.nx - 1, Math.ceil((maxX - grid.x0) / CELL));
  const j0 = Math.max(0, Math.floor((minZ - grid.z0) / CELL));
  const j1 = Math.min(grid.nz - 1, Math.ceil((maxZ - grid.z0) / CELL));
  for (let j = j0; j <= j1; j++) {
    const z = grid.z0 + j * CELL;
    // crossings of this scanline with all edges
    const xs = [];
    for (const r of local) {
      for (let a = 0, c = r.length - 1; a < r.length; c = a++) {
        const [xa, za] = r[a];
        const [xc, zc] = r[c];
        if (za > z !== zc > z) xs.push(((xc - xa) * (z - za)) / (zc - za) + xa);
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(i0, Math.ceil((xs[k] - grid.x0) / CELL));
      const to = Math.min(i1, Math.floor((xs[k + 1] - grid.x0) / CELL));
      for (let i = from; i <= to; i++) mask[j * grid.nx + i] = value;
    }
  }
}

const COVER = { urban: 0, park: 1, water: 2 };

function water(grid, cover) {
  const dir = join(rawDir, 'tiger', 'shp');
  let n = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.shp'))) {
    for (const rings of readShpPolygons(join(dir, f))) {
      rasterize(grid, rings, cover, COVER.water);
      n++;
    }
  }
  // rivers get depth, land loses spikes and never dips below the water line
  const h = grid.heights;
  const src = Int16Array.from(h);
  let wet = 0;
  for (let j = 0; j < grid.nz; j++) {
    for (let i = 0; i < grid.nx; i++) {
      const k = j * grid.nx + i;
      if (cover[k] === COVER.water) {
        h[k] = -80;
        wet++;
        continue;
      }
      const v = [];
      for (let b = -1; b <= 1; b++)
        for (let a = -1; a <= 1; a++) {
          const ii = Math.min(grid.nx - 1, Math.max(0, i + a));
          const jj = Math.min(grid.nz - 1, Math.max(0, j + b));
          v.push(src[jj * grid.nx + ii]);
        }
      v.sort((p, q) => p - q);
      h[k] = Math.max(8, v[4]);
    }
  }
  console.log(`water: ${n} polygons, ${((100 * wet) / h.length).toFixed(1)} % of the area`);
}

async function parks(grid) {
  const rows = await socrata('enfh-gkve', 'parks', `acres > 3 AND within_box(multipolygon, ${BBOX.north}, ${BBOX.west}, ${BBOX.south}, ${BBOX.east})`, 'multipolygon,acres,signname');
  const cover = new Uint8Array(grid.nx * grid.nz);
  for (const row of rows) {
    for (const ring of outerRings(row.multipolygon)) {
      const pts = ring.map(([lon, lat]) => toLocal(lat, lon));
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      const i0 = Math.max(0, Math.floor((minX - grid.x0) / CELL));
      const i1 = Math.min(grid.nx - 1, Math.ceil((maxX - grid.x0) / CELL));
      const j0 = Math.max(0, Math.floor((minZ - grid.z0) / CELL));
      const j1 = Math.min(grid.nz - 1, Math.ceil((maxZ - grid.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = grid.z0 + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = grid.x0 + i * CELL;
          let inside = false;
          for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
            const [xa, za] = pts[a];
            const [xb, zb] = pts[b];
            if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
          }
          if (inside) cover[j * grid.nx + i] = COVER.park;
        }
      }
    }
  }
  console.log(`parks: ${rows.length}`);
  return cover;
}

const grid = await elevation();
const cover = await parks(grid);
water(grid, cover);
const bldg = await buildings();

writeFileSync(join(outDir, 'height.i16'), Buffer.from(grid.heights.buffer));
writeFileSync(join(outDir, 'cover.u8'), Buffer.from(cover.buffer));
writeFileSync(join(outDir, 'buildings.bin'), bldg);
writeFileSync(
  join(outDir, 'meta.json'),
  JSON.stringify(
    {
      origin: { lat: LAT0, lon: LON0 },
      metersPerDegree: { lat: M_PER_DEG_LAT, lon: M_PER_DEG_LON },
      grid: { nx: grid.nx, nz: grid.nz, x0: grid.x0, z0: grid.z0, cell: CELL, heightScale: 0.1 },
      cover: COVER,
      attribution: 'Gebäude & Parks: NYC Open Data · Wasser: US Census TIGER/Line · Gelände: Mapzen Terrain Tiles',
      built: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('done');
