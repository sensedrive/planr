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

out vec3 v_rel;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_color;

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
  vec4 rel = model * vec4(a_position, 1.0);
  vec3 e = eyePos();
  rel.xyz = e + (rel.xyz - e) * u_pull;
  v_rel = rel.xyz;
  v_normal = normalize(nm * a_normal);
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
#include <output>

uniform sampler2D u_map;
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

in vec3 v_rel;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_color;

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
  if (u_unlit > 0.5) {
    c = base.rgb + u_emissive;
  } else {
    vec3 n = normalize(v_normal);
    if (u_flat > 0.5) n = normalize(cross(dFdx(v_rel), dFdy(v_rel)));
    vec3 V = eyePos() - v_rel;
    if (u_doubleSided > 0.5 && dot(n, V) < 0.0) n = -n;
    Surface s;
    s.albedo = base.rgb;
    s.normal = n;
    s.roughness = u_material.x;
    s.metalness = u_material.y;
    s.emissive = u_emissive;
    s.occlusion = 1.0;
    s.sunVisibility = u_receiveShadow > 0.5 ? sunShadow(v_rel, n) : 1.0;
    float hM = u_origin.w + v_rel.y;
    c = shade(s, v_rel, hM);
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
