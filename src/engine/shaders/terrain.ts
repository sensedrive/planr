/**
 * Geometry-clipmap terrain: nested square grids around the camera, each level twice as coarse as
 * the previous one. Heights and colours live in toroidally addressed texture arrays (one layer per
 * level) that the CPU updates strip by strip as the camera moves.
 */
export const terrainVS = /* glsl */ `
#include <frame>
layout(location = 0) in vec2 a_position;   // grid vertex 0…CELLS

uniform highp sampler2DArray u_height;
uniform float u_level;
uniform float u_spacing;
uniform vec2 u_cornerRel;      // level grid origin relative to the floating origin (m)
uniform ivec2 u_texOffset;     // toroidal texel of grid vertex (0, 0)
uniform vec2 u_camGrid;        // camera position in this level's grid units (relative to the corner)
uniform float u_cells;

out vec3 v_rel;
out vec3 v_normal;
out vec2 v_grid;               // grid position (for colour lookups)
out float v_morph;
out float v_height;

float h(ivec2 g) {
  return texelFetch(u_height, ivec3((g + u_texOffset) & 255, int(u_level)), 0).r;
}

void main() {
  ivec2 g = ivec2(a_position);
  vec2 gp = a_position;
  // geomorph towards the next coarser level near the outer edge, so the rings meet without cracks
  vec2 dc = abs(gp - u_camGrid) / (u_cells * 0.5);
  float m = clamp((max(dc.x, dc.y) - 0.62) / 0.3, 0.0, 1.0);
  if (g.x == 0 || g.y == 0 || g.x == int(u_cells) || g.y == int(u_cells)) m = 1.0;
  float h0 = h(g);
  bool ox = (g.x & 1) == 1;
  bool oz = (g.y & 1) == 1;
  float hc = h0;
  if (ox && oz) hc = 0.5 * (h(g + ivec2(-1, -1)) + h(g + ivec2(1, 1)));
  else if (ox) hc = 0.5 * (h(g + ivec2(-1, 0)) + h(g + ivec2(1, 0)));
  else if (oz) hc = 0.5 * (h(g + ivec2(0, -1)) + h(g + ivec2(0, 1)));
  float y = mix(h0, hc, m);

  float s = u_spacing;
  vec3 nf = normalize(vec3(h(g + ivec2(-1, 0)) - h(g + ivec2(1, 0)), 2.0 * s, h(g + ivec2(0, -1)) - h(g + ivec2(0, 1))));
  ivec2 ge = g & ~1;
  vec3 nc = normalize(vec3(h(ge + ivec2(-2, 0)) - h(ge + ivec2(2, 0)), 4.0 * s, h(ge + ivec2(0, -2)) - h(ge + ivec2(0, 2))));
  v_normal = normalize(mix(nf, nc, m));
  vec3 rel = vec3(u_cornerRel.x + gp.x * s, y - u_origin.w, u_cornerRel.y + gp.y * s);
  v_rel = rel;
  v_grid = gp;
  v_morph = m;
  v_height = y;
  gl_Position = u_viewProj[VIEW_ID] * vec4(rel, 1.0);
}
`;

export const terrainFS = /* glsl */ `
#include <frame>
#include <atmosphere-common>
#include <atmosphere-lookup>
#include <noise>
#include <shadows>
#include <lighting>
#include <output>

uniform highp sampler2DArray u_color;
uniform float u_level;
uniform float u_spacing;
uniform ivec2 u_texOffset;
uniform vec2 u_coarseOffset;   // coarse texel = u_coarseOffset + grid / 2

in vec3 v_rel;
in vec3 v_normal;
in vec2 v_grid;
in float v_morph;
in float v_height;

vec3 levelColor(vec2 texel, float layer) {
  return texture(u_color, vec3((texel + 0.5) / 256.0, layer)).rgb;
}

void main() {
  vec3 world = v_rel + u_origin.xyz;   // world position modulo 4096 m (for detail patterns)
  float dist = length(v_rel - eyePos());
  vec3 albedo = levelColor(v_grid + vec2(u_texOffset), u_level);
  if (v_morph > 0.0) albedo = mix(albedo, levelColor(u_coarseOffset + v_grid * 0.5, u_level + 1.0), v_morph);
  albedo = pow(albedo, vec3(2.2));

  vec3 n = normalize(v_normal);
  // detail: small-scale relief and colour breakup, fading with distance
  float near = 1.0 - smoothstep(80.0, 2500.0, dist);
  if (near > 0.0) {
    vec2 p = world.xz;
    float d1 = fbm2(p * 0.035, 4);
    float d2 = fbm2(p * 0.31 + 7.0, 3);
    albedo *= mix(1.0, 0.86 + 0.24 * d1 + 0.12 * (d2 - 0.5), near);
    float e = 0.6;
    vec2 q = p * 0.05;
    float h0 = fbm2(q, 3);
    float nx = fbm2(q + vec2(e * 0.05, 0.0), 3) - h0;
    float nz = fbm2(q + vec2(0.0, e * 0.05), 3) - h0;
    n = normalize(n + vec3(-nx, 0.0, -nz) * 2.0 * near);
  }
  // wet sand and muddy shore just above the water line
  float shore = 1.0 - smoothstep(0.2, 2.5, v_height);
  albedo = mix(albedo, albedo * 0.6, shore * 0.6);

  Surface s;
  s.albedo = albedo;
  s.normal = n;
  s.roughness = mix(0.92, 0.55, shore);
  s.metalness = 0.0;
  s.emissive = vec3(0.0);
  s.occlusion = 1.0;
  s.sunVisibility = sunShadow(v_rel, v_normal);
  vec3 c = shade(s, v_rel, v_height);
  writeColor(applyAerial(c, v_rel), 1.0);
}
`;

/** Depth-only variant for the shadow maps. */
export const terrainShadowFS = /* glsl */ `
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`;
