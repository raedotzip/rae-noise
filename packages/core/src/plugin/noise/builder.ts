/**
 * @file Dynamic GLSL fragment shader builder for the noise plugin.
 *
 * This module generates GLSL ES 3.0 fragment shaders at runtime based on a
 * {@link NoiseLayerConfig}. Each noise layer gets a shader that is tailored
 * to its exact configuration — only the GLSL chunks actually needed are
 * included, keeping the shader compact and avoiding unused-code overhead.
 *
 * ## Shader generation pipeline
 *
 * {@link buildNoiseShader} is the entry point. It:
 *
 * 1. Determines which GLSL chunks are needed (simplex, perlin, worley, etc.)
 * 2. Generates flow-specific helper functions via {@link buildFlowHelpers}
 * 3. Builds the coordinate transformation expression via {@link buildCoord}
 * 4. Selects the noise sampling call via {@link buildNoiseCall}
 * 5. Assembles the final fragment shader string with uniforms, chunks, and main()
 *
 * ## GLSL chunks
 *
 * Raw GLSL source files live in `./chunks/` and are imported as strings at
 * build time via Rollup's GLSL plugin. Each chunk is a self-contained function:
 *
 * - `chunks/noise/simplex.glsl` — `float simplex(vec2 p)`
 * - `chunks/noise/perlin.glsl` — `float perlin(vec2 p)`
 * - `chunks/noise/worley.glsl` — `float worley(vec2 p)`
 * - `chunks/noise/fbm.glsl` — `float fbm(vec2 p, int octaves)`
 * - `chunks/noise/curl.glsl` — `float curl(vec2 p)` + `vec2 curlNoise(vec2 p)`
 * - `chunks/warp.glsl` — `vec2 warpDomain(vec2 p, float t)`
 *
 * @see {@link NoisePlugin} for the plugin that uses this builder.
 * @see {@link NoiseLayerConfig} for the config properties that drive generation.
 */

import type { NoiseLayerConfig } from "../../types";

import curlChunk from "./chunks/noise/curl.glsl?raw";
import fbmChunk from "./chunks/noise/fbm.glsl?raw";
import perlinChunk from "./chunks/noise/perlin.glsl?raw";
import simplexChunk from "./chunks/noise/simplex.glsl?raw";
import worleyChunk from "./chunks/noise/worley.glsl?raw";
import warpChunk from "./chunks/warp.glsl?raw";

/**
 * Maximum number of color stops in a noise layer's palette.
 *
 * This constant is baked into the generated GLSL as an array size for the
 * `u_pal` uniform. Palettes with fewer stops leave the trailing entries
 * zeroed; the `paletteLookup` function only reads up to `u_palLen`.
 */
export const MAX_PALETTE_STOPS = 8;

/**
 * Generate a complete GLSL ES 3.0 fragment shader for a single noise layer.
 *
 * The output shader samples noise, applies contrast/brightness, maps through
 * the color palette, and outputs an RGBA fragment. Blending between layers
 * is handled by the {@link Compositor}, not here — the shader always outputs
 * `alpha = 1.0`.
 *
 * @param layer - The noise layer config that determines which GLSL chunks,
 *                flow helpers, and noise calls are included in the shader.
 * @returns A complete GLSL ES 3.0 fragment shader source string.
 *
 * @example
 * ```ts
 * const fragSrc = buildNoiseShader(layer);
 * const program = linkProgram(gl, FULLSCREEN_VERT, fragSrc);
 * ```
 *
 * @see {@link buildCoord} for coordinate transformation logic.
 * @see {@link buildNoiseCall} for noise function selection.
 * @see {@link buildFlowHelpers} for flow-type-specific GLSL helpers.
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

/**
 * Build the GLSL expression that computes the sampling coordinate `p`.
 *
 * The expression varies by flow type — linear flows translate along a
 * direction vector, radial flows expand from center, spiral/vortex flows
 * rotate, and turbulent flows add simplex-based domain jitter.
 *
 * @param l - The noise layer config (uses `flowType`, `animate`).
 * @returns A GLSL expression string evaluating to `vec2`.
 */
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

/**
 * Build the GLSL noise function call expression.
 *
 * Selects the appropriate noise function based on `noiseType`. For `fbm`,
 * the octave count is baked as a literal integer argument.
 *
 * @param l - The noise layer config (uses `noiseType`, `octaves`).
 * @returns A GLSL expression string evaluating to `float`.
 */
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

/**
 * Build GLSL helper functions required by certain flow types.
 *
 * - `spiral` and `vortex` both need `rotateUV()` (2D rotation).
 * - `vortex` additionally needs `vortexUV()` (distance-dependent rotation).
 * - Other flow types return an empty string (no helpers needed).
 *
 * @param layer - The noise layer config (uses `flowType`).
 * @returns GLSL function definitions to prepend before `main()`, or `""`.
 */
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
