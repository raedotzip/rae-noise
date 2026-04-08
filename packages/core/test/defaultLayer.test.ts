import { describe, expect, it } from "vitest";
import { defaultLayer } from "../src/shader/renderer";

describe("defaultLayer", () => {
  it("returns an object with all expected keys", () => {
    const layer = defaultLayer();
    const keys = [
      "name",
      "noiseType",
      "scale",
      "octaves",
      "speed",
      "direction",
      "flowType",
      "contrast",
      "brightness",
      "palette",
      "opacity",
      "blendMode",
      "animate",
      "warp",
      "curlStrength",
    ];
    for (const key of keys) {
      expect(layer).toHaveProperty(key);
    }
  });

  it("does not include an id", () => {
    const layer = defaultLayer();
    expect(layer).not.toHaveProperty("id");
  });

  it("returns the documented default values", () => {
    const layer = defaultLayer();
    expect(layer.noiseType).toBe("simplex");
    expect(layer.scale).toBe(3.0);
    expect(layer.octaves).toBe(4);
    expect(layer.speed).toBe(0.3);
    expect(layer.direction).toEqual([1.0, 0.0]);
    expect(layer.flowType).toBe("linear");
    expect(layer.contrast).toBe(1.0);
    expect(layer.brightness).toBe(0.0);
    expect(layer.palette).toEqual([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    expect(layer.opacity).toBe(1.0);
    expect(layer.blendMode).toBe("add");
    expect(layer.animate).toBe(true);
    expect(layer.warp).toBe(0.0);
    expect(layer.curlStrength).toBe(0.0);
  });

  it("returns independent objects (no shared references)", () => {
    const a = defaultLayer();
    const b = defaultLayer();
    expect(a).not.toBe(b);
    expect(a.palette).not.toBe(b.palette);
    expect(a.direction).not.toBe(b.direction);

    // Mutating one should not affect the other
    a.palette.push([1, 0, 0]);
    expect(b.palette).toHaveLength(2);
  });
});
