import { describe, expect, it } from "vitest";
import {
  MAX_PALETTE_STOPS,
  buildFlowHelpers,
  buildNoiseShader,
} from "../src/backend/noise/builder";
import { defaultLayer } from "../src/renderer/defaults";
import type { NoiseLayerConfig } from "../src/types";

/** Create a full NoiseLayerConfig from a partial, with a stable id. */
function layer(overrides: Partial<NoiseLayerConfig> = {}): NoiseLayerConfig {
  return { ...defaultLayer(), id: "test-layer", ...overrides } as NoiseLayerConfig;
}

describe("MAX_PALETTE_STOPS", () => {
  it("equals 8", () => {
    expect(MAX_PALETTE_STOPS).toBe(8);
  });
});

describe("buildNoiseShader", () => {
  it("returns a valid GLSL ES 3.0 shader", () => {
    const src = buildNoiseShader(layer());
    expect(src).toContain("#version 300 es");
    expect(src).toContain("void main()");
    expect(src).toContain("paletteLookup");
  });

  it("includes simplex call for simplex layer", () => {
    const src = buildNoiseShader(layer({ noiseType: "simplex" }));
    expect(src).toContain("u_speed");
    expect(src).toContain("u_scale");
    expect(src).toContain("simplex(p)");
  });

  it("includes perlin call for perlin layer", () => {
    const src = buildNoiseShader(layer({ noiseType: "perlin" }));
    expect(src).toContain("perlin(p)");
  });

  it("includes worley call for worley layer", () => {
    const src = buildNoiseShader(layer({ noiseType: "worley" }));
    expect(src).toContain("worley(p)");
  });

  it("includes fbm call with correct octave count", () => {
    const src = buildNoiseShader(layer({ noiseType: "fbm", octaves: 6 }));
    expect(src).toContain("fbm(p, 6)");
  });

  it("includes curl call for curl layer", () => {
    const src = buildNoiseShader(layer({ noiseType: "curl" }));
    expect(src).toContain("curl(p)");
  });

  it("includes warp code when warp > 0", () => {
    const src = buildNoiseShader(layer({ warp: 0.5 }));
    expect(src).toContain("warpDomain");
    expect(src).toContain("u_warp");
  });

  it("includes curl displacement when curlStrength > 0", () => {
    const src = buildNoiseShader(layer({ curlStrength: 0.3 }));
    expect(src).toContain("curlNoise");
    expect(src).toContain("u_curl");
  });

  it("outputs palette-mapped color without blend logic", () => {
    const src = buildNoiseShader(layer());
    expect(src).toContain("paletteLookup");
    expect(src).toContain("fragColor = vec4(col, 1.0)");
    // No blend calls — compositing is handled externally
    expect(src).not.toContain("result.rgb +=");
    expect(src).not.toContain("overlayBlend");
  });

  it("generates static coordinates when animate is false", () => {
    const src = buildNoiseShader(layer({ animate: false }));
    expect(src).not.toContain("u_time * u_speed");
  });
});

describe("buildFlowHelpers", () => {
  it("returns empty string when no special flows are used", () => {
    expect(buildFlowHelpers(layer({ flowType: "linear" }))).toBe("");
  });

  it("emits rotateUV for spiral flow", () => {
    const helpers = buildFlowHelpers(layer({ flowType: "spiral" }));
    expect(helpers).toContain("rotateUV");
  });

  it("emits rotateUV and vortexUV for vortex flow", () => {
    const helpers = buildFlowHelpers(layer({ flowType: "vortex" }));
    expect(helpers).toContain("rotateUV");
    expect(helpers).toContain("vortexUV");
  });

  it("does not emit vortexUV for spiral-only flow", () => {
    const helpers = buildFlowHelpers(layer({ flowType: "spiral" }));
    expect(helpers).not.toContain("vortexUV");
  });

  it("returns empty for radial flow", () => {
    expect(buildFlowHelpers(layer({ flowType: "radial" }))).toBe("");
  });

  it("returns empty for turbulent flow", () => {
    expect(buildFlowHelpers(layer({ flowType: "turbulent" }))).toBe("");
  });
});
