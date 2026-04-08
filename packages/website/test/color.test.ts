import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHex, swatchGradient } from "../src/demo/color";

describe("hexToRgb", () => {
  it("converts #ff0000 to [1, 0, 0]", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0]);
  });

  it("converts #000000 to [0, 0, 0]", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });

  it("converts #ffffff to [1, 1, 1]", () => {
    expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
  });

  it("converts #80ff00 correctly", () => {
    const [r, g, b] = hexToRgb("#80ff00");
    expect(r).toBeCloseTo(128 / 255, 5);
    expect(g).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
  });
});

describe("rgbToHex", () => {
  it("converts [1, 0, 0] to #ff0000", () => {
    expect(rgbToHex([1, 0, 0])).toBe("#ff0000");
  });

  it("converts [0, 0, 0] to #000000", () => {
    expect(rgbToHex([0, 0, 0])).toBe("#000000");
  });

  it("converts [1, 1, 1] to #ffffff", () => {
    expect(rgbToHex([1, 1, 1])).toBe("#ffffff");
  });

  it("round-trips through hexToRgb", () => {
    const hexValues = ["#ff0000", "#00ff00", "#0000ff", "#abcdef", "#000000", "#ffffff"];
    for (const hex of hexValues) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });
});

describe("swatchGradient", () => {
  it("returns an rgb() string for a single stop", () => {
    const result = swatchGradient([[1, 0, 0]]);
    expect(result).toBe("rgb(255,0,0)");
  });

  it("returns a linear-gradient for two stops", () => {
    const result = swatchGradient([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    expect(result).toContain("linear-gradient(to right,");
    expect(result).toContain("rgb(0,0,0) 0%");
    expect(result).toContain("rgb(255,255,255) 100%");
  });

  it("returns a linear-gradient with correct percentages for three stops", () => {
    const result = swatchGradient([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(result).toContain("0%");
    expect(result).toContain("50%");
    expect(result).toContain("100%");
  });
});
