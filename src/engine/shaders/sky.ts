export const skyVS = /* glsl */ `
#include <frame>
out vec2 v_ndc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  v_ndc = p;
#ifdef REVERSED_Z
  gl_Position = vec4(p, 0.0, 1.0);
#else
  gl_Position = vec4(p, 1.0, 1.0);
#endif
}
`;

export const skyFS = /* glsl */ `
#include <frame>
#include <atmosphere-common>
#include <atmosphere-lookup>
#include <noise>
#include <output>
in vec2 v_ndc;

vec3 viewDir() {
  vec4 p = u_invViewProj[VIEW_ID] * vec4(v_ndc, 0.5, 1.0);
  return normalize(p.xyz / p.w - eyePos());
}

void main() {
  vec3 d = viewDir();
  vec3 c = skyRadiance(d);
  float night = u_misc.x;
  float mu = dot(d, u_sunDir.xyz);
  // sun (or moon) disc: 0.27° radius, limb darkened; seen through the atmosphere
  float cosR = night > 0.5 ? 0.99996 : 0.999989;
  if (mu > cosR && d.y > -0.02) {
    float r = sqrt(max(1.0 - mu * mu, 0.0)) / sqrt(1.0 - cosR * cosR);
    vec3 trans = transmittanceToSun(u_origin.w + eyePos().y);
    if (night > 0.5) {
      // the moon: grey with maria
      vec3 t = cross(u_sunDir.xyz, vec3(0.0, 1.0, 0.0));
      vec2 q = vec2(dot(d - u_sunDir.xyz * mu, normalize(t)), d.y) * 2600.0;
      float maria = fbm2(q * 0.5 + 3.0, 3);
      c += vec3(0.75, 0.78, 0.82) * (0.6 + 0.4 * smoothstep(0.35, 0.7, maria)) * u_sunColor.rgb * trans * 900.0 * (1.0 - u_weather.x);
    } else {
      float limb = 1.0 - 0.6 * (1.0 - sqrt(max(1.0 - r * r, 0.0)));
      c += u_sunColor.rgb * trans * limb * 60000.0 * u_sunDir.w * (1.0 - u_weather.x);
    }
  }
  // stars: a hashed grid on the sphere, twinkling slightly, fading with the sky brightness
  if (night > 0.0 && d.y > 0.0) {
    vec3 cell = floor(d * 420.0);
    float hsh = hash13(cell);
    if (hsh > 0.9965) {
      vec3 center = (cell + 0.5) / 420.0;
      float s = smoothstep(0.0022, 0.0, length(d - normalize(center)));
      float tw = 0.75 + 0.25 * sin(u_ambient.w * (3.0 + hsh * 7.0) + hsh * 40.0);
      vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), fract(hsh * 97.0));
      c += tint * s * tw * night * 0.12 * smoothstep(0.0, 0.25, d.y) * (1.0 - u_weather.x) / max(u_sunColor.w, 1e-3);
    }
    // milky way band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, -0.78))) * 4.0, 2.0));
    c += vec3(0.55, 0.6, 0.75) * band * fbm2(d.xz * 9.0 + d.y * 3.0, 4) * night * 0.004 * (1.0 - u_weather.x) / max(u_sunColor.w, 1e-3);
  }
  writeColor(c, 1.0);
}
`;
