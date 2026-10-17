/** Desktop post-processing: bloom (dual filter), tonemapping, grading and vision effects. */
export const downFS = /* glsl */ `
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_threshold;    // > 0 on the first pass: soft knee prefilter
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 t = u_texel;
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  c += texture(u_src, v_uv + vec2(-t.x, -t.y)).rgb;
  c += texture(u_src, v_uv + vec2(t.x, -t.y)).rgb;
  c += texture(u_src, v_uv + vec2(-t.x, t.y)).rgb;
  c += texture(u_src, v_uv + vec2(t.x, t.y)).rgb;
  c /= 8.0;
  if (u_threshold > 0.0) {
    float l = max(c.r, max(c.g, c.b));
    float k = clamp(l - u_threshold * 0.5, 0.0, u_threshold);
    k = k * k / (2.0 * u_threshold);
    c *= max(k, l - u_threshold) / max(l, 1e-4);
    c = min(c, vec3(200.0));
  }
  fragColor = vec4(c, 1.0);
}
`;

export const upFS = /* glsl */ `
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 t = u_texel;
  vec3 c = texture(u_src, v_uv + vec2(-t.x * 2.0, 0.0)).rgb;
  c += texture(u_src, v_uv + vec2(-t.x, t.y)).rgb * 2.0;
  c += texture(u_src, v_uv + vec2(0.0, t.y * 2.0)).rgb;
  c += texture(u_src, v_uv + vec2(t.x, t.y)).rgb * 2.0;
  c += texture(u_src, v_uv + vec2(t.x * 2.0, 0.0)).rgb;
  c += texture(u_src, v_uv + vec2(t.x, -t.y)).rgb * 2.0;
  c += texture(u_src, v_uv + vec2(0.0, -t.y * 2.0)).rgb;
  c += texture(u_src, v_uv + vec2(-t.x, -t.y)).rgb * 2.0;
  fragColor = vec4(c / 12.0, 1.0);
}
`;

export const compositeFS = /* glsl */ `
#include <tonemap>
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform vec4 u_vision;        // w: time (dither seed)
uniform float u_night;
in vec2 v_uv;
out vec4 fragColor;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  vec3 b = texture(u_bloom, v_uv).rgb;
  c = mix(c, b, u_bloomStrength);
  // night vision: rods take over, colours fade and shift blue (Purkinje)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float scotopic = u_night * (1.0 - smoothstep(0.02, 0.6, l));
  c = mix(c, vec3(l) * vec3(0.72, 0.85, 1.15), scotopic * 0.7);
  // lens vignetting
  vec2 q = v_uv - 0.5;
  float r2 = dot(q, q);
  c *= 1.0 - 0.22 * r2;
  vec3 d = displayColor(c);
  // dither against banding in the sky
  d += (h12(gl_FragCoord.xy + u_vision.w) - 0.5) / 255.0;
  fragColor = vec4(d, 1.0);
}
`;

/** Head-locked vision overlay drawn over the scene in every mode: comfort vignette and G effects. */
export const visionVS = /* glsl */ `
out vec2 v_ndc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  v_ndc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const visionFS = /* glsl */ `
uniform vec3 u_vision;        // x: comfort vignette, y: blackout, z: red-out
uniform vec2 u_scale;         // NDC → radius scale per axis (circular in the eye)
in vec2 v_ndc;
out vec4 fragColor;
void main() {
  float r = length(v_ndc * u_scale);
  float k = u_vision.x;
  float inner = mix(1.1, 0.42, k);
  float comfort = smoothstep(inner, inner + 0.35, r) * min(1.0, k * 1.6);
  float b = u_vision.y;
  float gi = mix(1.3, 0.05, b);
  float tunnel = max(smoothstep(gi, gi + 0.6, r) * min(1.0, b * 2.0), smoothstep(0.65, 1.0, b));
  float black = max(comfort, tunnel);
  float red = u_vision.z * 0.8;
  float a = 1.0 - (1.0 - black) * (1.0 - red);
  vec3 col = vec3(0.55, 0.02, 0.02) * red * (1.0 - black) / max(a, 1e-3);
#ifdef INLINE_TONEMAP
  fragColor = vec4(col, a);
#else
  fragColor = vec4(col * 0.2, a);
#endif
}
`;
