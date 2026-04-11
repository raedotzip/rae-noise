/**
 * @file Core renderer orchestrator for rae-noise.
 *
 * This module contains the {@link Renderer} class and the {@link createRenderer}
 * factory function — the main entry point for the library. The renderer manages
 * a stack of visual layers, delegates rendering to registered plugins, and
 * composites the results via FBO ping-pong blending onto an HTML canvas.
 *
 * ## Architecture overview
 *
 * ```
 * createRenderer(canvas)
 *   └─ Renderer
 *        ├─ plugins: Map<PluginType, Plugin>     (registered visual plugins)
 *        ├─ layers: Layer[]                       (ordered bottom-to-top)
 *        ├─ compositor: Compositor                (FBO blending + gamma)
 *        └─ requestAnimationFrame loop
 *             ├─ recompile dirty layers
 *             ├─ resolve scene graph transforms
 *             ├─ for each visible layer → plugin.render() into FBO
 *             └─ compositor.composite() → canvas
 * ```
 *
 * ## Frame loop
 *
 * Every `requestAnimationFrame` tick:
 * 1. Any layers marked dirty have their shaders recompiled by the owning plugin.
 * 2. The scene graph is walked to resolve world-space transforms.
 * 3. Each visible layer is rendered to its own FBO by its plugin.
 * 4. The compositor blends all layer FBOs onto the canvas with blend modes + gamma.
 *
 * ## Plugin registration
 *
 * The built-in noise plugin is registered automatically. Custom plugins are
 * added via {@link RaeNoiseRenderer.registerPlugin}.
 *
 * @example
 * ```ts
 * import { createRenderer } from "rae-noise";
 *
 * const renderer = createRenderer(canvas);
 * renderer.addLayer({ noiseType: "fbm", scale: 4, speed: 0.2 });
 * renderer.addLayer({ noiseType: "worley", blendMode: "screen", opacity: 0.5 });
 *
 * // Clean up when done:
 * renderer.destroy();
 * ```
 *
 * @see {@link Plugin} for the interface plugins implement.
 * @see {@link Compositor} for the FBO compositing pipeline.
 * @see {@link resolveWorldTransforms} for scene graph resolution.
 */

import { compile as compileScene } from "../compiler/compile";
import { Compositor } from "../compositor/compositor";
import { exportConfig, hydrateLayer, importConfig } from "../config/serializer";
import { NoisePlugin } from "../plugin/noise/index";
import type {
  CompiledScene,
  Layer,
  NoiseLayerConfig,
  Plugin,
  PluginType,
  RaeNoiseRenderer,
  RendererConfig,
  Transform2D,
  WorldTransform,
} from "../types";
import { defaultLayer } from "./defaults";
import { identityTransform, resolveWorldTransforms } from "./sceneGraph";

/**
 * Core renderer orchestrator. Manages a stack of {@link Layer}s, delegates
 * rendering to registered {@link Plugin}s, and composites the results
 * via FBO ping-pong blending.
 *
 * Use {@link createRenderer} to obtain an instance.
 *
 * **Lifecycle:**
 * 1. Construction initializes WebGL2, registers the built-in noise plugin,
 *    sets up the compositor, and starts a `requestAnimationFrame` render loop.
 * 2. Adding or modifying layers marks them for recompilation on the next frame.
 * 3. Call {@link destroy} to stop the loop and free GPU resources.
 *
 * @see {@link RaeNoiseRenderer} for the public interface this class implements.
 */
export class Renderer implements RaeNoiseRenderer {
  /** The WebGL2 rendering context used for all GPU operations. */
  private gl: WebGL2RenderingContext;

  /** The target canvas element. */
  private canvas: HTMLCanvasElement;

  /** Ordered layer stack, bottom to top. */
  private layers: Layer[] = [];

  /** Registry of rendering plugins, keyed by plugin type string. */
  private plugins = new Map<PluginType, Plugin>();

  /** FBO compositor for blending layer outputs onto the canvas. */
  private compositor: Compositor;

  /** Set of layer ids that need shader recompilation on the next frame. */
  private dirty = new Set<string>();

  /** Current `requestAnimationFrame` handle, or `null` if stopped. */
  private rafId: number | null = null;

  /** Timestamp (ms) when the renderer was created, used for elapsed time. */
  private startTime = performance.now();

  /**
   * Optional callback invoked roughly every 500 ms with the current
   * frames-per-second count. Useful for performance overlays.
   */
  onFps?: (fps: number) => void;

  /** Frame counter for FPS calculation. */
  private frameCount = 0;

  /** Last time FPS was reported, in ms. */
  private lastFpsTime = performance.now();

  /**
   * Create a new renderer bound to the given canvas.
   *
   * @param canvas - The `<canvas>` element to render into. Must support WebGL2.
   * @throws If the browser does not support WebGL2.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.compositor = new Compositor(gl);

    // Register built-in plugins
    const noise = new NoisePlugin();
    noise.init(gl);
    this.plugins.set("noise", noise);

    this.setupResize();
    this.startLoop();
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Add a new layer to the top of the stack.
   *
   * @param partial - Optional partial config merged with defaults.
   *                  When `plugin` is omitted, defaults to `"noise"`.
   * @returns The unique id assigned to the new layer.
   */
  addLayer(partial: Partial<Layer> = {}): string {
    const id = crypto.randomUUID();
    const plugin = partial.plugin ?? "noise";

    let layer: Layer;
    if (plugin === "noise") {
      layer = {
        ...defaultLayer(),
        parent: null,
        transform: identityTransform(),
        ...partial,
        id,
        plugin: "noise",
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
        plugin,
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
   *
   * @param id       - The layer to reparent.
   * @param parentId - The new parent layer id, or `null` to detach.
   * @throws If the reparent would create a cycle.
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
   *
   * @param id    - The layer to update.
   * @param patch - Partial transform fields to merge.
   */
  setTransform(id: string, patch: Partial<Transform2D>): void {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    const current = layer.transform ?? identityTransform();
    layer.transform = { ...current, ...patch };
  }

  /**
   * Remove a layer by its id. Cleans up per-layer GPU resources.
   * No-op if the id is not found.
   *
   * @param id - The layer id to remove.
   */
  removeLayer(id: string): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;

    const layer = this.layers[idx];
    this.layers.splice(idx, 1);
    this.dirty.delete(id);

    const plugin = this.plugins.get(layer.plugin);
    if (plugin) plugin.removeLayer(id);
    this.compositor.removeFBO(id);
  }

  /**
   * Patch one or more properties on an existing layer. Structural changes
   * trigger automatic shader recompilation on the next frame.
   *
   * @param id    - The layer id to update.
   * @param patch - Partial layer config to merge.
   */
  updateLayer(id: string, patch: Partial<Layer>): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return;

    const prev = this.layers[idx];
    const next = { ...prev, ...patch } as Layer;
    this.layers[idx] = next;

    // biome-ignore lint/suspicious/noExplicitAny: plugin lookup is dynamic
    const plugin = this.plugins.get(next.plugin) as Plugin<any> | undefined;
    if (plugin?.needsRecompile(prev, next)) {
      this.dirty.add(id);
    }
  }

  /**
   * Returns a shallow copy of the current layer stack, ordered bottom to top.
   */
  getLayers(): Layer[] {
    return [...this.layers];
  }

  /**
   * Reorder layers to match the given id sequence.
   * Skipped if the ids don't fully match the current layer count.
   *
   * @param ids - Layer ids in the desired order (bottom to top).
   */
  reorderLayers(ids: string[]): void {
    const map = new Map(this.layers.map((l) => [l.id, l]));
    const next = ids.map((id) => map.get(id)).filter(Boolean) as Layer[];
    if (next.length === this.layers.length) {
      this.layers = next;
    }
  }

  /**
   * Export the current layer stack as a serializable JSON config.
   *
   * @returns A {@link RendererConfig} suitable for `JSON.stringify`.
   */
  exportConfig(): RendererConfig {
    return exportConfig(this.layers, this.plugins);
  }

  /**
   * Compile the current layer stack to a {@link CompiledScene} for the
   * minimal production runtime. This is the design-time → production-time
   * handoff: the compiled scene contains baked shader source and frozen
   * uniform tables, and does not depend on any plugin code, shader
   * builder, or validator at runtime.
   *
   * @returns A self-contained compiled scene.
   */
  compile(): CompiledScene {
    return compileScene(this.layers, this.plugins);
  }

  /**
   * Replace the current layer stack with layers from a config object.
   * Validates and migrates the config if needed.
   *
   * @param config - A config from {@link exportConfig} or constructed manually.
   */
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

      const layer = hydrateLayer(entry, this.plugins, newId);
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

  /**
   * Register a custom rendering plugin. Built-in plugins (noise) are
   * registered automatically.
   *
   * @param plugin - The plugin to register. Its type must be unique.
   * @throws If a plugin with the same type is already registered.
   */
  registerPlugin(plugin: Plugin): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Plugin "${plugin.type}" is already registered`);
    }
    plugin.init(this.gl);
    this.plugins.set(plugin.type, plugin);
  }

  /**
   * Stop the render loop, release all GPU resources, and disconnect
   * the resize observer.
   */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    for (const plugin of this.plugins.values()) {
      plugin.destroy();
    }
    this.compositor.destroy();
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Set up a ResizeObserver to keep the canvas backing store in sync
   * with CSS dimensions at the device pixel ratio.
   */
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

  /**
   * Recompile shaders for all layers in the dirty set. Called at the
   * start of each frame before rendering.
   */
  private recompileDirty(): void {
    for (const id of this.dirty) {
      const layer = this.layers.find((l) => l.id === id);
      if (!layer) continue;

      // biome-ignore lint/suspicious/noExplicitAny: plugin lookup is dynamic
      const plugin = this.plugins.get(layer.plugin) as Plugin<any> | undefined;
      if (!plugin) {
        console.warn(`No plugin registered for type "${layer.plugin}"`);
        continue;
      }

      try {
        plugin.recompile(id, layer);
      } catch (e) {
        console.error(`Shader recompile failed for layer "${id}":`, e);
      }
    }
    this.dirty.clear();
  }

  /**
   * Start the `requestAnimationFrame` render loop. Each tick recompiles
   * dirty layers, resolves transforms, renders each visible layer to its
   * FBO, composites them, and tracks FPS.
   */
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
      // ancestors. Plugins that fill the whole canvas (noise) can
      // ignore it; plugins that care about placement (sprites,
      // particles) use it to position their draw calls.
      const worldTransforms = resolveWorldTransforms(this.layers);

      // Render each visible layer to its own FBO
      for (const layer of this.layers) {
        if (layer.visible === false) continue;

        // biome-ignore lint/suspicious/noExplicitAny: plugin lookup is dynamic
        const plugin = this.plugins.get(layer.plugin) as Plugin<any> | undefined;
        if (!plugin) continue;

        const fbo = this.compositor.ensureFBO(layer.id, w, h);
        fbo.bind();
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const world = worldTransforms.get(layer.id) as WorldTransform;
        plugin.render(layer, secs, w, h, world);
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
 * registers the built-in noise plugin, sets up FBO compositing, and starts a
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
 *   { plugin: "noise", noiseType: "fbm", scale: 4, speed: 0.2, ... }
 * ]};
 * const renderer = createRenderer(canvas);
 * renderer.importConfig(config);
 * ```
 *
 * @see {@link RaeNoiseRenderer} for the full public API.
 * @see {@link Plugin} for creating custom rendering plugins.
 * @see {@link defaultLayer} for default layer configuration values.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  return new Renderer(canvas);
}
