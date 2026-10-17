/** Generic lit/unlit mesh material (aircraft, cockpit, airfields, buildings, trees …). */
export const meshVS = /* glsl */ `
#include <frame>
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_color;
#ifdef INSTANCED
layout(location = 4) in vec4 a_i0;
layout(location = 5) in vec4 a_i1;
layout(location = 6) in vec4 a_i2;
layout(location = 7) in vec4 a_i3;
layout(location = 8) in vec3 a_extra;      // instance colour
#endif
uniform mat4 u_model;                      // relative to the floating origin
uniform mat3 u_normalMat;
uniform mat3 u_uvTransform;
uniform float u_pointSize;
uniform float u_pull;                      // < 1 pulls the vertex towards the eye (decals, lights)
uniform float u_foliage;                   // trees: rounded crown normals, wind sway, colour variation

out vec3 v_rel;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_color;
out float v_ao;
out vec3 v_obj;

void main() {
  mat4 model = u_model;
  mat3 nm = u_normalMat;
  v_color = a_color;
#ifdef INSTANCED
  mat4 inst = mat4(a_i0, a_i1, a_i2, a_i3);
  model = model * inst;
  nm = nm * mat3(inst);
  v_color.rgb *= a_extra;
#endif
  vec3 pos = a_position;
  vec3 nrm = a_normal;
  v_ao = 1.0;
  if (u_foliage > 0.5) {
    // crowns read as volumes, not facets: bend the normals outwards from the trunk axis
    vec3 radial = normalize(vec3(pos.x, 0.45 * length(pos.xz) + 0.35, pos.z));
    nrm = normalize(mix(nrm, radial, 0.75));
    // self-shadowing towards the trunk and the ground
    v_ao = clamp(0.45 + 0.55 * length(pos.xz) / 3.0, 0.45, 1.0) * clamp(0.55 + pos.y / 12.0, 0.55, 1.0);
#ifdef INSTANCED
    vec2 seed = a_i3.xz;
    float ph = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
    v_color.rgb *= 0.78 + 0.44 * ph;
    v_color.rgb *= mix(vec3(1.0), vec3(1.12, 1.05, 0.8), fract(ph * 7.31) * 0.6);
    // wind: the crown sways, the trunk stays put
    float sway = sin(u_ambient.w * (1.1 + ph * 0.6) + ph * 6.28) * 0.06 + sin(u_ambient.w * 3.7 + ph * 17.0) * 0.015;
    pos.xz += vec2(0.8, 0.6) * sway * max(pos.y - 2.0, 0.0) * 0.12 * max(pos.y - 2.0, 0.0) / 6.0;
#endif
  }
  v_obj = pos;
  vec4 rel = model * vec4(pos, 1.0);
  vec3 e = eyePos();
  rel.xyz = e + (rel.xyz - e) * u_pull;
  v_rel = rel.xyz;
  v_normal = normalize(nm * nrm);
  v_uv = (u_uvTransform * vec3(a_uv, 1.0)).xy;
  gl_Position = u_viewProj[VIEW_ID] * rel;
  gl_PointSize = u_pointSize;
}
`;

export const meshFS = /* glsl */ `
#include <frame>
#include <atmosphere-common>
#include <atmosphere-lookup>
#include <shadows>
#include <lighting>
#include <clouds>
#include <noise>
#include <output>

uniform sampler2D u_map;
uniform sampler2D u_emissiveMap;
uniform vec4 u_color;          // rgb (linear), a: opacity
uniform vec3 u_emissive;       // linear, HDR
uniform vec4 u_material;       // x: roughness, y: metalness, z: map present, w: alpha test
uniform float u_unlit;
uniform float u_flat;
uniform float u_doubleSided;
uniform float u_receiveShadow;
uniform float u_isPoint;
uniform float u_fogged;
uniform float u_interior;
uniform float u_foliage;

in vec3 v_rel;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_color;
in float v_ao;
in vec3 v_obj;

void main() {
  vec4 base = u_color * v_color;
  if (u_material.z > 0.5) base *= texture(u_map, v_uv);
  if (u_isPoint > 0.5) {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = dot(q, q);
    if (r > 1.0) discard;
    base.a *= exp(-r * 3.0);
  }
  if (base.a < u_material.w) discard;
  vec3 c;
  // unlit colours and emissive parts (lamps, displays, glowing signs) are display-referred: keep their
  // on-screen brightness independent of the eye's exposure, or night lights would blow out
  float displayScale = 0.6 / u_sunColor.w;
  if (u_unlit > 0.5) {
    c = (base.rgb + u_emissive) * displayScale;
  } else {
    vec3 n = normalize(v_normal);
    if (u_flat > 0.5) n = normalize(cross(dFdx(v_rel), dFdy(v_rel)));
    vec3 V = eyePos() - v_rel;
    if (u_doubleSided > 0.5 && dot(n, V) < 0.0) n = -n;
    float leafAO = 1.0;
    if (u_foliage > 0.5 && v_color.g > v_color.r) {
      // leaf clumps: lumpy normals and dark gaps between them, fading out with distance
      float fade = 1.0 - smoothstep(60.0, 400.0, length(V));
      vec2 q = vec2(v_obj.x + v_obj.y * 0.7, v_obj.z - v_obj.y * 0.5) * 1.6;
      float l0 = fbm2(q, 3);
      float lx = fbm2(q + vec2(0.15, 0.0), 3) - l0;
      float lz = fbm2(q + vec2(0.0, 0.15), 3) - l0;
      n = normalize(n + vec3(-lx, 0.0, -lz) * 9.0 * fade);
      leafAO = mix(1.0, 0.55 + 0.6 * l0, fade);
      base.rgb *= mix(1.0, 0.8 + 0.4 * l0, fade);
    }
    Surface s;
    s.albedo = base.rgb;
    s.normal = n;
    s.roughness = u_material.x;
    s.metalness = u_material.y;
    s.emissive = u_emissive * texture(u_emissiveMap, v_uv).rgb * displayScale;
    s.occlusion = v_ao * leafAO;
    s.sunVisibility = u_receiveShadow > 0.5 ? sunShadow(v_rel, n) : 1.0;
    float hM = u_origin.w + v_rel.y;
    c = shade(s, v_rel, hM);
    if (u_foliage > 0.5) {
      // leaves let light through: glow when backlit by the sun
      vec3 Vd = normalize(V);
      float back = pow(clamp(dot(-Vd, u_sunDir.xyz), 0.0, 1.0), 3.0);
      vec3 sunT = u_sunColor.rgb * transmittanceToSun(hM) * (1.0 - u_weather.x * 0.85);
      c += base.rgb * vec3(0.8, 1.0, 0.45) * sunT * back * s.sunVisibility * 0.1 * v_ao / PI;
    }
    if (u_interior > 0.5) {
      // cabin: light coming in through the glazing, bounced off seats, floor and glare shield
      vec3 skyIn = skyAmbient(vec3(0.0, 1.0, 0.0));
      vec3 sunIn = u_sunColor.rgb * transmittanceToSun(hM) * max(u_sunDir.y, 0.0) * (1.0 - u_weather.x * 0.85);
      vec3 fill = skyIn * 1.4 + sunIn * 0.3;
      c += base.rgb * (1.0 - s.metalness) * fill * (0.75 + 0.25 * (n.y * 0.5 + 0.5)) / PI;
    }
  }
  if (u_fogged > 0.5) c = applyClouds(applyAerial(c, v_rel), v_rel);
  writeColor(c, base.a);
}
`;

/** Depth-only pass for shadow maps (alpha-tested). */
export const meshShadowFS = /* glsl */ `
uniform sampler2D u_map;
uniform vec4 u_material;
uniform vec4 u_color;
in vec2 v_uv;
in vec4 v_color;
in vec3 v_rel;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  float a = u_color.a * v_color.a;
  if (u_material.z > 0.5) a *= texture(u_map, v_uv).a;
  if (a < max(u_material.w, 0.5)) discard;
  fragColor = vec4(0.0);
}
`;
