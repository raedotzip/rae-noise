import { NoiseBackend } from "../backend/noise/index";
import { compile as compileScene } from "../compiler/compile";
import { Compositor } from "../compositor/compositor";
import { exportConfig, hydrateLayer, importConfig } from "../config/serializer";
import type {
  Backend,
  BackendType,
  CompiledScene,
  Layer,
  NoiseLayerConfig,
  RaeNoiseRenderer,
  RendererConfig,
  Transform2D,
  WorldTransform,
} from "../types";
import { defaultLayer } from "./defaults";
import { identityTransform, resolveWorldTransforms } from "./sceneGraph";

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
      layer = {
        ...defaultLayer(),
        parent: null,
        transform: identityTransform(),
        ...partial,
        id,
        backend: "noise",
      } as NoiseLayerConfig;
    } else {
      layer = {
        name: "layer",
        opacity: 1.0,
        blendMode: "add" as const,
        visible: true,
        parent: null,
        transform: identityTransform(),
        ...partial,
        id,
        backend,
      } as Layer;
    }

    this.layers.push(layer);
    this.dirty.add(id);
    return id;
  }

  /**
   * Reparents a layer within the scene graph. Passing `null` detaches the
   * layer so its transform is resolved directly against the canvas.
   *
   * Cycles are rejected — you cannot make a layer a descendant of itself.
   */
  setParent(id: string, parentId: string | null): void {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;

    if (parentId != null) {
      // Walk up from parentId; if we hit `id`, we'd form a cycle.
      let cursor: string | null = parentId;
      while (cursor != null) {
        if (cursor === id) {
          throw new Error(`setParent: would create a cycle (${id} -> ${parentId})`);
        }
        const next: Layer | undefined = this.layers.find((l) => l.id === cursor);
        cursor = next?.parent ?? null;
      }
    }

    layer.parent = parentId;
  }

  /**
   * Patches a layer's local {@link Transform2D}. Does not trigger a
   * shader recompile — transforms are per-frame state.
   */
  setTransform(id: string, patch: Partial<Transform2D>): void {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    const current = layer.transform ?? identityTransform();
    layer.transform = { ...current, ...patch };
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

    // biome-ignore lint/suspicious/noExplicitAny: backend lookup is dynamic
    const backend = this.backends.get(next.backend) as Backend<any> | undefined;
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
    return exportConfig(this.layers, this.backends);
  }

  /**
   * Compile the current layer stack to a {@link CompiledScene} for the
   * minimal production runtime. This is the design-time → production-time
   * handoff: the compiled scene contains baked shader source and frozen
   * uniform tables, and does not depend on any backend code, shader
   * builder, or validator at runtime.
   */
  compile(): CompiledScene {
    return compileScene(this.layers, this.backends);
  }

  importConfig(config: RendererConfig): void {
    const validated = importConfig(config);

    // Remove existing layers
    for (const l of [...this.layers]) {
      this.removeLayer(l.id);
    }

    // The envelope stores parent ids from the exporting session. Allocate
    // fresh ids on import and remap parents using an old-id → new-id map.
    // Parent ids that can't be resolved (e.g., orphaned references) are
    // dropped silently; layers without a parent stay parentless.
    const idMap = new Map<string | null | undefined, string | null>();
    idMap.set(null, null);
    idMap.set(undefined, null);

    const added: Layer[] = [];
    for (const entry of validated.layers) {
      const newId = crypto.randomUUID();
      if (typeof entry.id === "string") idMap.set(entry.id, newId);

      const layer = hydrateLayer(entry, this.backends, newId);
      this.layers.push(layer);
      this.dirty.add(newId);
      added.push(layer);
    }

    // Second pass: remap parent references.
    for (const layer of added) {
      if (layer.parent != null) {
        layer.parent = idMap.get(layer.parent) ?? null;
      }
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

      // biome-ignore lint/suspicious/noExplicitAny: backend lookup is dynamic
      const backend = this.backends.get(layer.backend) as Backend<any> | undefined;
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

      // Resolve the scene graph once per frame: every layer gets a
      // world-space transform composed from its local transform and its
      // ancestors. Backends that fill the whole canvas (noise) can
      // ignore it; backends that care about placement (sprites,
      // particles) use it to position their draw calls.
      const worldTransforms = resolveWorldTransforms(this.layers);

      // Render each visible layer to its own FBO
      for (const layer of this.layers) {
        if (layer.visible === false) continue;

        // biome-ignore lint/suspicious/noExplicitAny: backend lookup is dynamic
        const backend = this.backends.get(layer.backend) as Backend<any> | undefined;
        if (!backend) continue;

        const fbo = this.compositor.ensureFBO(layer.id, w, h);
        fbo.bind();
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const world = worldTransforms.get(layer.id) as WorldTransform;
        backend.render(layer, secs, w, h, world);
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
