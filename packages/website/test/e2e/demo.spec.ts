import { type Page, expect, test } from "@playwright/test";

interface RaeRenderer {
  addLayer: (config: Record<string, unknown>) => string;
  updateLayer: (id: string, config: Record<string, unknown>) => void;
  setParent: (childId: string, parentId: string) => void;
  setTransform: (id: string, transform: Record<string, unknown>) => void;
  getLayers: () => Array<{ id: string; name: string; visible: boolean }>;
  getWorldTransform: (id: string) => {
    position: [number, number];
    rotation: number;
    scale: [number, number];
  };
  exportConfig: () => Record<string, unknown>;
  importConfig: (config: Record<string, unknown>) => void;
  getCanvasSize: () => { width: number; height: number };
}

interface RaeWindow extends Window {
  renderer: RaeRenderer;
  $: JQueryStatic;
}

/**
 * HELPER: Direct WebGL Readback
 * Validates the actual pixels in the Framebuffer using Stage 1 & 2 logic.
 */
async function getCanvasPixel(page: Page, x = 0.5, y = 0.5): Promise<number[] | null> {
  return await page.evaluate(
    ({ x, y }) => {
      const win = window as unknown as RaeWindow;
      const $canvas = win.$("canvas#glCanvas");
      if ($canvas.length === 0) return null;

      const canvas = $canvas[0] as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2");
      if (!gl) return null;

      const pixels = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width * x),
        Math.floor(canvas.height * y),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      return Array.from(pixels);
    },
    { x, y }
  );
}

test.describe("rae-noise: Full Pipeline & Scene Graph Suite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Inject jQuery
    await page.addScriptTag({
      url: "https://code.jquery.com/jquery-3.7.1.min.js",
    });
    // Ensure renderer is ready
    await page.waitForFunction(() => (window as unknown as RaeWindow).renderer !== undefined);
  });

  // --- 1. RENDERING PIPELINE (STAGE 1 & 2) ---

  test("Stage 1: Plugin generates pixel data in FBO", async ({ page }) => {
    const pixels = await getCanvasPixel(page);
    expect(pixels).not.toBeNull();
    if (pixels) {
      expect(pixels[3]).toBe(255);
      const isVisible = pixels.slice(0, 3).some((c) => c > 0);
      expect(isVisible).toBe(true);
    }
  });

  test("Stage 2: Composite Blend Modes using jQuery to verify UI state", async ({ page }) => {
    const modes = ["add", "multiply", "screen"] as const;

    for (const mode of modes) {
      await page.evaluate((m) => {
        const win = window as unknown as RaeWindow;
        win.renderer.addLayer({ blendMode: m, opacity: 0.5, name: `layer-${m}` });
      }, mode);
    }

    const cardCount = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      return win.$(".layer-card").length;
    });
    expect(cardCount).toBeGreaterThanOrEqual(3);
  });

  test("Stage 2: Overlay Blend (Ping-Pong Accumulation)", async ({ page }) => {
    await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      win.renderer.addLayer({
        blendMode: "overlay",
        opacity: 1.0,
        noiseType: "worley",
        name: "overlay-test",
      });
    });

    await expect(page.locator("canvas#glCanvas")).toHaveScreenshot("overlay-blend.png");
  });

  // --- 2. SCENE GRAPH (TRANSFORMS) ---

  test("Composition: Child follows parent position independently", async ({ page }) => {
    const positions = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      const r = win.renderer;
      const parentId = r.addLayer({ name: "Parent" });
      const childId = r.addLayer({ name: "Child" });

      r.setParent(childId, parentId);
      r.setTransform(parentId, { position: [0.7, 0.7], scale: [1, 1], rotation: 0 });
      r.setTransform(childId, { position: [0.2, 0.2], scale: [1, 1], rotation: 0 });

      return {
        childWorld: r.getWorldTransform(childId).position,
      };
    });

    expect(positions.childWorld[0]).toBeCloseTo(0.9);
    expect(positions.childWorld[1]).toBeCloseTo(0.9);
  });

  test("Graph Safety: Prevents circular parenting", async ({ page }) => {
    const errorCaught = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      const r = win.renderer;
      const a = r.addLayer({ name: "A" });
      const b = r.addLayer({ name: "B" });
      r.setParent(b, a);
      try {
        r.setParent(a, b);
        return false;
      } catch (_e) {
        return true;
      }
    });
    expect(errorCaught).toBe(true);
  });

  // --- 3. CONFIG & SERIALIZATION ---

  test("Integrity: Import/Export cycle preserves all fields", async ({ page }) => {
    const config = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      win.renderer.addLayer({
        noiseType: "curl",
        warp: 0.8,
        palette: [
          [0, 0, 0],
          [1, 1, 1],
        ],
      });
      return win.renderer.exportConfig();
    });

    await page.evaluate((cfg) => {
      const win = window as unknown as RaeWindow;
      win.renderer.importConfig(cfg);
    }, config);

    const reExported = await page.evaluate(() =>
      (window as unknown as RaeWindow).renderer.exportConfig()
    );
    expect(reExported).toEqual(config);
  });

  // --- 4. ENGINE EDGE CASES ---

  test("Handles window resize and resets FBO dimensions", async ({ page }) => {
    const width = 800;
    const height = 600;
    await page.setViewportSize({ width, height });

    const dimensions = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      window.dispatchEvent(new Event("resize"));
      return win.renderer.getCanvasSize();
    });

    expect(dimensions.width).toBe(width);
    expect(dimensions.height).toBe(height);
  });

  test("UI interaction: jQuery click updates layer list", async ({ page }) => {
    await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      win.$("#addLayerBtn").trigger("click");
    });

    const isVisible = await page.evaluate(() => {
      const win = window as unknown as RaeWindow;
      return win.$("#layerList").is(":visible");
    });
    expect(isVisible).toBe(true);
    await expect(page.locator(".layer-card")).toHaveCount(1);
  });
});
