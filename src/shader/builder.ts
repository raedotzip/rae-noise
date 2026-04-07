import type { NoiseLayer } from '../types';

import simplexChunk from './chunks/noise/simplex.glsl?raw';
import perlinChunk  from './chunks/noise/perlin.glsl?raw';
import worleyChunk  from './chunks/noise/worley.glsl?raw';
import fbmChunk     from './chunks/noise/fbm.glsl?raw';
import curlChunk    from './chunks/noise/curl.glsl?raw';
import utilsChunk   from './chunks/utils.glsl?raw';
import blendChunk from './chunks/blend.glsl?raw';
import warpChunk  from './chunks/warp.glsl?raw';

export const MAX_PALETTE_STOPS = 8;

export function buildFragShader(layers: NoiseLayer[]): string {
  const needsSimplex   = layers.some(l => ['simplex','fbm','curl'].includes(l.noiseType) || l.warp > 0);
  const needsFbm       = layers.some(l => l.noiseType === 'fbm');
  const needsPerlin    = layers.some(l => l.noiseType === 'perlin');
  const needsWorley    = layers.some(l => l.noiseType === 'worley');
  const needsCurl      = layers.some(l => l.noiseType === 'curl' || l.curlStrength > 0);
  const needsWarp      = layers.some(l => l.warp > 0);
  const needsBlend = layers.some(l => l.blendMode === 'overlay');
  const needsWarpChunk = (needsWarp || layers.some(l => l.flowType === 'turbulent')) && needsSimplex;

  const uniformBlock = layers.map((_, i) => `
    uniform float u_speed${i};
    uniform float u_scale${i};
    uniform float u_contrast${i};
    uniform float u_brightness${i};
    uniform float u_opacity${i};
    uniform float u_warp${i};
    uniform float u_curl${i};
    uniform vec2  u_dir${i};
    uniform vec2  u_center${i};
    uniform int   u_palLen${i};
    uniform vec3  u_pal${i}[${MAX_PALETTE_STOPS}];
  `).join('\n');

  const layerCalls = layers.map((l, i) => buildLayerCall(l, i)).join('\n');

  return `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;

${needsSimplex ? simplexChunk : ''}
${needsPerlin  ? perlinChunk  : ''}
${needsWorley  ? worleyChunk  : ''}
${needsFbm     ? fbmChunk     : ''}
${needsCurl    ? curlChunk    : ''}
${needsBlend     ? blendChunk : ''}
${needsWarpChunk ? warpChunk  : ''}

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

${uniformBlock}
${buildFlowHelpers(layers)}

void main() {
  vec4 result = vec4(0.0, 0.0, 0.0, 1.0);
  ${layerCalls}
  result.rgb = pow(clamp(result.rgb, 0.0, 1.0), vec3(0.8));
  fragColor  = result;
}
`;
}

function buildCoord(l: NoiseLayer, i: number): string {
  // Base scaled UV — direction only applies to linear/turbulent
  const t    = l.animate ? `u_time * u_speed${i}` : '0.0';
  const base = `v_uv * u_scale${i}`;
  const cx   = `u_center${i}.x`;
  const cy   = `u_center${i}.y`;

  switch (l.flowType) {
    case 'linear':
      return l.animate
        ? `${base} + ${t} * u_dir${i}`
        : base;

    case 'radial': {
      // Coord stretches outward from center over time
      return `(v_uv - u_center${i}) * (u_scale${i} + ${t}) + u_center${i} * u_scale${i}`;
    }

    case 'spiral': {
      // Rotate UV around center, angle grows with time
      return `(rotateUV(v_uv - u_center${i}, ${t}) + u_center${i}) * u_scale${i}`;
    }

    case 'vortex': {
      // Distance-dependent rotation — inner spins faster
      return `vortexUV(v_uv, u_center${i}, u_scale${i}, ${t})`;
    }

    case 'turbulent': {
      // Linear + extra simplex-warped jitter
      return `${base} + ${t} * u_dir${i} + warpDomain(${base}, ${t}) * 0.4`;
    }
  }
}

// Emit helper functions needed by non-linear flows (injected once into main shader)
export function buildFlowHelpers(layers: NoiseLayer[]): string {
  const flows = new Set(layers.map(l => l.flowType));
  const parts: string[] = [];

  if (flows.has('spiral') || flows.has('vortex')) {
    parts.push(`
// ── Rotate a 2D vector by angle a ───────────────────────
vec2 rotateUV(vec2 p, float a) {
  float s = sin(a); float c = cos(a);
  return mat2(c, -s, s, c) * p;
}
`);
  }

  if (flows.has('vortex')) {
    parts.push(`
// ── Vortex: rotation speed falls off with distance ───────
vec2 vortexUV(vec2 uv, vec2 center, float scale, float t) {
  vec2 d = uv - center;
  float dist = length(d) + 0.001;
  float angle = t / dist; // inner pixels spin faster
  return rotateUV(d, angle) * scale + center * scale;
}
`);
  }

  return parts.join('\n');
}

function buildLayerCall(l: NoiseLayer, i: number): string {
  const coord = buildCoord(l, i);

  const noiseCall = {
    simplex: `simplex(p${i})`,
    perlin:  `perlin(p${i})`,
    worley:  `worley(p${i})`,
    fbm:     `fbm(p${i}, ${l.octaves})`,
    curl:    `curl(p${i})`,
  }[l.noiseType];

  const warpLine = l.warp > 0
    ? `p${i} += warpDomain(p${i}, u_time * u_speed${i}) * u_warp${i};`
    : '';

  // Curl-flow advection: displace sample point along curl vector field
  const curlLine = l.curlStrength > 0
    ? `p${i} += curlNoise(p${i} * 0.5) * u_curl${i};`
    : '';

  const blendCall = {
    add:      `result.rgb += layerCol${i} * u_opacity${i};`,
    multiply: `result.rgb = mix(result.rgb, result.rgb * layerCol${i}, u_opacity${i});`,
    screen:   `result.rgb = mix(result.rgb, 1.0 - (1.0-result.rgb)*(1.0-layerCol${i}), u_opacity${i});`,
    overlay:  `result.rgb = mix(result.rgb, overlayBlend(result.rgb, layerCol${i}), u_opacity${i});`,
  }[l.blendMode];

  return `
  // ── Layer ${i}: ${l.name} (${l.noiseType} / ${l.flowType}) ──
  {
    vec2 p${i} = ${coord};
    ${warpLine}
    ${curlLine}
    float raw${i} = ${noiseCall};
    float n${i}   = clamp((raw${i} * 0.5 + 0.5 - 0.5) * u_contrast${i} + 0.5 + u_brightness${i}, 0.0, 1.0);
    vec3  layerCol${i} = paletteLookup(n${i}, u_pal${i}, u_palLen${i});
    ${blendCall}
  }`;
}