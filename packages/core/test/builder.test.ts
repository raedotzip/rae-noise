import { describe, expect, it } from "vitest";
import type { NoiseLayer } from "../src/types";
import { MAX_PALETTE_STOPS, buildFlowHelpers, buildFragShader } from "../src/shader/builder";
import { defaultLayer } from "../src/shader/renderer";

/** Create a full NoiseLayer from a partial, with a stable id. */
function layer(overrides: Partial<NoiseLayer> = {}): NoiseLayer {
  return { ...defaultLayer(), id: "test-layer", ...overrides } as NoiseLayer;
}

describe("MAX_PALETTE_STOPS", () => {
  it("equals 8", () => {
    expect(MAX_PALETTE_STOPS).toBe(8);
  });
});

describe("buildFragShader", () => {
  it("returns a valid GLSL ES 3.0 shader for an empty layer stack", () => {
    const src = buildFragShader([]);
    expect(src).toContain("#version 300 es");
    expect(src).toContain("void main()");
    expect(src).toContain("paletteLookup");
  });

  it("includes simplex chunk for simplex layer", () => {
    const src = buildFragShader([layer({ noiseType: "simplex" })]);
    expect(src).toContain("u_speed0");
    expect(src).toContain("u_scale0");
    expect(src).toContain("simplex(p0)");
  });

  it("includes perlin chunk for perlin layer", () => {
    const src = buildFragShader([layer({ noiseType: "perlin" })]);
    expect(src).toContain("perlin(p0)");
  });

  it("includes worley chunk for worley layer", () => {
    const src = buildFragShader([layer({ noiseType: "worley" })]);
    expect(src).toContain("worley(p0)");
  });

  it("includes fbm call with correct octave count", () => {
    const src = buildFragShader([layer({ noiseType: "fbm", octaves: 6 })]);
    expect(src).toContain("fbm(p0, 6)");
  });

  it("includes curl call for curl layer", () => {
    const src = buildFragShader([layer({ noiseType: "curl" })]);
    expect(src).toContain("curl(p0)");
  });

  it("includes warp code when warp > 0", () => {
    const src = buildFragShader([layer({ warp: 0.5 })]);
    expect(src).toContain("warpDomain");
    expect(src).toContain("u_warp0");
  });

  it("includes curl displacement when curlStrength > 0", () => {
    const src = buildFragShader([layer({ curlStrength: 0.3 })]);
    expect(src).toContain("curlNoise");
    expect(src).toContain("u_curl0");
  });

  it("generates uniform blocks for multiple layers", () => {
    const src = buildFragShader([
      layer({ id: "a", noiseType: "simplex" }),
      layer({ id: "b", noiseType: "perlin" }),
    ]);
    expect(src).toContain("u_speed0");
    expect(src).toContain("u_speed1");
    expect(src).toContain("u_scale0");
    expect(src).toContain("u_scale1");
  });

  it("includes overlay blend chunk only when needed", () => {
    const withOverlay = buildFragShader([layer({ blendMode: "overlay" })]);
    const withAdd = buildFragShader([layer({ blendMode: "add" })]);
    expect(withOverlay).toContain("overlayBlend");
    // The add shader should not have the overlay blend function
    // (the chunk won't be included, but the blend call text still differs)
    expect(withAdd).not.toContain("overlayBlend");
  });

  it("uses screen blend syntax for screen mode", () => {
    const src = buildFragShader([layer({ blendMode: "screen" })]);
    expect(src).toContain("1.0 - (1.0-result.rgb)*(1.0-layerCol0)");
  });

  it("uses multiply blend syntax for multiply mode", () => {
    const src = buildFragShader([layer({ blendMode: "multiply" })]);
    expect(src).toContain("result.rgb * layerCol0");
  });

  it("generates static coordinates when animate is false", () => {
    const src = buildFragShader([layer({ animate: false })]);
    // When animate is false with linear flow, time term should be absent
    expect(src).not.toContain("u_time * u_speed0");
  });
});

describe("buildFlowHelpers", () => {
  it("returns empty string when no special flows are used", () => {
    expect(buildFlowHelpers([layer({ flowType: "linear" })])).toBe("");
  });

  it("emits rotateUV for spiral flow", () => {
    const helpers = buildFlowHelpers([layer({ flowType: "spiral" })]);
    expect(helpers).toContain("rotateUV");
  });

  it("emits rotateUV and vortexUV for vortex flow", () => {
    const helpers = buildFlowHelpers([layer({ flowType: "vortex" })]);
    expect(helpers).toContain("rotateUV");
    expect(helpers).toContain("vortexUV");
  });

  it("does not emit vortexUV for spiral-only flow", () => {
    const helpers = buildFlowHelpers([layer({ flowType: "spiral" })]);
    expect(helpers).not.toContain("vortexUV");
  });

  it("returns empty for radial flow", () => {
    expect(buildFlowHelpers([layer({ flowType: "radial" })])).toBe("");
  });

  it("returns empty for turbulent flow", () => {
    expect(buildFlowHelpers([layer({ flowType: "turbulent" })])).toBe("");
  });
});
