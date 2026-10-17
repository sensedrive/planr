/**
 * Physically based sky after Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering
 * Technique" (EGSR 2020): transmittance and multiple-scattering LUTs, a sky-view LUT around the
 * camera and an aerial-perspective volume. Distances inside the model are in kilometres.
 */

/** Medium description and LUT parameterisations, shared by the LUT passes and every scene shader. */
export const atmosphereCommon = /* glsl */ `
const float PI = 3.14159265358979;
const float RG = 6360.0;          // ground radius (km)
const float RT = 6460.0;          // top of the atmosphere (km)

uniform vec4 u_mie;               // x: mie scattering at sea level (1/km), y: haze scale height (km), z: extra fog (1/km), w: fog scale height (km)

const vec3 RAYLEIGH = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const vec3 OZONE = vec3(0.650e-3, 1.881e-3, 0.085e-3);

struct Medium { vec3 scatR; float scatM; vec3 extinction; };

Medium medium(float h) {
  Medium m;
  float hc = max(h, 0.0);
  float dR = exp(-hc / 8.0);
  float dM = exp(-hc / u_mie.y);
  float dF = exp(-hc / u_mie.w);
  float dO = max(0.0, 1.0 - abs(hc - 25.0) / 15.0);
  m.scatR = RAYLEIGH * dR;
  m.scatM = u_mie.x * dM + u_mie.z * dF;
  m.extinction = m.scatR + vec3(m.scatM * 1.11) + OZONE * dO;
  return m;
}

float rayleighPhase(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float miePhase(float c) {
  // Cornette-Shanks with a strong forward lobe: haze glows around the sun
  const float g = 0.8;
  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

/** Distance along a ray from radius r (direction cosine mu) to a sphere of radius R; -1 if missed. */
float raySphere(float r, float mu, float R) {
  float d = r * r * (mu * mu - 1.0) + R * R;
  if (d < 0.0) return -1.0;
  float s = sqrt(d);
  float t1 = -r * mu - s;
  float t2 = -r * mu + s;
  if (t1 > 0.0) return t1;
  return t2 > 0.0 ? t2 : -1.0;
}

// Bruneton's transmittance parameterisation
vec2 transmittanceUv(float r, float mu) {
  float H = sqrt(RT * RT - RG * RG);
  float rho = sqrt(max(r * r - RG * RG, 0.0));
  float d = max(0.0, -r * mu + sqrt(max(r * r * (mu * mu - 1.0) + RT * RT, 0.0)));
  float dMin = RT - r;
  float dMax = rho + H;
  return vec2((d - dMin) / (dMax - dMin), rho / H);
}
void transmittanceParams(vec2 uv, out float r, out float mu) {
  float H = sqrt(RT * RT - RG * RG);
  float rho = H * uv.y;
  r = sqrt(rho * rho + RG * RG);
  float dMin = RT - r;
  float dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
}

/** Sky-view / aerial-perspective direction parameterisation around the camera (radius r). */
vec2 skyUv(float r, float cosZenith, float cosSunAzimuth) {
  float vHorizon = sqrt(max(r * r - RG * RG, 0.0));
  float beta = acos(clamp(vHorizon / r, -1.0, 1.0));
  float zha = PI - beta;
  float za = acos(clamp(cosZenith, -1.0, 1.0));
  float v;
  if (za < zha) {
    float c = za / zha;
    v = (1.0 - sqrt(max(1.0 - c, 0.0))) * 0.5;
  } else {
    float c = (za - zha) / max(beta, 1e-4);
    v = sqrt(max(c, 0.0)) * 0.5 + 0.5;
  }
  float u = sqrt(clamp(-cosSunAzimuth * 0.5 + 0.5, 0.0, 1.0));
  return vec2(u, v);
}
void skyParams(vec2 uv, float r, out float cosZenith, out float cosSunAzimuth) {
  float vHorizon = sqrt(max(r * r - RG * RG, 0.0));
  float beta = acos(clamp(vHorizon / r, -1.0, 1.0));
  float zha = PI - beta;
  float za;
  if (uv.y < 0.5) {
    float c = 1.0 - 2.0 * uv.y;
    c = 1.0 - c * c;
    za = zha * c;
  } else {
    float c = uv.y * 2.0 - 1.0;
    za = zha + beta * c * c;
  }
  cosZenith = cos(za);
  float c = uv.x * uv.x;
  cosSunAzimuth = -(c * 2.0 - 1.0);
}
`;

/** Lookups of the finished LUTs from scene shaders (camera-centred, world units in metres). */
export const atmosphereLookup = /* glsl */ `
uniform sampler2D u_transmittanceLut;
uniform sampler2D u_skyViewLut;
uniform highp sampler3D u_aerialLut;

const float AERIAL_RANGE = 120000.0;     // metres covered by the aerial-perspective volume
const float AERIAL_SLICES = 24.0;

float cameraRadius() { return RG + max(u_origin.w + eyePos().y, 1.0) * 0.001; }

vec3 transmittanceToSun(float heightM) {
  float r = RG + max(heightM, 0.0) * 0.001;
  return texture(u_transmittanceLut, transmittanceUv(r, u_sunDir.y)).rgb;
}

/** Sun azimuth relative to a view direction, as the LUTs store it. */
float cosSunAzimuth(vec3 dir) {
  vec2 a = dir.xz;
  vec2 b = u_sunDir.xz;
  float la = length(a), lb = length(b);
  if (la < 1e-5 || lb < 1e-5) return 1.0;
  return dot(a, b) / (la * lb);
}

vec3 skyRadiance(vec3 dir) {
  vec2 uv = skyUv(cameraRadius(), dir.y, cosSunAzimuth(dir));
  return texture(u_skyViewLut, uv).rgb * u_sunColor.rgb;
}

/** Blurred sky radiance around a normal, used for ambient light. */
vec3 skyAmbient(vec3 n) {
  vec3 d = normalize(vec3(n.x, max(n.y, 0.0) + 0.25, n.z));
  vec2 uv = skyUv(cameraRadius(), d.y, cosSunAzimuth(d));
  vec3 sky = textureLod(u_skyViewLut, uv, 5.0).rgb * u_sunColor.rgb;
  return sky * PI + u_ambient.rgb;
}

/** In-scattered light (rgb) and transmittance (a) between the eye and a point at \`rel\` (metres). */
vec4 aerial(vec3 rel) {
  vec3 v = rel - eyePos();
  float d = length(v);
  vec3 dir = v / max(d, 1e-3);
  vec2 uv = skyUv(cameraRadius(), dir.y, cosSunAzimuth(dir));
  float w = sqrt(clamp(d / AERIAL_RANGE, 0.0, 1.0));
  // slice i holds distance (i / (n-1))² × range, sampled at its texel centre
  vec4 a = texture(u_aerialLut, vec3(uv, (w * (AERIAL_SLICES - 1.0) + 0.5) / AERIAL_SLICES));
  // the first slice starts at zero distance: fade in over the first few metres
  float near = clamp(d / 30.0, 0.0, 1.0);
  return vec4(a.rgb * u_sunColor.rgb * near, mix(1.0, a.a, near));
}

vec3 applyAerial(vec3 color, vec3 rel) {
  vec4 a = aerial(rel);
  return color * a.a + a.rgb;
}
`;

// ---- LUT passes -----------------------------------------------------------------------------------

const integrateCommon = /* glsl */ `
uniform sampler2D u_transmittance;
uniform sampler2D u_multiscatter;
uniform vec3 u_sun;               // direction towards the sun (only its height matters)
uniform vec4 u_cloud;             // x: cloud base (km), y: sun light below the clouds (0…1)

vec3 transmittanceAt(float r, float mu) {
  return texture(u_transmittance, transmittanceUv(r, mu)).rgb;
}

vec3 multiscatterAt(float r, float mu) {
  vec2 uv = vec2(mu * 0.5 + 0.5, (r - RG) / (RT - RG));
  return texture(u_multiscatter, uv).rgb;
}

/** Sunlight reaching a point: atmosphere transmittance, planet shadow and the cloud deck. */
vec3 sunLightAt(vec3 p, float r, vec3 sunDir) {
  vec3 up = p / r;
  float muS = dot(up, sunDir);
  vec3 t = transmittanceAt(r, muS);
  // planet shadow (soft at the terminator)
  float hor = -sqrt(max(1.0 - (RG / r) * (RG / r), 0.0));
  t *= smoothstep(hor - 0.01, hor + 0.01, muS);
  if (r - RG < u_cloud.x) t *= u_cloud.y;
  return t;
}

/**
 * Integrates in-scattering along a ray from \`start\` for distance \`tMax\` (km), returns luminance
 * for unit sun illuminance and the transmittance in \`trans\`.
 */
vec3 integrateLocal(vec3 start, vec3 dir, vec3 sunDir, float tMax, int steps, out vec3 trans) {
  float cosTheta = dot(dir, sunDir);
  float pR = rayleighPhase(cosTheta);
  float pM = miePhase(cosTheta);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float tPrev = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    // quadratic step distribution: dense near the eye
    float f = (float(i) + 0.3) / float(steps);
    float t = tMax * f * f;
    float dt = t - tPrev;
    tPrev = t;
    vec3 p = start + dir * t;
    float r = length(p);
    Medium m = medium(r - RG);
    vec3 sampleT = exp(-m.extinction * dt);
    vec3 sun = sunLightAt(p, r, sunDir);
    vec3 ms = multiscatterAt(r, dot(p / r, sunDir)) * u_cloud.y;
    vec3 S = (m.scatR * pR + m.scatM * pM) * sun + (m.scatR + m.scatM) * ms;
    // energy-conserving integration over the step
    vec3 Sint = (S - S * sampleT) / max(m.extinction, vec3(1e-7));
    L += T * Sint;
    T *= sampleT;
  }
  trans = T;
  return L;
}
`;

export const transmittanceFS = /* glsl */ `
#include <atmosphere-common>
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float r, mu;
  transmittanceParams(v_uv, r, mu);
  vec3 dir = vec3(sqrt(1.0 - mu * mu), mu, 0.0);
  float t = raySphere(r, mu, RT);
  vec3 depth = vec3(0.0);
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float s = t * (float(i) + 0.5) / float(N);
    vec3 p = vec3(0.0, r, 0.0) + dir * s;
    depth += medium(length(p) - RG).extinction * (t / float(N));
  }
  fragColor = vec4(exp(-depth), 1.0);
}
`;

/** Hillaire's multiple-scattering approximation: infinite orders from an isotropic second order. */
export const multiscatterFS = /* glsl */ `
#include <atmosphere-common>
uniform sampler2D u_transmittance;
uniform vec4 u_cloud;
in vec2 v_uv;
out vec4 fragColor;
vec3 transmittanceAt(float r, float mu) { return texture(u_transmittance, transmittanceUv(r, mu)).rgb; }
void main() {
  float muS = v_uv.x * 2.0 - 1.0;
  float r = RG + clamp(v_uv.y, 0.0, 1.0) * (RT - RG);
  vec3 sun = vec3(sqrt(max(1.0 - muS * muS, 0.0)), muS, 0.0);
  vec3 start = vec3(0.0, r, 0.0);
  const vec3 albedo = vec3(0.3);
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  const int DIRS = 64;
  for (int k = 0; k < DIRS; k++) {
    // golden-spiral directions on the sphere
    float z = 1.0 - 2.0 * (float(k) + 0.5) / float(DIRS);
    float a = float(k) * 2.39996;
    float s = sqrt(1.0 - z * z);
    vec3 dir = vec3(s * cos(a), z, s * sin(a));
    float mu = dir.y;
    float tG = raySphere(r, mu, RG);
    float tT = raySphere(r, mu, RT);
    float tMax = tG > 0.0 ? tG : tT;
    vec3 T = vec3(1.0), L = vec3(0.0), f = vec3(0.0);
    const int N = 20;
    float dt = tMax / float(N);
    for (int i = 0; i < N; i++) {
      vec3 p = start + dir * (float(i) + 0.5) * dt;
      float rp = length(p);
      Medium m = medium(rp - RG);
      vec3 st = exp(-m.extinction * dt);
      vec3 scat = m.scatR + m.scatM;
      vec3 sunT = transmittanceAt(rp, dot(p / rp, sun));
      if (rp - RG < u_cloud.x) sunT *= u_cloud.y;
      vec3 S = scat * sunT / (4.0 * PI);
      L += T * (S - S * st) / max(m.extinction, vec3(1e-7));
      f += T * (scat - scat * st) / max(m.extinction, vec3(1e-7));
      T *= st;
    }
    if (tG > 0.0) {
      vec3 p = start + dir * tG;
      vec3 n = normalize(p);
      L += T * transmittanceAt(RG, dot(n, sun)) * max(dot(n, sun), 0.0) * albedo / PI * u_cloud.y;
    }
    L2 += L / float(DIRS);
    fms += f / float(DIRS);
  }
  vec3 psi = L2 / (1.0 - fms);
  fragColor = vec4(psi, 1.0);
}
`;

export const skyViewFS = /* glsl */ `
#include <atmosphere-common>
${integrateCommon}
uniform float u_radius;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float cz, csa;
  skyParams(v_uv, u_radius, cz, csa);
  float sz = sqrt(max(1.0 - cz * cz, 0.0));
  // view direction in a frame where the sun lies in the x/y plane
  float ssa = sqrt(max(1.0 - csa * csa, 0.0));
  vec3 dir = vec3(sz * csa, cz, sz * ssa);
  vec3 sun = vec3(sqrt(max(1.0 - u_sun.y * u_sun.y, 0.0)), u_sun.y, 0.0);
  vec3 start = vec3(0.0, u_radius, 0.0);
  float tG = raySphere(u_radius, cz, RG);
  float tT = raySphere(u_radius, cz, RT);
  float tMax = tG > 0.0 ? tG : tT;
  vec3 T;
  vec3 L = integrateLocal(start, dir, sun, tMax, 30, T);
  fragColor = vec4(L, 1.0);
}
`;

export const aerialFS = /* glsl */ `
#include <atmosphere-common>
${integrateCommon}
uniform float u_radius;
uniform float u_slice;            // 0…1 (texture w coordinate of this layer)
uniform float u_range;            // km
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float cz, csa;
  skyParams(v_uv, u_radius, cz, csa);
  float sz = sqrt(max(1.0 - cz * cz, 0.0));
  float ssa = sqrt(max(1.0 - csa * csa, 0.0));
  vec3 dir = vec3(sz * csa, cz, sz * ssa);
  vec3 sun = vec3(sqrt(max(1.0 - u_sun.y * u_sun.y, 0.0)), u_sun.y, 0.0);
  vec3 start = vec3(0.0, u_radius, 0.0);
  float d = u_slice * u_slice * u_range;
  float tG = raySphere(u_radius, cz, RG);
  if (tG > 0.0) d = min(d, tG);
  vec3 T;
  int steps = int(clamp(4.0 + u_slice * 24.0, 4.0, 28.0));
  vec3 L = integrateLocal(start, dir, sun, d, steps, T);
  fragColor = vec4(L, dot(T, vec3(1.0 / 3.0)));
}
`;
