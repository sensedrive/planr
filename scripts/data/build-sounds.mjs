#!/usr/bin/env node
/**
 * Cuts seamless engine loops from CC0 recordings (freesound.org) into public/sounds.
 * Usage: node scripts/data/build-sounds.mjs <dir-with-downloaded-mp3s> <output-dir>
 * Needs ffmpeg. Each loop is a steady segment with an end→start crossfade, RMS-normalised,
 * written as 16-bit mono WAV (sample-exact looping in every browser).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error('usage: build-sounds.mjs <raw-dir> <output-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const SR = 24000;
const LOOP = 6; // seconds
const FADE = 0.6; // crossfade seconds
const PAD = 0.05; // wrap-around padding so resampling at the edges stays seamless

/** Sources: freesound sound id, author, file, segment start, base rpm (prop) or N1 % (jet). */
const LOOPS = [
  { name: 'c172-ground', id: 443290, author: 'keng-wai-chane-chick-te', file: '443290_7522579-hq.mp3', start: 20, base: 1100, title: 'PLANE_CESSNA152_STARTING_TAXING_GRASS' },
  { name: 'c172-low', id: 444940, author: 'keng-wai-chane-chick-te', file: '444940_7522579-hq.mp3', start: 156, base: 1020, title: 'PLANE_CESSNA152_FLIGHT' },
  { name: 'c172-cruise', id: 444940, author: 'keng-wai-chane-chick-te', file: '444940_7522579-hq.mp3', start: 62, base: 2390, title: 'PLANE_CESSNA152_FLIGHT' },
  { name: 'jet-low', id: 547050, author: 'szegvari', file: '547050_2282212-hq.mp3', start: 4, base: 62, title: 'Turbine plane SFX' },
  { name: 'jet-high', id: 205581, author: 'qubodup', file: '205581_71257-hq.mp3', start: 30, base: 95, title: 'Jet Turbine Noise' },
];

function decode(file, start, seconds) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(start), '-t', String(seconds), '-i', join(rawDir, file), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

const meta = [];
for (const l of LOOPS) {
  const src = decode(l.file, l.start, LOOP + FADE);
  const n = Math.round(LOOP * SR);
  const f = Math.round(FADE * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = src[i];
  // equal-power crossfade: the tail after the loop end fades into the loop start
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = src[i] * Math.sin((t * Math.PI) / 2) + src[n + i] * Math.cos((t * Math.PI) / 2);
  }
  // remove DC and normalise to -20 dBFS RMS
  let mean = 0;
  for (const v of out) mean += v;
  mean /= n;
  let rms = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    rms += out[i] * out[i];
  }
  rms = Math.sqrt(rms / n);
  const gain = 0.1 / Math.max(rms, 1e-6);
  for (let i = 0; i < n; i++) out[i] *= gain;
  // [tail of loop][loop][head of loop]: play with loopStart/loopEnd on the inner part
  const p = Math.round(PAD * SR);
  const padded = new Float32Array(n + 2 * p);
  padded.set(out.subarray(n - p), 0);
  padded.set(out, p);
  padded.set(out.subarray(0, p), n + p);
  writeFileSync(join(outDir, `${l.name}.wav`), wav(padded));
  meta.push({ name: l.name, base: l.base, loopStart: p / SR, loopEnd: (n + p) / SR, source: `https://freesound.org/s/${l.id}/`, author: l.author, title: l.title, license: 'CC0 1.0' });
  console.log(`${l.name}: ${l.title} @ ${l.start}s, gain ${gain.toFixed(2)}`);
}
writeFileSync(join(outDir, 'sounds.json'), JSON.stringify(meta, null, 2));
