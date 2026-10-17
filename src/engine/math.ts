/**
 * Minimal column-major matrix helpers for the renderer. World positions are kept in float64 on the
 * CPU and turned into camera-relative float32 only when they go to the GPU (floating origin).
 */

export type Mat4 = Float32Array | Float64Array | number[];
export type Vec3 = [number, number, number];

export function mat4(): Float64Array {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out: Mat4): Mat4 {
  for (let i = 0; i < 16; i++) out[i] = i % 5 === 0 ? 1 : 0;
  return out;
}

export function copy(out: Mat4, a: ArrayLike<number>): Mat4 {
  for (let i = 0; i < 16; i++) out[i] = a[i];
  return out;
}

export function multiply(out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const r = tmp16;
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  for (let i = 0; i < 16; i++) out[i] = r[i];
  return out;
}
const tmp16 = new Float64Array(16);

export function invert(out: Mat4, m: ArrayLike<number>): Mat4 | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/** Rigid transform from a unit quaternion and a translation. */
export function fromRotationTranslation(out: Mat4, q: ArrayLike<number>, x: number, y: number, z: number): Mat4 {
  const [qx, qy, qz, qw] = [q[0], q[1], q[2], q[3]];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
  return out;
}

/** Frustum given by the tangents of its half angles (as WebXR views and desktop cameras both provide). */
export interface Fov {
  left: number;
  right: number;
  up: number;
  down: number;
}

export function fovFromVertical(fovYRad: number, aspect: number): Fov {
  const t = Math.tan(fovYRad / 2);
  return { left: t * aspect, right: t * aspect, up: t, down: t };
}

/**
 * Reversed-Z projection with the far plane at infinity: depth 1 at the near plane, 0 at infinity.
 * With clip-control (depth range 0…1) floating-point depth then has near-uniform relative precision
 * from the cockpit panel at 30 cm to mountains 100 km away. Without it, a conventional finite
 * projection is used (`far` matters only then).
 */
export function projection(out: Mat4, fov: Fov, near: number, far: number, reversed: boolean): Mat4 {
  const w = fov.left + fov.right;
  const h = fov.up + fov.down;
  identity(out);
  out[0] = 2 / w;
  out[5] = 2 / h;
  out[8] = (fov.right - fov.left) / w;
  out[9] = (fov.up - fov.down) / h;
  out[11] = -1;
  out[15] = 0;
  if (reversed) {
    out[10] = 0;
    out[14] = near;
  } else {
    out[10] = -(far + near) / (far - near);
    out[14] = (-2 * far * near) / (far - near);
  }
  return out;
}

/** Half-angle tangents from a WebXR (or any OpenGL-style) projection matrix. */
export function fovFromProjection(p: ArrayLike<number>): Fov {
  // x_ndc = (2n/(r-l)) x/(-z) + (r+l)/(r-l) → tangents l = (m8-1)/m0, r = (m8+1)/m0
  return {
    left: (1 - p[8]) / p[0],
    right: (1 + p[8]) / p[0],
    up: (1 + p[9]) / p[5],
    down: (1 - p[9]) / p[5],
  };
}

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

export function dot3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: ArrayLike<number>, b: ArrayLike<number>): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** View matrix looking from `eye` along `dir` (world-space, camera-relative). */
export function lookDir(out: Mat4, eye: ArrayLike<number>, dir: ArrayLike<number>, up: ArrayLike<number>): Mat4 {
  const f = normalize3([dir[0], dir[1], dir[2]]);
  let s = cross3(f, up);
  if (Math.hypot(s[0], s[1], s[2]) < 1e-6) s = cross3(f, [1, 0, 0]);
  normalize3(s);
  const u = cross3(s, f);
  out[0] = s[0];
  out[1] = u[0];
  out[2] = -f[0];
  out[3] = 0;
  out[4] = s[1];
  out[5] = u[1];
  out[6] = -f[1];
  out[7] = 0;
  out[8] = s[2];
  out[9] = u[2];
  out[10] = -f[2];
  out[11] = 0;
  out[12] = -dot3(s, eye);
  out[13] = -dot3(u, eye);
  out[14] = dot3(f, eye);
  out[15] = 1;
  return out;
}

export function ortho(out: Mat4, l: number, r: number, b: number, t: number, n: number, f: number, reversed: boolean): Mat4 {
  identity(out);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  if (reversed) {
    // depth 1 at near, 0 at far, range 0…1
    out[10] = 1 / (f - n);
    out[14] = f / (f - n);
  } else {
    out[10] = -2 / (f - n);
    out[14] = -(f + n) / (f - n);
  }
  return out;
}

export function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
