import * as THREE from 'three';

/** Tileable value-noise fBm as a grayscale canvas (period = size). */
function tileableNoise(size: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells);
    let s = seed * 9301 + o * 49297;
    for (let i = 0; i < grid.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      grid[i] = s / 0x7fffffff;
    }
    const at = (x: number, y: number) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
        out[y * size + x] += v * amp;
      }
    }
    norm += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function dataTexture(data: Uint8Array, size: number, channels: 1 | 4): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, channels === 1 ? THREE.RedFormat : THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let detail: THREE.DataTexture | null = null;

/** Grayscale detail texture used to break up flat terrain colours. */
export function detailTexture(): THREE.DataTexture {
  if (detail) return detail;
  const S = 256;
  const n = tileableNoise(S, 6, 3);
  const px = new Uint8Array(S * S);
  for (let i = 0; i < px.length; i++) px[i] = Math.round(Math.min(1, Math.max(0, (n[i] - 0.5) * 1.6 + 0.5)) * 255);
  detail = dataTexture(px, S, 1);
  return detail;
}

/**
 * Patches a terrain material: tri-planar detail texture at two scales (no stretching on cliffs),
 * multiplied onto the vertex colours.
 */
export function applyTerrainDetail(mat: THREE.MeshLambertMaterial): void {
  const tex = detailTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying highp vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying highp vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 n = abs(normalize(vWNormal));
          vec3 w = pow(n, vec3(4.0));
          w /= (w.x + w.y + w.z);
          float fine = texture2D(uDetail, vWPos.xz * 0.07).r * w.y + texture2D(uDetail, vWPos.zy * 0.07).r * w.x + texture2D(uDetail, vWPos.xy * 0.07).r * w.z;
          float mid = texture2D(uDetail, vWPos.xz * 0.009 + 0.37).r * w.y + texture2D(uDetail, vWPos.zy * 0.009).r * w.x + texture2D(uDetail, vWPos.xy * 0.009).r * w.z;
          float macro = texture2D(uDetail, vWPos.xz * 0.0011 + 0.71).r;
          // steep faces get stronger, streaky rock contrast
          float rockiness = 1.0 - n.y;
          float d = mix(0.82, 1.16, fine) * mix(0.86, 1.12, mid) * mix(0.9, 1.08, macro);
          d = mix(d, d * mix(0.75, 1.2, fine), rockiness);
          diffuseColor.rgb *= d;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-detail-v1';
}

let waterNormals: THREE.DataTexture | null = null;

/** Tileable wave normal map built from a sum of sines with integer frequencies. */
export function waterNormalTexture(): THREE.DataTexture {
  if (waterNormals) return waterNormals;
  const S = 256;
  const h = new Float32Array(S * S);
  const waves = [
    [3, 1, 1.0, 0.3],
    [1, 4, 0.8, 1.7],
    [5, -2, 0.5, 2.1],
    [-4, 7, 0.35, 0.9],
    [9, 5, 0.25, 4.0],
    [-11, 3, 0.18, 1.2],
    [13, -12, 0.12, 2.6],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [kx, ky, a, ph] of waves) v += a * Math.sin(((kx * x + ky * y) / S) * Math.PI * 2 + ph);
      h[y * S + x] = v;
    }
  }
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const n = new THREE.Vector3(-dx * 0.35, -dy * 0.35, 1).normalize();
      const i = (y * S + x) * 4;
      px[i] = (n.x * 0.5 + 0.5) * 255;
      px[i + 1] = (n.y * 0.5 + 0.5) * 255;
      px[i + 2] = (n.z * 0.5 + 0.5) * 255;
      px[i + 3] = 255;
    }
  }
  waterNormals = dataTexture(px, S, 4);
  return waterNormals;
}
