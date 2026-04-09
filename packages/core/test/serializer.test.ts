import { describe, expect, it } from "vitest";
import { exportConfig, importConfig } from "../src/config/serializer";
import { defaultLayer } from "../src/renderer/defaults";
import type { NoiseLayerConfig } from "../src/types";

function layer(overrides: Partial<NoiseLayerConfig> = {}): NoiseLayerConfig {
  return { ...defaultLayer(), id: "test-id", ...overrides } as NoiseLayerConfig;
}

describe("exportConfig", () => {
  it("returns version 1 with layer data", () => {
    const config = exportConfig([layer({ noiseType: "fbm" })]);
    expect(config.version).toBe(1);
    expect(config.layers).toHaveLength(1);
  });

  it("strips the id field from layers", () => {
    const config = exportConfig([layer()]);
    expect(config.layers[0]).not.toHaveProperty("id");
  });

  it("preserves all other layer properties", () => {
    const config = exportConfig([layer({ noiseType: "worley", scale: 9 })]);
    const l = config.layers[0] as Partial<NoiseLayerConfig>;
    expect(l.noiseType).toBe("worley");
    expect(l.scale).toBe(9);
    expect(l.backend).toBe("noise");
  });
});

describe("importConfig", () => {
  it("accepts a valid config", () => {
    const config = importConfig({
      version: 1,
      layers: [{ ...defaultLayer() }],
    });
    expect(config.version).toBe(1);
    expect(config.layers).toHaveLength(1);
  });

  it("throws on non-object input", () => {
    expect(() => importConfig("bad")).toThrow("expected an object");
    expect(() => importConfig(null)).toThrow("expected an object");
  });

  it("throws on missing version", () => {
    expect(() => importConfig({ layers: [] })).toThrow("version");
  });

  it("throws on missing layers array", () => {
    expect(() => importConfig({ version: 1 })).toThrow("layers");
  });

  it("defaults backend to noise for layers without one", () => {
    const config = importConfig({
      version: 1,
      layers: [{ noiseType: "simplex", scale: 3 }],
    });
    expect((config.layers[0] as Record<string, unknown>).backend).toBe("noise");
  });

  it("round-trips through JSON.stringify/parse", () => {
    const original = exportConfig([layer({ noiseType: "curl", scale: 5, name: "test" })]);
    const json = JSON.stringify(original);
    const restored = importConfig(JSON.parse(json));
    expect(restored.layers).toHaveLength(1);
    expect((restored.layers[0] as Partial<NoiseLayerConfig>).noiseType).toBe("curl");
  });
});
