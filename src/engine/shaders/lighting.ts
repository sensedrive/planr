/**
 * Surface lighting shared by all lit materials: GGX specular + Lambert diffuse under the sun (with
 * atmospheric transmittance and cascaded shadows), sky ambient from the sky-view LUT, then aerial
 * perspective. Positions are camera-relative metres.
 */
export const shadows = /* glsl */ `
uniform highp sampler2DArrayShadow u_shadowMap;
uniform highp sampler2DShadow u_terrainShadow;
uniform mat4 u_terrainShadowMat;
uniform float u_shadowsOn;
uniform float u_debugShadow;

float pcf(vec3 c, float layer, float r) {
  float t = u_cascade.w * r;
  float s = 0.0;
  s += texture(u_shadowMap, vec4(c.xy + vec2(-0.5, -0.5) * t, layer, c.z));
  s += texture(u_shadowMap, vec4(c.xy + vec2(0.5, -0.5) * t, layer, c.z));
  s += texture(u_shadowMap, vec4(c.xy + vec2(-0.5, 0.5) * t, layer, c.z));
  s += texture(u_shadowMap, vec4(c.xy + vec2(0.5, 0.5) * t, layer, c.z));
  return s * 0.25;
}

/** Sun visibility for a camera-relative position (1 = lit). */
float sunShadow(vec3 rel, vec3 n) {
  if (u_shadowsOn < 0.5) return 1.0;
  float d = length(rel - eyePos());
  float vis = 1.0;
  // terrain-scale shadow map: mountains shading valleys and airfields. Its coarse terrain lies above
  // the fine one in hollows, so only occluders well above (towards the sun) count.
  vec4 tp = u_terrainShadowMat * vec4(rel + u_sunDir.xyz * 45.0 + n * 4.0, 1.0);
  if (u_debugShadow != 1.0 && all(lessThan(abs(tp.xy - 0.5), vec2(0.5)))) vis = texture(u_terrainShadow, tp.xyz);
  if (u_debugShadow == 2.0) return vis;
  for (int i = 0; i < 3; i++) {
    if (d < u_cascade[i]) {
      float bias = 0.02 * float(i + 1);
      vec4 c = u_shadowMat[i] * vec4(rel + n * bias, 1.0);
      if (all(lessThan(abs(c.xy - 0.5), vec2(0.499)))) {
        float s = pcf(c.xyz, float(i), 1.5);
        // fade the last cascade out
        float fade = i == 2 ? smoothstep(u_cascade[2] * 0.8, u_cascade[2], d) : 0.0;
        return min(vis, mix(s, 1.0, fade));
      }
    }
  }
  return vis;
}
`;

export const lighting = /* glsl */ `
struct Surface {
  vec3 albedo;
  vec3 normal;
  float roughness;
  float metalness;
  vec3 emissive;
  float occlusion;
  float sunVisibility;
};

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float f = (NoH * a2 - NoH) * NoH + 1.0;
  return a2 / (PI * f * f);
}
float V_SmithGGX(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 F_Schlick(vec3 f0, float VoH) {
  float f = pow(1.0 - VoH, 5.0);
  return f0 + (1.0 - f0) * f;
}
/** Split-sum style environment BRDF approximation (Karis, mobile). */
vec3 envBRDF(vec3 f0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * AB.x + AB.y;
}

/** Outgoing radiance at a camera-relative position (before aerial perspective). */
vec3 shade(Surface s, vec3 rel, float heightM) {
  vec3 V = normalize(eyePos() - rel);
  vec3 N = s.normal;
  float NoV = clamp(abs(dot(N, V)), 1e-4, 1.0);
  vec3 L = u_sunDir.xyz;
  float NoL = clamp(dot(N, L), 0.0, 1.0);
  vec3 H = normalize(V + L);
  float NoH = clamp(dot(N, H), 0.0, 1.0);
  float VoH = clamp(dot(V, H), 0.0, 1.0);
  float a = max(s.roughness * s.roughness, 0.002);
  vec3 f0 = mix(vec3(0.04), s.albedo, s.metalness);
  vec3 diffuse = s.albedo * (1.0 - s.metalness);

  vec3 sun = u_sunColor.rgb * transmittanceToSun(heightM) * s.sunVisibility * (1.0 - u_weather.x * 0.85);
  vec3 F = F_Schlick(f0, VoH);
  vec3 spec = F * D_GGX(NoH, a) * V_SmithGGX(NoV, NoL, a);
  vec3 direct = (diffuse * (1.0 - F) / PI + spec) * sun * NoL;

  // sky light from above, bounce light from the ground below
  vec3 skyI = skyAmbient(N) * (0.6 + 0.4 * u_weather.x);
  vec3 groundI = (u_sunColor.rgb * transmittanceToSun(0.0) * max(u_sunDir.y, 0.0) * 0.12 + skyAmbient(vec3(0, 1, 0)) * 0.1) * (1.0 - u_weather.x * 0.7);
  float up = N.y * 0.5 + 0.5;
  vec3 irradiance = mix(groundI, skyI, up);
  vec3 ambient = (diffuse * irradiance / PI) * s.occlusion;
  // reflections of the sky for shiny parts (canopy, paint, water drops)
  vec3 R = reflect(-V, N);
  vec3 env = R.y > 0.0 ? skyRadiance(normalize(vec3(R.x, max(R.y, 0.02), R.z))) : skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.08;
  ambient += env * envBRDF(f0, s.roughness, NoV) * s.occlusion * (1.0 - s.roughness * 0.6);
  return direct + ambient + s.emissive;
}
`;
