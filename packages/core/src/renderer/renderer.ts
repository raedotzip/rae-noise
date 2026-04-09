import { NoiseBackend } from "../backend/noise/index";
import { Compositor } from "../compositor/compositor";
import { exportConfig, importConfig } from "../config/serializer";
import type {
  Backend,
  BackendType,
  Layer,
  NoiseLayerConfig,
  RaeNoiseRenderer,
  RendererConfig,
} from "../types";
import { defaultLayer } from "./defaults";

/**
 * Core renderer orchestrator. Manages a stack of {@link Layer}s, delegates
 * rendering to registered {@link Backend}s, and composites the results
 * via FBO ping-pong blending.
 *
 * Use {@link createRenderer} to obtain an instance.
 *
 * **Lifecycle:**
 * 1. Construction initializes WebGL2, registers the built-in noise backend,
 *    sets up the compositor, and starts a `requestAnimationFrame` render loop.
 * 2. Adding or modifying layers marks them for recompilation on the next frame.
 * 3. Call {@link destroy} to stop the loop and free GPU resources.
 */
export class Renderer implements RaeNoiseRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private layers: Layer[] = [];
  private backends = new Map<BackendType, Backend>();
  private compositor: Compositor;
  private dirty = new Set<string>();
  private rafId: number | null = null;
  private startTime = performance.now();

  /**
   * Optional callback invoked roughly every 500 ms with the current
   * frames-per-second count. Useful for performance overlays.
   */
  onFps?: (fps: number) => void;
  private frameCount = 0;
  private lastFpsTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.compositor = new Compositor(gl);

    // Register built-in backends
    const noise = new NoiseBackend();
    noise.init(gl);
    this.backends.set("noise", noise);

    this.setupResize();
    this.startLoop();
  }

  // ── Public API ──────────────────────────────────────────

  addLayer(partial: Partial<Layer> = {}): string {
    const id = crypto.randomUUID();
    const backend = partial.backend ?? "noise";

    let layer: Layer;
    if (backend === "noise") {
      layer = { ...defaultLayer(), ...partial, id, backend: "noise" } as NoiseLayerConfig;
    } else {
      layer = {
        name: "layer",
        opacity: 1.0,
        blendMode: "add" as const,
        visible: true,
        ...partial,
        id,
        backend,
      } as Layer;
    }

    this.layers.push(layer);
    this.dirty.add(id);
    return id;
  }

  removeLayer(id: string): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;

    const layer = this.layers[idx];
    this.layers.splice(idx, 1);
    this.dirty.delete(id);

    const backend = this.backends.get(layer.backend);
    if (backend) backend.removeLayer(id);
    this.compositor.removeFBO(id);
  }

  updateLayer(id: string, patch: Partial<Layer>): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;

    const prev = this.layers[idx];
    const next = { ...prev, ...patch } as Layer;
    this.layers[idx] = next;

    const backend = this.backends.get(next.backend);
    if (backend?.needsRecompile(prev, next)) {
      this.dirty.add(id);
    }
  }

  getLayers(): Layer[] {
    return [...this.layers];
  }

  reorderLayers(ids: string[]): void {
    const map = new Map(this.layers.map((l) => [l.id, l]));
    const next = ids.map((id) => map.get(id)).filter(Boolean) as Layer[];
    if (next.length === this.layers.length) {
      this.layers = next;
    }
  }

  exportConfig(): RendererConfig {
    return exportConfig(this.layers);
  }

  importConfig(config: RendererConfig): void {
    const validated = importConfig(config);

    // Remove existing layers
    for (const l of [...this.layers]) {
      this.removeLayer(l.id);
    }

    // Add imported layers
    for (const layerConfig of validated.layers) {
      this.addLayer(layerConfig);
    }
  }

  registerBackend(backend: Backend): void {
    if (this.backends.has(backend.type)) {
      throw new Error(`Backend "${backend.type}" is already registered`);
    }
    backend.init(this.gl);
    this.backends.set(backend.type, backend);
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    for (const backend of this.backends.values()) {
      backend.destroy();
    }
    this.compositor.destroy();
  }

  // ── Internals ───────────────────────────────────────────

  private setupResize(): void {
    const resize = () => {
      this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
      this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.compositor.resize(this.canvas.width, this.canvas.height);
    };
    new ResizeObserver(resize).observe(this.canvas);
    resize();
  }

  private recompileDirty(): void {
    for (const id of this.dirty) {
      const layer = this.layers.find((l) => l.id === id);
      if (!layer) continue;

      const backend = this.backends.get(layer.backend);
      if (!backend) {
        console.warn(`No backend registered for type "${layer.backend}"`);
        continue;
      }

      try {
        backend.recompile(id, layer);
      } catch (e) {
        console.error(`Shader recompile failed for layer "${id}":`, e);
      }
    }
    this.dirty.clear();
  }

  private startLoop(): void {
    const loop = (now: DOMHighResTimeStamp) => {
      this.rafId = requestAnimationFrame(loop);

      if (this.dirty.size > 0) {
        this.recompileDirty();
      }

      const gl = this.gl;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const secs = (now - this.startTime) / 1000;

      if (this.layers.length === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      // Render each visible layer to its own FBO
      for (const layer of this.layers) {
        if (layer.visible === false) continue;

        const backend = this.backends.get(layer.backend);
        if (!backend) continue;

        const fbo = this.compositor.ensureFBO(layer.id, w, h);
        fbo.bind();
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        backend.render(layer, secs, w, h);
        fbo.unbind();
      }

      // Composite all layers to the canvas
      this.compositor.composite(this.layers, w, h);

      // FPS tracking
      this.frameCount++;
      if (now - this.lastFpsTime >= 500) {
        this.onFps?.(Math.round((this.frameCount * 1000) / (now - this.lastFpsTime)));
        this.frameCount = 0;
        this.lastFpsTime = now;
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }
}

/**
 * Creates a new renderer bound to the given canvas element.
 *
 * This is the main entry point for the library. It initializes a WebGL2 context,
 * registers the built-in noise backend, sets up FBO compositing, and starts a
 * `requestAnimationFrame` render loop. The canvas is automatically resized to
 * match its CSS dimensions at the device's pixel ratio.
 *
 * @param canvas - The `<canvas>` element to render into. Must support WebGL2.
 * @returns A renderer instance ready to accept layers.
 * @throws If the browser does not support WebGL2.
 *
 * @example
 * ```ts
 * import { createRenderer } from "rae-noise";
 *
 * const canvas = document.querySelector<HTMLCanvasElement>("#noise")!;
 * const renderer = createRenderer(canvas);
 *
 * renderer.addLayer({ noiseType: "fbm", scale: 4, speed: 0.2 });
 * renderer.addLayer({ noiseType: "worley", blendMode: "screen", opacity: 0.5 });
 *
 * // Later, clean up:
 * renderer.destroy();
 * ```
 *
 * @example Initialize from a JSON config designed in the demo:
 * ```ts
 * const config = { version: 1, layers: [
 *   { backend: "noise", noiseType: "fbm", scale: 4, speed: 0.2, ... }
 * ]};
 * const renderer = createRenderer(canvas);
 * renderer.importConfig(config);
 * ```
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  return new Renderer(canvas);
}
