/**
 * Volumetric clouds: a slab between cloud base and top, ray-marched at reduced resolution into
 * in-scattered light (rgb), transmittance (a) and the distance to the cloud front (second target).
 * Scene shaders composite them per pixel, so nothing needs the scene depth.
 */

/** Tileable 3D noise, generated on the GPU slice by slice. */
export const noiseGenFS = /* glsl */ `
uniform float u_slice;          // 0…1
uniform float u_size;
uniform int u_kind;             // 0: shape (Perlin-Worley), 1: detail (Worley fBm)
in vec2 v_uv;
out vec4 fragColor;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
/** Worley noise with period \`period\` cells: 1 at feature points, 0 far away. */
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(x, y, z);
        vec3 c = mod(id + o, period);
        vec3 r = o + hash33(c) - f;
        d = min(d, dot(r, r));
      }
  return 1.0 - sqrt(d);
}
vec3 grad(vec3 c) { return normalize(hash33(c) * 2.0 - 1.0); }
float perlin(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(mod(i, period)), f);
  float n100 = dot(grad(mod(i + vec3(1, 0, 0), period)), f - vec3(1, 0, 0));
  float n010 = dot(grad(mod(i + vec3(0, 1, 0), period)), f - vec3(0, 1, 0));
  float n110 = dot(grad(mod(i + vec3(1, 1, 0), period)), f - vec3(1, 1, 0));
  float n001 = dot(grad(mod(i + vec3(0, 0, 1), period)), f - vec3(0, 0, 1));
  float n101 = dot(grad(mod(i + vec3(1, 0, 1), period)), f - vec3(1, 0, 1));
  float n011 = dot(grad(mod(i + vec3(0, 1, 1), period)), f - vec3(0, 1, 1));
  float n111 = dot(grad(mod(i + vec3(1, 1, 1), period)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

void main() {
  vec3 p = vec3(v_uv, u_slice);
  if (u_kind == 0) {
    float pf = 0.0, amp = 1.0, norm = 0.0;
    for (int o = 0; o < 4; o++) {
      float fr = 4.0 * pow(2.0, float(o));
      pf += perlin(p * fr, fr) * amp;
      norm += amp;
      amp *= 0.5;
    }
    pf = pf / norm * 0.5 + 0.5;
    float w1 = worley(p * 4.0, 4.0);
    float w2 = worley(p * 8.0, 8.0);
    float w3 = worley(p * 16.0, 16.0);
    float wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
    float pw = remap(pf, wf - 1.0, 1.0, 0.0, 1.0);
    fragColor = vec4(clamp(pw, 0.0, 1.0), wf, 0.0, 1.0);
  } else {
    float w1 = worley(p * 4.0, 4.0);
    float w2 = worley(p * 8.0, 8.0);
    float w3 = worley(p * 16.0, 16.0);
    fragColor = vec4(w1 * 0.625 + w2 * 0.25 + w3 * 0.125, 0.0, 0.0, 1.0);
  }
}
`;

export const cloudVS = /* glsl */ `
#include <frame>
out vec2 v_ndc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  v_ndc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

/** Cloud density field shared by the march, the shadow map and nothing else. */
export const cloudDensity = /* glsl */ `
uniform highp sampler3D u_shape;
uniform highp sampler3D u_detail;
uniform vec4 u_cloudParams;     // x: base (m), y: top (m), z: coverage, w: density

const float SHAPE_SCALE = 1.0 / 4200.0;
const float DETAIL_SCALE = 1.0 / 900.0;

float heightFraction(float y) { return clamp((y - u_cloudParams.x) / (u_cloudParams.y - u_cloudParams.x), 0.0, 1.0); }

/** Coverage of the sky above a point: large-scale weather pattern. */
float weatherMap(vec2 p) {
  float w = fbm2(p * 0.00006 + 13.7, 4);
  float cov = u_cloudParams.z;
  return clamp((w - (1.0 - cov) * 0.75 - 0.08) / 0.35 + cov * cov * 0.6, 0.0, 1.0);
}

float density(vec3 wp, float h, bool cheap) {
  float cov = weatherMap(wp.xz);
  if (cov <= 0.01) return 0.0;
  // cumulus profile: rounded base, anvil-free top that thins out
  // per-cloud height: towers where the weather map is dense, flat puffs elsewhere
  float topH = mix(0.45, 1.0, smoothstep(0.35, 0.95, cov));
  float profile = smoothstep(0.0, 0.06, h) * smoothstep(topH, topH * (0.5 - 0.2 * u_weather.x), h);
  vec3 drift = vec3(u_wind.x, 0.0, u_wind.y);
  vec3 sp = (wp + drift) * SHAPE_SCALE;
  vec4 s = texture(u_shape, sp);
  float base = s.r * (0.65 + 0.35 * s.g);
  float shape = clamp((base - (1.0 - cov * profile)) / max(cov * profile, 0.05), 0.0, 1.0) * profile;
  if (shape <= 0.0 || cheap) return shape * u_cloudParams.w;
  // erode the edges with high-frequency detail, wispy at the bottom, billowy at the top
  float d = texture(u_detail, (wp + drift * 1.6) * DETAIL_SCALE + vec3(0.0, u_ambient.w * 0.002, 0.0)).r;
  float detail = mix(d, 1.0 - d, clamp(h * 4.0, 0.0, 1.0));
  float er = 0.45 * (1.0 - shape);
  shape = clamp((shape - detail * er) / (1.0 - detail * er + 1e-3), 0.0, 1.0);
  return shape * u_cloudParams.w;
}


`;

export const cloudFS = /* glsl */ `
#include <frame>
#include <atmosphere-common>
#include <atmosphere-lookup>
#include <noise>
#include <cloud-density>
uniform vec4 u_cloudSteps;      // x: primary steps, y: light steps, z: max distance (m), w: frame index
in vec2 v_ndc;
layout(location = 0) out vec4 outLight;
layout(location = 1) out vec4 outDepth;

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

/** Slab entry/exit along a ray (y up, flat earth is fine at cloud distances). */
vec2 slab(vec3 o, vec3 d) {
  float b = u_cloudParams.x, t = u_cloudParams.y;
  if (abs(d.y) < 1e-4) return (o.y > b && o.y < t) ? vec2(0.0, u_cloudSteps.z) : vec2(-1.0);
  float t0 = (b - o.y) / d.y;
  float t1 = (t - o.y) / d.y;
  float tn = max(min(t0, t1), 0.0);
  float tf = max(t0, t1);
  if (tf <= 0.0) return vec2(-1.0);
  return vec2(tn, min(tf, u_cloudSteps.z));
}

void main() {
  vec4 p = u_invViewProj[VIEW_ID] * vec4(v_ndc, 0.5, 1.0);
  vec3 eye = eyePos();
  vec3 dir = normalize(p.xyz / p.w - eye);
  // clouds live in absolute world coordinates (float32 is precise enough at cloud scales)
  vec3 o = eye + u_originAbs.xyz;
  vec2 seg = slab(o, dir);
  outDepth = vec4(1e5, 0.0, 0.0, 1.0);
  if (seg.x < 0.0 || seg.y <= seg.x) {
    outLight = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  int steps = int(u_cloudSteps.x);
  float len = seg.y - seg.x;
  // interleaved-gradient jitter against banding
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + u_cloudSteps.w * 0.618));
  float cosT = dot(dir, u_sunDir.xyz);
  float phase = mix(hg(cosT, 0.65), hg(cosT, -0.2), 0.35);
  vec3 sunCol = u_sunColor.rgb * transmittanceToSun(u_cloudParams.y) ;
  vec3 ambTop = skyAmbient(vec3(0.0, 1.0, 0.0)) / PI;
  vec3 ambBottom = skyAmbient(vec3(0.0, -1.0, 0.0)) / PI * 0.45 + sunCol * max(u_sunDir.y, 0.0) * 0.02;
  float T = 1.0;
  vec3 L = vec3(0.0);
  float front = -1.0;
  // samples spread quadratically along the segment: fine near the entry, coarse far away, so
  // grazing rays through 40 km of layer neither band nor waste steps on the distance
  float fs = float(steps);
  for (int i = 0; i < 128; i++) {
    if (i >= steps || T < 0.015) break;
    float u0 = (float(i) + jitter) / fs;
    float t = seg.x + len * u0 * u0;
    float dt = len * (2.0 * u0 + 1.0 / fs) / fs;
    vec3 wp = o + dir * t;
    float h = heightFraction(wp.y);
    float sigma = density(wp, h, false) * 0.045;
    if (sigma > 0.0) {
      if (front < 0.0) front = t;
      // light march towards the sun, growing steps
      float od = 0.0;
      float ls = (u_cloudParams.y - u_cloudParams.x) * 0.1;
      for (int k = 0; k < 6; k++) {
        if (k >= int(u_cloudSteps.y)) break;
        float w = 1.0 + float(k) * 0.8;
        vec3 lp = wp + u_sunDir.xyz * ls * (float(k) + 0.5) * w;
        od += density(lp, heightFraction(lp.y), k > 1) * 0.045 * ls * w;
      }
      // multiple scattering after Wrenninge: a few octaves with attenuated extinction
      vec3 S = vec3(0.0);
      float a = 1.0, b = 1.0, c = 1.0;
      for (int m = 0; m < 3; m++) {
        S += a * exp(-od * b) * mix(hg(cosT * c, 0.7 * c), hg(cosT, -0.25), 0.3) * sunCol;
        a *= 0.55; b *= 0.4; c *= 0.6;
      }
      // powder: dark crevices on the sunny side of dense clouds
      float powder = 1.0 - exp(-sigma * 50.0);
      S *= mix(1.0, powder * 1.7 + 0.15, 0.55 * (1.0 - max(cosT, 0.0)));
      // ambient: open sky above, darker in the cloud's belly
      vec3 amb = mix(ambBottom, ambTop, smoothstep(0.0, 0.85, h)) * (0.55 + 0.45 * h);
      S += amb * (1.0 - u_weather.x * 0.3);
      S *= sigma;
      float st = exp(-sigma * dt);
      L += T * (S - S * st) / max(sigma, 1e-6);
      T *= st;
    }
  }
  if (front > 0.0) {
    // haze between us and the cloud
    vec4 ap = aerial(eye + dir * min(front, 100000.0));
    L = L * ap.a + ap.rgb * (1.0 - T);
    outDepth = vec4(front, 0.0, 0.0, 1.0);
  }
  outLight = vec4(L, T);
}
`;

/** Lookup used by scene shaders. */
export const cloudLookup = /* glsl */ `
uniform highp sampler2DArray u_cloudLight;
uniform highp sampler2DArray u_cloudDepth;
uniform float u_cloudsOn;
vec3 applyClouds(vec3 c, vec3 rel) {
  if (u_cloudsOn < 0.5) return c;
  vec2 uv = (gl_FragCoord.xy - u_viewOffset.xy) * u_viewport.zw;
  vec4 cl = texture(u_cloudLight, vec3(uv, float(VIEW_ID)));
  float front = texture(u_cloudDepth, vec3(uv, float(VIEW_ID))).r;
  float d = length(rel - eyePos());
  // fade in over the cloud's front zone, so terrain inside a cloud fogs over gradually
  float k = smoothstep(front, front + 400.0, d);
  return mix(c, c * cl.a + cl.rgb, k);
}
`;

/** Transmittance of the cloud layer towards the sun, on a world-aligned grid at cloud-base height. */
export const cloudShadowFS = /* glsl */ `
#include <frame>
#include <noise>
#include <cloud-density>
uniform vec4 u_rect;            // xy: centre (world m), z: extent (m)
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec3 L = u_sunDir.xyz;
  if (L.y < 0.03) { fragColor = vec4(1.0); return; }
  vec3 q = vec3(u_rect.xy + (v_uv - 0.5) * u_rect.z, u_cloudParams.x).xzy;
  float len = (u_cloudParams.y - u_cloudParams.x) / L.y;
  float od = 0.0;
  const int N = 8;
  for (int i = 0; i < N; i++) {
    vec3 p = q + L * len * (float(i) + 0.5) / float(N);
    od += density(p, heightFraction(p.y), true) * 0.045 * len / float(N);
  }
  fragColor = vec4(exp(-od * 0.8), 0.0, 0.0, 1.0);
}
`;

/** Scene lookup of the cloud shadow (inside <shadows>). */
export const cloudShadowLookup = /* glsl */ `
uniform sampler2D u_cloudShadow;
uniform vec4 u_cloudShadowRect;  // xy: centre (world m), z: extent (m), w: on
uniform vec2 u_cloudSlab;        // base, top (m)
float cloudShadow(vec3 rel) {
  if (u_cloudShadowRect.w < 0.5) return 1.0;
  vec3 p = rel + u_originAbs.xyz;
  if (p.y > u_cloudSlab.y) return 1.0;
  vec3 L = u_sunDir.xyz;
  if (L.y < 0.03) return 1.0;
  vec2 q = p.xz + L.xz / L.y * (u_cloudSlab.x - p.y);
  vec2 uv = (q - u_cloudShadowRect.xy) / u_cloudShadowRect.z + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float t = texture(u_cloudShadow, uv).r;
  // inside the layer only part of the column lies above
  float inside = clamp((p.y - u_cloudSlab.x) / (u_cloudSlab.y - u_cloudSlab.x), 0.0, 1.0);
  return mix(t, 1.0, inside);
}
`;
