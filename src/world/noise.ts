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
