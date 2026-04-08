import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer } from "../src/shader/renderer";
import type { RaeNoiseRenderer } from "../src/types";

describe("createRenderer", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("returns an object implementing the RaeNoiseRenderer interface", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    expect(renderer).toBeDefined();
    expect(typeof renderer.addLayer).toBe("function");
    expect(typeof renderer.removeLayer).toBe("function");
    expect(typeof renderer.updateLayer).toBe("function");
    expect(typeof renderer.getLayers).toBe("function");
    expect(typeof renderer.destroy).toBe("function");
    expect(typeof renderer.reorderLayers).toBe("function");
  });

  it("starts with an empty layer stack", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    expect(renderer.getLayers()).toHaveLength(0);
  });
});

describe("addLayer", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("returns a string id", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const id = renderer.addLayer();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("adds a layer to the stack", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    renderer.addLayer();
    expect(renderer.getLayers()).toHaveLength(1);
  });

  it("merges partial config with defaults", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    renderer.addLayer({ noiseType: "worley", scale: 7 });
    const layers = renderer.getLayers();
    expect(layers[0].noiseType).toBe("worley");
    expect(layers[0].scale).toBe(7);
    // Other properties should still have defaults
    expect(layers[0].speed).toBe(0.3);
  });
});

describe("removeLayer", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("removes a layer by id", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const id1 = renderer.addLayer();
    const id2 = renderer.addLayer();
    renderer.removeLayer(id1);
    const layers = renderer.getLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(id2);
  });

  it("is a no-op for unknown ids", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    renderer.addLayer();
    renderer.removeLayer("nonexistent");
    expect(renderer.getLayers()).toHaveLength(1);
  });
});

describe("updateLayer", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("patches properties on an existing layer", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const id = renderer.addLayer({ scale: 3 });
    renderer.updateLayer(id, { scale: 10 });
    expect(renderer.getLayers()[0].scale).toBe(10);
  });

  it("preserves unchanged properties", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const id = renderer.addLayer({ noiseType: "fbm", scale: 5 });
    renderer.updateLayer(id, { scale: 10 });
    expect(renderer.getLayers()[0].noiseType).toBe("fbm");
  });

  it("is a no-op for unknown ids", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    renderer.addLayer({ scale: 3 });
    renderer.updateLayer("nonexistent", { scale: 99 });
    expect(renderer.getLayers()[0].scale).toBe(3);
  });
});

describe("getLayers", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("returns a copy, not the internal array", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    renderer.addLayer();
    const layers = renderer.getLayers();
    layers.pop();
    expect(renderer.getLayers()).toHaveLength(1);
  });
});

describe("reorderLayers", () => {
  let renderer: RaeNoiseRenderer;

  afterEach(() => {
    renderer?.destroy();
  });

  it("reorders layers to match the given id sequence", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const a = renderer.addLayer({ name: "A" });
    const b = renderer.addLayer({ name: "B" });
    const c = renderer.addLayer({ name: "C" });
    renderer.reorderLayers([c, a, b]);
    const names = renderer.getLayers().map((l) => l.name);
    expect(names).toEqual(["C", "A", "B"]);
  });

  it("is a no-op when ids do not fully match", () => {
    const canvas = document.createElement("canvas");
    renderer = createRenderer(canvas);
    const a = renderer.addLayer({ name: "A" });
    renderer.addLayer({ name: "B" });
    renderer.reorderLayers([a]); // missing one id
    const names = renderer.getLayers().map((l) => l.name);
    expect(names).toEqual(["A", "B"]);
  });
});

describe("destroy", () => {
  it("calls cancelAnimationFrame", () => {
    const canvas = document.createElement("canvas");
    const renderer = createRenderer(canvas);
    const spy = vi.spyOn(globalThis, "cancelAnimationFrame");
    renderer.destroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
