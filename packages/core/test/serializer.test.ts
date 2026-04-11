import { describe, expect, it } from "vitest";
import { exportConfig, importConfig } from "../src/config/serializer";
import { NoisePlugin } from "../src/plugin/noise/index";
import { defaultLayer } from "../src/renderer/defaults";
import type { LayerEntry, NoiseLayerConfig, Plugin, PluginType } from "../src/types";

function layer(overrides: Partial<NoiseLayerConfig> = {}): NoiseLayerConfig {
  return { ...defaultLayer(), id: "test-id", ...overrides } as NoiseLayerConfig;
}

function plugins(): Map<PluginType, Plugin> {
  // NoisePlugin's serialize/deserialize are pure and don't touch GL.
  return new Map<PluginType, Plugin>([["noise", new NoisePlugin() as unknown as Plugin]]);
}

describe("exportConfig", () => {
  it("returns version 1 with layer data", () => {
    const config = exportConfig([layer({ noiseType: "fbm" })], plugins());
    expect(config.version).toBe(1);
    expect(config.layers).toHaveLength(1);
  });

  it("wraps plugin-specific data in the `data` blob", () => {
    const config = exportConfig([layer({ noiseType: "worley", scale: 9 })], plugins());
    const entry = config.layers[0];
    expect(entry.plugin).toBe("noise");
    expect(entry.bv).toBe(1);
    const data = entry.data as { noiseType: string; scale: number };
    expect(data.noiseType).toBe("worley");
    expect(data.scale).toBe(9);
  });

  it("stores shared fields on the envelope, not inside data", () => {
    const config = exportConfig(
      [layer({ opacity: 0.5, blendMode: "screen", name: "bg" })],
      plugins()
    );
    const entry = config.layers[0];
    expect(entry.opacity).toBe(0.5);
    expect(entry.blendMode).toBe("screen");
    expect(entry.name).toBe("bg");
  });
});

describe("importConfig", () => {
  it("accepts a valid envelope config", () => {
    const config = importConfig({
      version: 1,
      layers: [
        {
          plugin: "noise",
          bv: 1,
          data: { noiseType: "simplex", scale: 3 },
        },
      ],
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

  it("throws when a layer entry is missing its plugin field", () => {
    expect(() =>
      importConfig({
        version: 1,
        layers: [{ bv: 1, data: {} }],
      })
    ).toThrow("plugin");
  });

  it("defaults bv to 1 when absent", () => {
    const config = importConfig({
      version: 1,
      layers: [{ plugin: "noise", data: {} }],
    });
    expect((config.layers[0] as LayerEntry).bv).toBe(1);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const original = exportConfig(
      [layer({ noiseType: "curl", scale: 5, name: "test" })],
      plugins()
    );
    const json = JSON.stringify(original);
    const restored = importConfig(JSON.parse(json));
    expect(restored.layers).toHaveLength(1);
    const entry = restored.layers[0];
    expect(entry.plugin).toBe("noise");
    const data = entry.data as { noiseType: string };
    expect(data.noiseType).toBe("curl");
  });
});
