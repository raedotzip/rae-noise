import type { NoiseLayerConfig } from "../../types";

import curlChunk from "./chunks/noise/curl.glsl?raw";
import fbmChunk from "./chunks/noise/fbm.glsl?raw";
import perlinChunk from "./chunks/noise/perlin.glsl?raw";
import simplexChunk from "./chunks/noise/simplex.glsl?raw";
import worleyChunk from "./chunks/noise/worley.glsl?raw";
import warpChunk from "./chunks/warp.glsl?raw";

export const MAX_PALETTE_STOPS = 8;

/**
 * Generates a GLSL ES 3.0 fragment shader for a single noise layer.
 *
 * The shader outputs the palette-mapped noise color with full opacity.
 * Blending between layers is handled by the compositor, not here.
 */
export function buildNoiseShader(layer: NoiseLayerConfig): string {
  const needsSimplex = ["simplex", "fbm", "curl"].includes(layer.noiseType) || layer.warp > 0;
  const needsFbm = layer.noiseType === "fbm";
  const needsPerlin = layer.noiseType === "perlin";
  const needsWorley = layer.noiseType === "worley";
  const needsCurl = layer.noiseType === "curl" || layer.curlStrength > 0;
  const needsWarp = layer.warp > 0;
  const needsWarpChunk = (needsWarp || layer.flowType === "turbulent") && needsSimplex;

  const flowHelpers = buildFlowHelpers(layer);
  const coord = buildCoord(layer);
  const noiseCall = buildNoiseCall(layer);
  const warpLine = needsWarp ? "p += warpDomain(p, u_time * u_speed) * u_warp;" : "";
  const curlLine = layer.curlStrength > 0 ? "p += curlNoise(p * 0.5) * u_curl;" : "";

  return `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_speed;
uniform float u_scale;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_warp;
uniform float u_curl;
uniform vec2  u_dir;
uniform vec2  u_center;
uniform int   u_palLen;
uniform vec3  u_pal[${MAX_PALETTE_STOPS}];

${needsSimplex ? simplexChunk : ""}
${needsPerlin ? perlinChunk : ""}
${needsWorley ? worleyChunk : ""}
${needsFbm ? fbmChunk : ""}
${needsCurl ? curlChunk : ""}
${needsWarpChunk ? warpChunk : ""}

vec3 paletteLookup(float t, vec3 stops[${MAX_PALETTE_STOPS}], int len) {
  t = clamp(t, 0.0, 1.0);
  if (len == 1) return stops[0];
  float scaled = t * float(len - 1);
  int   lo     = int(floor(scaled));
  int   hi     = min(lo + 1, len - 1);
  float f      = fract(scaled);
  vec3 a = stops[0];
  vec3 b = stops[0];
  for (int k = 0; k < ${MAX_PALETTE_STOPS}; k++) {
    if (k == lo) a = stops[k];
    if (k == hi) b = stops[k];
  }
  return mix(a, b, f);
}

${flowHelpers}

void main() {
  vec2 p = ${coord};
  ${warpLine}
  ${curlLine}
  float raw = ${noiseCall};
  float n = clamp((raw * 0.5 + 0.5 - 0.5) * u_contrast + 0.5 + u_brightness, 0.0, 1.0);
  vec3 col = paletteLookup(n, u_pal, u_palLen);
  fragColor = vec4(col, 1.0);
}
`;
}

function buildCoord(l: NoiseLayerConfig): string {
  const t = l.animate ? "u_time * u_speed" : "0.0";
  const base = "v_uv * u_scale";

  switch (l.flowType) {
    case "linear":
      return l.animate ? `${base} + ${t} * u_dir` : base;
    case "radial":
      return `(v_uv - u_center) * (u_scale + ${t}) + u_center * u_scale`;
    case "spiral":
      return `(rotateUV(v_uv - u_center, ${t}) + u_center) * u_scale`;
    case "vortex":
      return `vortexUV(v_uv, u_center, u_scale, ${t})`;
    case "turbulent":
      return `${base} + ${t} * u_dir + warpDomain(${base}, ${t}) * 0.4`;
  }
}

function buildNoiseCall(l: NoiseLayerConfig): string {
  switch (l.noiseType) {
    case "simplex":
      return "simplex(p)";
    case "perlin":
      return "perlin(p)";
    case "worley":
      return "worley(p)";
    case "fbm":
      return `fbm(p, ${l.octaves})`;
    case "curl":
      return "curl(p)";
  }
}

export function buildFlowHelpers(layer: NoiseLayerConfig): string {
  const parts: string[] = [];

  if (layer.flowType === "spiral" || layer.flowType === "vortex") {
    parts.push(`
vec2 rotateUV(vec2 p, float a) {
  float s = sin(a); float c = cos(a);
  return mat2(c, -s, s, c) * p;
}
`);
  }

  if (layer.flowType === "vortex") {
    parts.push(`
vec2 vortexUV(vec2 uv, vec2 center, float scale, float t) {
  vec2 d = uv - center;
  float dist = length(d) + 0.001;
  float angle = t / dist;
  return rotateUV(d, angle) * scale + center * scale;
}
`);
  }

  return parts.join("\n");
}
