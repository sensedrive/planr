/** Sea surface: a camera-centred radial grid at sea level, waves from summed directional noise. */
export const waterVS = /* glsl */ `
#include <frame>
layout(location = 0) in vec2 a_position;    // metres around the camera
out vec3 v_rel;
void main() {
  vec3 e = eyePos();
  vec3 rel = vec3(a_position.x + e.x, -u_origin.w, a_position.y + e.z);
  v_rel = rel;
  gl_Position = u_viewProj[VIEW_ID] * vec4(rel, 1.0);
}
`;

export const waterFS = /* glsl */ `
#include <frame>
#include <atmosphere-common>
#include <atmosphere-lookup>
#include <noise>
#include <shadows>
#include <lighting>
#include <clouds>
#include <output>

uniform highp sampler2DArray u_height;
uniform highp sampler2DArray u_groundColor;
uniform vec2 u_lvlCorner[10];       // per clipmap level: grid origin relative to the floating origin
uniform ivec2 u_lvlTex[10];
uniform float u_lvlSpacing[10];
uniform int u_levels;
uniform vec3 u_waterColor;          // deep water tint (linear)
uniform float u_waves;              // sea state 0…1

in vec3 v_rel;

float th(int lvl, ivec2 g) {
  return texelFetch(u_height, ivec3((g + u_lvlTex[lvl]) & 255, lvl), 0).r;
}
/** Ground height under the water from the finest clipmap level that holds it. */
float groundHeight(vec2 rel) {
  for (int i = 0; i < 10; i++) {
    if (i >= u_levels) break;
    vec2 g = (rel - u_lvlCorner[i]) / u_lvlSpacing[i];
    if (all(greaterThan(g, vec2(1.0))) && all(lessThan(g, vec2(246.0)))) {
      ivec2 ig = ivec2(floor(g));
      vec2 f = fract(g);
      float a = th(i, ig), b = th(i, ig + ivec2(1, 0)), c = th(i, ig + ivec2(0, 1)), d = th(i, ig + ivec2(1, 1));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
  }
  return -50.0;
}

/** Ground colour (linear) from the finest clipmap level that holds the point. */
vec3 groundColor(vec2 rel) {
  for (int i = 0; i < 10; i++) {
    if (i >= u_levels) break;
    vec2 g = (rel - u_lvlCorner[i]) / u_lvlSpacing[i];
    if (all(greaterThan(g, vec2(1.0))) && all(lessThan(g, vec2(246.0)))) {
      vec3 c = texture(u_groundColor, vec3((g + vec2(u_lvlTex[i]) + 0.5) / 256.0, float(i))).rgb;
      return pow(c, vec3(2.2));
    }
  }
  return vec3(0.1);
}

/**
 * Reflection of the landscape: marches the reflected ray through the clipmap heightfield with growing
 * steps; returns the lit, hazed ground colour in rgb and coverage in a.
 */
vec4 terrainReflection(vec3 p0, vec3 R) {
#ifdef XR_QUALITY
  const int N = 12;
#else
  const int N = 26;
#endif
  float t = 3.0;
  float prevT = 0.0;
  for (int i = 0; i < N; i++) {
    vec3 p = p0 + R * t;
    float gh = groundHeight(p.xz) - u_origin.w;
    if (p.y < gh) {
      // refine between the last two samples
      float a = prevT, b = t;
      for (int k = 0; k < 5; k++) {
        float m = 0.5 * (a + b);
        vec3 q = p0 + R * m;
        if (q.y < groundHeight(q.xz) - u_origin.w) b = m; else a = m;
      }
      vec3 hit = p0 + R * b;
      vec3 alb = groundColor(hit.xz);
      // slopes seen in a reflection mostly face the viewer: light them like a steep, sky-lit wall
      vec3 sunL = u_sunColor.rgb * transmittanceToSun(hit.y + u_origin.w) * (1.0 - u_weather.x * 0.85);
      vec3 lit = alb * (sunL * max(u_sunDir.y, 0.0) * 0.3 + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.5) / PI;
      return vec4(applyAerial(lit, hit), 1.0);
    }
    prevT = t;
    t *= 1.4;
  }
  return vec4(0.0);
}

/** Wave slope: a few octaves of drifting noise in different directions. */
vec2 waveSlope(vec2 p, float fade) {
  vec2 s = vec2(0.0);
  float t = u_ambient.w;
  float amp = 1.0;
  float freq = 0.035;
  vec2 dir = vec2(1.0, 0.3);
#ifdef XR_QUALITY
  const int OCT = 4;
#else
  const int OCT = 6;
#endif
  for (int i = 0; i < OCT; i++) {
    vec2 q = p * freq + dir * t * freq * 6.0;
    float e = 0.15;
    float n0 = vnoise(q);
    s += vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e * amp * freq;
    freq *= 1.9;
    amp *= 0.55;
    dir = mat2(0.8, 0.6, -0.6, 0.8) * dir;
    if (float(i) > 5.0 * fade) break;
  }
  return s;
}

void main() {
  vec3 world = v_rel + u_origin.xyz;
  vec3 V = eyePos() - v_rel;
  float dist = length(V);
  V /= dist;
  float ground = groundHeight(v_rel.xz);
  float depth = max(-ground, 0.0);
  if (ground > 0.6) discard;

  float fade = 1.0 - smoothstep(200.0, 6000.0, dist);
  vec2 slope = waveSlope(world.xz, fade) * mix(0.25, 0.9, u_waves) * (0.3 + 0.7 * fade);
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  float NoV = max(dot(N, V), 0.02);

  // reflection: sky (plus sun glint through GGX with roughness growing in the distance)
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyRadiance(normalize(R));
  // the landscape mirrored in the water (calmer water reflects the ground sharper)
  vec3 Rg = normalize(reflect(-V, normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.5))));
  if (Rg.y > 0.0 && dist < 9000.0) {
    vec4 tr = terrainReflection(vec3(v_rel.x, -u_origin.w + 0.5, v_rel.z), Rg);
    refl = mix(refl, tr.rgb, tr.a);
  }
  float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  float rough = mix(0.08, 0.3, 1.0 - fade);
  vec3 L = u_sunDir.xyz;
  vec3 H = normalize(V + L);
  float a = rough * rough;
  float NoL = max(dot(N, L), 0.0);
  float sunVis = sunShadow(v_rel, vec3(0.0, 1.0, 0.0));
  vec3 sun = u_sunColor.rgb * transmittanceToSun(0.0) * sunVis * (1.0 - u_weather.x * 0.9);
  vec3 glint = sun * D_GGX(max(dot(N, H), 0.0), a) * V_SmithGGX(NoV, NoL, a) * fres * NoL;

  // body colour: light scattered back from inside, darkening with depth; shallow water shows the bed
  vec3 sky = skyAmbient(vec3(0.0, 1.0, 0.0));
  vec3 lightIn = sun * max(L.y, 0.0) + sky;
  vec3 deep = u_waterColor * lightIn * 0.06;
  vec3 shallow = vec3(0.32, 0.42, 0.30) * lightIn * 0.12;
  float clarity = exp(-depth * 0.18);
  vec3 body = mix(deep, shallow, clarity);
  // foam on the shore line and on crests
  float foam = (1.0 - smoothstep(0.0, 0.8, depth)) * (0.25 + 0.5 * u_waves) * (0.6 + 0.4 * vnoise(world.xz * 0.6 + u_ambient.w * 0.4));
  foam += smoothstep(0.55, 0.9, length(slope) * 3.0) * fade * u_waves * 0.5;
  vec3 c = mix(body, refl, fres) + glint;
  c = mix(c, lightIn * 0.25, clamp(foam, 0.0, 1.0) * 0.8);
  writeColor(applyClouds(applyAerial(c, v_rel), v_rel), 1.0);
}
`;
