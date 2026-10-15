import { createNoise2D } from 'simplex-noise';

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);
export const noiseA = createNoise2D(rand);
export const noiseB = createNoise2D(rand);
export const noiseC = createNoise2D(rand);
export const noiseD = createNoise2D(rand);

function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noiseA(x * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Natural landscape height before airfields are flattened in. */
export function rawHeight(x: number, z: number): number {
  let h = 35 + fbm(x * 0.00045, z * 0.00045, 5) * 170;
  const m = noiseB(x * 0.00011, z * 0.00011);
  const ridge = 1 - Math.abs(noiseC(x * 0.0005, z * 0.0005));
  if (m > 0) h += Math.pow(m, 1.6) * (700 + ridge * ridge * 700);
  return h;
}
