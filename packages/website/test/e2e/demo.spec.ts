import { expect, test } from "@playwright/test";

test.describe("Demo page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has a canvas element", async ({ page }) => {
    const canvas = page.locator("canvas#glCanvas");
    await expect(canvas).toBeVisible();
  });

  test("adds a layer when the add button is clicked", async ({ page }) => {
    const addBtn = page.locator("#addLayerBtn");
    await addBtn.click();
    const cards = page.locator("#layerList .layer-card");
    await expect(cards).toHaveCount(1);
  });

  test("adds multiple layers", async ({ page }) => {
    const addBtn = page.locator("#addLayerBtn");
    await addBtn.click();
    await addBtn.click();
    await addBtn.click();
    const cards = page.locator("#layerList .layer-card");
    await expect(cards).toHaveCount(3);
  });

  test("canvas is not blank after adding a layer", async ({ page }) => {
    const addBtn = page.locator("#addLayerBtn");
    await addBtn.click();

    // Wait a moment for the shader to compile and render a frame
    await page.waitForTimeout(500);

    // Check that the canvas has non-zero pixel data (not all black)
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas#glCanvas");
      if (!canvas) return false;
      const gl = canvas.getContext("webgl2");
      if (!gl) return false;
      const pixels = new Uint8Array(4);
      // Sample from center of canvas
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      // At least one channel should be non-zero
      return pixels[0] > 0 || pixels[1] > 0 || pixels[2] > 0;
    });
    expect(hasContent).toBe(true);
  });

  test("shows FPS counter", async ({ page }) => {
    const addBtn = page.locator("#addLayerBtn");
    await addBtn.click();

    // FPS updates every ~500ms, wait for it
    await page.waitForTimeout(1000);
    const fps = page.locator("#fps");
    const text = await fps.textContent();
    expect(text).toMatch(/\d+/);
  });
});
