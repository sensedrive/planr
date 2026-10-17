/** Shader snippets shared by every pass. Registered as `#include <name>`. */

/** Frame uniforms (std140). Float offsets are mirrored in `FRAME` below. */
export const frame = /* glsl */ `
layout(std140) uniform Frame {
  mat4 u_viewProj[2];
  mat4 u_invViewProj[2];
  vec4 u_eye[2];        // eye position relative to the floating origin
  vec4 u_sunDir;        // direction towards the sun (or moon at night); w: disc brightness
  vec4 u_sunColor;      // rgb: light colour × intensity above the atmosphere; w: exposure
  vec4 u_ambient;       // rgb: night/airglow floor; w: time (s)
  vec4 u_origin;        // xyz: origin modulo 4096 m (world-locked patterns); w: origin height (m)
  vec4 u_weather;       // x: overcast 0…1, y: rain 0…1, z: visibility (m), w: cloud base (m)
  vec4 u_misc;          // x: night 0…1, y: cloud top (m), z: cloud coverage 0…1, w: wind phase
  mat4 u_shadowMat[3];
  vec4 u_cascade;       // xyz: cascade far distances; w: 1 / shadow map size
  vec4 u_viewport;      // width, height, 1/width, 1/height
  vec4 u_wind;          // xy: cloud drift (m), zw: water wave drift
  vec4 u_originAbs;     // floating origin in world metres (float32: fine for large-scale noise)
  vec4 u_viewOffset;    // xy: viewport origin of this view in the framebuffer (pixels)
  vec4 u_spotPos;       // landing light: xyz camera-relative, w: range (m)
  vec4 u_spotDir;       // xyz: direction, w: cos of the outer cone angle
  vec4 u_spotColor;     // rgb: intensity, w: cos of the inner cone angle
};

vec3 eyePos() { return u_eye[VIEW_ID].xyz; }
`;

export const FRAME = {
  viewProj: 0,
  invViewProj: 32,
  eye: 64,
  sunDir: 72,
  sunColor: 76,
  ambient: 80,
  origin: 84,
  weather: 88,
  misc: 92,
  shadowMat: 96,
  cascade: 144,
  viewport: 148,
  wind: 152,
  originAbs: 156,
  viewOffset: 160,
  spotPos: 164,
  spotDir: 168,
  spotColor: 172,
  size: 176,
};

/** Colour handling: filmic tonemapping (AgX) and output encoding. */
export const tonemap = /* glsl */ `
// AgX (Troy Sobotka), polynomial fit of the base contrast curve by Benjamin Wrensch
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 inset = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outset = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                           -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                           -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = inset * max(c, 0.0);
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
  c = agxContrast(c);
  // a touch of "punch": more saturation and contrast than the neutral base look
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = l + 1.12 * (c - l);
  c = outset * c;
  // the curve outputs display-encoded values close to sRGB already
  return clamp(pow(max(c, 0.0), vec3(2.2)), 0.0, 1.0);
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
/** Display colour from scene radiance (exposure already applied). */
vec3 displayColor(vec3 c) {
  return linearToSrgb(agx(c));
}
`;

/** Output of scene passes (needs <frame>). */
export const output = /* glsl */ `
#include <tonemap>
out vec4 fragColor;
/** Scene passes write pre-exposed HDR; in VR (no post pass) they tonemap right here. */
void writeColor(vec3 radiance, float alpha) {
  vec3 c = radiance * u_sunColor.w;
#ifdef INLINE_TONEMAP
  fragColor = vec4(displayColor(c), alpha);
#else
  fragColor = vec4(min(c, vec3(64000.0)), alpha);
#endif
}
`;

/** Hash and value noise, used for detail everywhere. */
export const noise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}
`;

/** Fullscreen triangle vertex shader: v_uv 0…1 and the NDC position. */
export const fullscreenVS = /* glsl */ `
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
