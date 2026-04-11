/**
 * @file Type definitions for the rae-noise library.
 *
 * This file contains every public type, interface, and union exported by the
 * package. It is the single source of truth for the library's type surface
 * and is consumed by both the core implementation and downstream users.
 *
 * ## Organisation
 *
 * Types are grouped into logical sections:
 *
 * 1. **Shared primitives** — `NoiseType`, `BlendMode`, `FlowType`, `PaletteStop`
 * 2. **Plugin identifiers** — `BuiltinPluginType`, `PluginType`
 * 3. **Scene graph / transforms** — `Transform2D`, `WorldTransform`
 * 4. **Layer types** — `LayerBase`, `NoiseLayerConfig`, `Layer`, `NoiseLayer` (deprecated)
 * 5. **Compiled scene output** — `CompiledLayer`, `ExposedParam`, `CompiledScene`
 * 6. **Plugin interface** — `Plugin<L>`, the contract every rendering plugin implements
 * 7. **Renderer config** — `LayerEntry`, `RendererConfig` for JSON export/import
 * 8. **Public renderer interface** — `RaeNoiseRenderer`
 *
 * ## Naming conventions
 *
 * - Config interfaces are suffixed with `Config` (e.g. `NoiseLayerConfig`).
 * - Discriminated unions use a literal `plugin` field as the discriminant.
 * - Deprecated aliases carry a `@deprecated` tag pointing to the replacement.
 *
 * @see {@link https://raedotzip.github.io/rae-noise | Live demo}
 *
 * @packageDocumentation
 */

// ── Shared enums / primitives ────────────────────────────

/**
 * Available noise generation algorithms.
 *
 * Each algorithm produces a distinct visual character. Choose based on the
 * aesthetic you need:
 *
 * | Type       | Character                                                        |
 * |------------|------------------------------------------------------------------|
 * | `simplex`  | Smooth gradient noise with few directional artifacts              |
 * | `perlin`   | Classic gradient noise, slightly more grid-aligned than simplex   |
 * | `worley`   | Cellular / Voronoi patterns — organic cell-like shapes            |
 * | `fbm`      | Fractal Brownian Motion — multiple octaves of simplex for detail  |
 * | `curl`     | Divergence-free, fluid-like patterns from a curl vector field     |
 *
 * @example
 * ```ts
 * renderer.addLayer({ noiseType: "fbm", octaves: 6 });
 * ```
 */
export type NoiseType = "simplex" | "perlin" | "worley" | "fbm" | "curl";

/**
 * Blend modes that control how a layer composites onto the layers beneath it.
 *
 * The compositor implements these using WebGL blend state (for add, multiply,
 * screen) or a custom two-pass shader (for overlay, which needs the
 * destination color).
 *
 * | Mode       | Effect                                                            |
 * |------------|-------------------------------------------------------------------|
 * | `add`      | Additive — brightens by summing color values                      |
 * | `multiply` | Darkens — multiplies source and destination colors                |
 * | `screen`   | Lightens — inverse of multiply, useful for glows                  |
 * | `overlay`  | Contrast boost — combines multiply and screen by luminance        |
 *
 * @example
 * ```ts
 * renderer.addLayer({ blendMode: "screen", opacity: 0.5 });
 * ```
 */
export type BlendMode = "add" | "multiply" | "screen" | "overlay";

/**
 * Flow types that control how noise coordinates evolve over time when
 * animation is enabled.
 *
 * Flow types only take effect when {@link NoiseLayerConfig.animate} is `true`.
 * Some flow types use the {@link NoiseLayerConfig.direction} vector (linear,
 * turbulent), while others derive motion from the center point (radial,
 * spiral, vortex).
 *
 * | Type         | Motion                                                         |
 * |--------------|----------------------------------------------------------------|
 * | `linear`     | Translates along the {@link NoiseLayerConfig.direction} vector |
 * | `radial`     | Expands outward from the canvas center                         |
 * | `spiral`     | Rotates around the center at constant angular rate             |
 * | `vortex`     | Distance-dependent rotation — inner regions spin faster        |
 * | `turbulent`  | Linear translation + simplex-based domain jitter               |
 *
 * @example
 * ```ts
 * renderer.addLayer({
 *   flowType: "spiral",
 *   animate: true,
 *   speed: 0.5,
 * });
 * ```
 */
export type FlowType = "linear" | "radial" | "spiral" | "vortex" | "turbulent";

/**
 * An RGB color triplet where each channel is a float in the range `[0, 1]`.
 *
 * Palette stops define the color ramp that noise values are mapped through.
 * The noise output (a scalar in `[0, 1]`) is interpolated linearly across
 * the stops in order.
 *
 * @example
 * ```ts
 * const white: PaletteStop = [1, 1, 1];
 * const red:   PaletteStop = [1, 0, 0];
 *
 * // A sunset-like palette:
 * const palette: PaletteStop[] = [
 *   [0.05, 0.0, 0.15],  // deep purple
 *   [0.9, 0.3, 0.1],    // orange
 *   [1.0, 0.85, 0.3],   // yellow
 * ];
 * ```
 */
export type PaletteStop = [number, number, number];

// ── Plugin type identifiers ────────────────────────────

/**
 * Built-in plugin type identifiers shipped with the library.
 *
 * Currently only `"noise"` is built in. As new visual types are added
 * (particles, lines, images, etc.), they will be added to this union.
 */
export type BuiltinPluginType = "noise";

/**
 * Plugin type string used to identify which rendering plugin handles a layer.
 *
 * @remarks
 * The `(string & {})` trick preserves autocomplete for built-in plugin
 * identifiers (`"noise"`) while still allowing arbitrary third-party
 * identifiers without widening the union to plain `string`.
 *
 * @example
 * ```ts
 * // Built-in — autocomplete works:
 * const type: PluginType = "noise";
 *
 * // Custom third-party — also valid:
 * const custom: PluginType = "my-particles";
 * ```
 */
export type PluginType = BuiltinPluginType | (string & {});

// ── Scene graph / transforms ────────────────────────────

/**
 * A 2D affine transform describing a layer's position, rotation, and scale
 * relative to its parent (or the canvas, if parentless).
 *
 * Position is in normalized canvas coordinates `[0, 1]`, where `(0.5, 0.5)`
 * is the canvas center. Rotation is in radians. Scale is a per-axis
 * multiplier applied after position/rotation.
 *
 * Transforms compose Unity-style: a child's world transform is its local
 * transform multiplied by its parent's world transform, so moving a parent
 * moves all its children.
 *
 * @example
 * ```ts
 * // Offset a layer to the top-left quadrant, scaled down 50%:
 * renderer.setTransform(layerId, {
 *   position: [0.25, 0.25],
 *   scale: [0.5, 0.5],
 * });
 * ```
 *
 * @see {@link WorldTransform} for the resolved world-space version.
 * @see {@link RaeNoiseRenderer.setTransform} to update a layer's transform.
 * @see {@link RaeNoiseRenderer.setParent} to build transform hierarchies.
 */
export interface Transform2D {
  /** Position offset in normalized canvas coordinates (0..1). */
  position: [number, number];
  /** Rotation in radians, applied around the layer's anchor. */
  rotation: number;
  /** Scale factor `[sx, sy]`. `[1, 1]` is identity. */
  scale: [number, number];
  /** Rotation/scale pivot in normalized layer coordinates. Defaults to `[0.5, 0.5]` (center). */
  anchor?: [number, number];
}

/**
 * A resolved world-space transform passed to a plugin's {@link Plugin.render}
 * method after the scene graph has been walked for the current frame.
 *
 * Plugins that care about placement (sprites, particles) use this to position
 * their draw calls. Plugins that fill the entire canvas (noise) can safely
 * ignore it.
 *
 * @remarks
 * World transforms are recomputed every frame by {@link resolveWorldTransforms}.
 * They are read-only snapshots — mutating them has no effect on the scene.
 *
 * @see {@link Transform2D} for the local (pre-composition) version.
 */
export interface WorldTransform {
  /** Final world-space position in normalized canvas coordinates. */
  position: [number, number];
  /** Final world-space rotation in radians. */
  rotation: number;
  /** Final world-space scale `[sx, sy]`. */
  scale: [number, number];
  /** Anchor point used when resolving rotation/scale. */
  anchor: [number, number];
}

// ── Layer types ─────────────────────────────────────────

/**
 * Base properties shared by every layer regardless of plugin type.
 *
 * Plugin-specific layer configs extend this interface and narrow the
 * {@link plugin} field to a string literal for discriminated-union narrowing.
 *
 * @example
 * ```ts
 * // Every layer has these fields, regardless of plugin:
 * const base: LayerBase = {
 *   id: "abc-123",
 *   name: "background",
 *   plugin: "noise",
 *   opacity: 0.8,
 *   blendMode: "add",
 *   visible: true,
 * };
 * ```
 *
 * @see {@link NoiseLayerConfig} for the noise plugin's extension.
 */
export interface LayerBase {
  /** Unique identifier assigned by the renderer when a layer is added. */
  id: string;
  /** Human-readable display name shown in the layer UI. */
  name: string;
  /** Which rendering plugin handles this layer. */
  plugin: PluginType;
  /** Layer opacity for blending. `0` is fully transparent, `1` is fully opaque. */
  opacity: number;
  /** How this layer composites onto the layers below it. */
  blendMode: BlendMode;
  /** Whether this layer is rendered. Hidden layers consume no GPU time. */
  visible: boolean;
  /**
   * Optional parent layer id. When set, this layer's {@link transform} is
   * composed with the parent's world transform each frame, Unity-style.
   * A parentless layer is anchored directly to the canvas.
   *
   * @see {@link RaeNoiseRenderer.setParent}
   */
  parent?: string | null;
  /**
   * Local 2D transform relative to the parent (or canvas). Optional because
   * full-canvas plugins like noise can ignore it; defaults to identity.
   *
   * @see {@link RaeNoiseRenderer.setTransform}
   */
  transform?: Transform2D;
}

/**
 * Configuration for a noise layer. Extends {@link LayerBase} with noise-specific
 * properties like noise algorithm, scale, flow type, palette, and warping.
 *
 * The noise plugin is the built-in visual type. It renders a fullscreen quad
 * with a dynamically generated GLSL fragment shader that samples one of several
 * noise algorithms and maps the result through a color palette.
 *
 * @remarks
 * Properties are split into two categories by how they affect the GPU:
 *
 * **Structural** (trigger shader recompilation when changed):
 * `noiseType`, `flowType`, `octaves`, `animate`, `warp` (zero ↔ nonzero),
 * `curlStrength` (zero ↔ nonzero)
 *
 * **Uniform-only** (uploaded per-frame, no recompilation):
 * `scale`, `speed`, `direction`, `contrast`, `brightness`, `palette`,
 * `opacity`, `warp` (within nonzero range), `curlStrength` (within nonzero range)
 *
 * @example
 * ```ts
 * renderer.addLayer({
 *   noiseType: "fbm",
 *   octaves: 6,
 *   scale: 4,
 *   speed: 0.2,
 *   flowType: "spiral",
 *   palette: [
 *     [0.0, 0.0, 0.2],
 *     [0.2, 0.5, 1.0],
 *     [1.0, 1.0, 1.0],
 *   ],
 * });
 * ```
 *
 * @see {@link defaultLayer} for the full set of default values.
 * @see {@link NoiseType} for available noise algorithms.
 * @see {@link FlowType} for available animation flow patterns.
 */
export interface NoiseLayerConfig extends LayerBase {
  /** Discriminant — this layer is handled by the built-in noise plugin. */
  plugin: "noise";
  /** The noise algorithm used to generate this layer's pattern. */
  noiseType: NoiseType;
  /**
   * Spatial frequency multiplier. Higher values produce finer, more detailed noise;
   * lower values produce broader, smoother patterns. Typical range: `0.1` – `12`.
   */
  scale: number;
  /**
   * Number of octaves for fractal noise (`fbm` type only). Each octave adds
   * progressively finer detail at half the amplitude. Range: `1` – `8`.
   *
   * @remarks Only meaningful when {@link noiseType} is `"fbm"`. Ignored otherwise.
   */
  octaves: number;
  /**
   * Animation speed multiplier. `0` freezes the layer; higher values animate faster.
   *
   * @remarks Only takes effect when {@link animate} is `true`.
   */
  speed: number;
  /**
   * Normalized 2D direction vector `[x, y]` for linear and turbulent flow types.
   * Controls the direction the noise pattern moves when animated.
   *
   * @remarks Only meaningful for `"linear"` and `"turbulent"` flow types.
   */
  direction: [number, number];
  /**
   * The animation flow pattern applied when {@link animate} is `true`.
   *
   * @see {@link FlowType} for descriptions of each flow pattern.
   */
  flowType: FlowType;
  /**
   * Contrast adjustment applied to the noise output. `1.0` is neutral; values above
   * `1.0` increase contrast, values below soften it. Range: `0.1` – `4`.
   */
  contrast: number;
  /**
   * Brightness offset added after contrast is applied. `0` is neutral; positive
   * values brighten, negative values darken. Range: `-1` – `1`.
   */
  brightness: number;
  /**
   * Color palette used to map noise values to colors. The noise output `[0, 1]` is
   * interpolated across these stops in order. Minimum 2 stops, maximum 8.
   *
   * @see {@link PaletteStop} for the color triplet format.
   */
  palette: PaletteStop[];
  /** Whether this layer's noise coordinates evolve over time. */
  animate: boolean;
  /**
   * Domain warp intensity. Displaces the noise sampling coordinates using a secondary
   * simplex noise field, creating organic distortion. `0` disables warping.
   *
   * @remarks Enabling warp (changing from 0 to nonzero or vice versa) triggers
   * a shader recompilation because the warp GLSL chunk must be included/excluded.
   */
  warp: number;
  /**
   * Curl flow strength. Advects the sampling point along a curl noise vector field,
   * producing fluid-like displacement. `0` disables curl flow.
   *
   * @remarks Enabling curl (changing from 0 to nonzero or vice versa) triggers
   * a shader recompilation because the curl GLSL chunk must be included/excluded.
   */
  curlStrength: number;
}

/**
 * Discriminated union of all layer configuration types.
 *
 * The {@link plugin} field acts as the discriminant. When branching on
 * `layer.plugin`, TypeScript will automatically narrow the layer to the
 * corresponding config type.
 *
 * @remarks
 * Currently this is just {@link NoiseLayerConfig}, but the union will expand
 * as new plugins are added (particles, lines, images, etc.). Code that
 * switches on `layer.plugin` will get exhaustiveness checking for free.
 *
 * @example
 * ```ts
 * for (const layer of renderer.getLayers()) {
 *   if (layer.plugin === "noise") {
 *     console.log(layer.scale); // ← typed as number
 *   }
 * }
 * ```
 */
export type Layer = NoiseLayerConfig;

/**
 * Legacy alias for backwards compatibility with pre-2.0 code.
 *
 * @deprecated Use {@link NoiseLayerConfig} instead. This alias will be
 * removed in the next major version.
 */
export type NoiseLayer = NoiseLayerConfig;

// ── Compiled scene output ───────────────────────────────

/**
 * A layer compiled to a format the minimal runtime can replay directly.
 *
 * Produced by {@link Plugin.compile} at design-time; consumed by the
 * `rae-noise/runtime` entry point at production-time. The shape is
 * deliberately opaque to the renderer — each plugin decides what its
 * compiled payload looks like (shader source + uniform table for noise,
 * vertex buffer + instance data for particles, etc.).
 *
 * @example
 * ```ts
 * // The noise plugin's compiled data looks like:
 * {
 *   plugin: "noise",
 *   opacity: 1,
 *   blendMode: "add",
 *   data: {
 *     fragSrc: "...",      // final GLSL source
 *     constants: { ... },  // frozen uniform values
 *   },
 * }
 * ```
 *
 * @see {@link Plugin.compile} for the design-time → production-time transition.
 * @see {@link CompiledScene} for the top-level compiled output.
 */
export interface CompiledLayer {
  /** Plugin type that produced this layer. The runtime uses it to pick a replayer. */
  plugin: PluginType;
  /** Shared compositor state baked at compile time. */
  opacity: number;
  /** Blend mode baked at compile time. */
  blendMode: BlendMode;
  /** Plugin-specific opaque payload (shaders, constants, uniform layout, etc.). */
  data: unknown;
  /** Optional world transform snapshot, if the scene is fully static. */
  worldTransform?: WorldTransform;
  /** Optional list of runtime-writable parameter handles exposed to the consumer. */
  exposed?: ExposedParam[];
}

/**
 * A parameter the user elected to keep adjustable at runtime.
 *
 * Exposed params become `scene.set(name, value)` calls on the compiled
 * runtime, allowing consumers to tweak specific values (speed, palette,
 * opacity) without recompiling the scene.
 *
 * @example
 * ```ts
 * // A speed parameter exposed for runtime control:
 * const param: ExposedParam = {
 *   name: "background-speed",
 *   path: "speed",
 *   initial: 0.3,
 * };
 * ```
 */
export interface ExposedParam {
  /** Stable name the runtime consumer uses to address the handle. */
  name: string;
  /** Path into the original layer config (e.g., `"speed"`, `"palette.0"`). */
  path: string;
  /** Current value at compile time; the runtime starts from this. */
  initial: unknown;
}

/**
 * A fully compiled scene, ready to be handed to the `rae-noise/runtime`
 * entry point.
 *
 * Contains no plugin code, no shader builders, no validation — just the
 * final data and the ordered replay list. This is the design-time →
 * production-time handoff format.
 *
 * @example
 * ```ts
 * const scene: CompiledScene = renderer.compile();
 * const json = JSON.stringify(scene);
 * // Ship `json` to production — the runtime replays it without any
 * // plugin code, builder, or validator.
 * ```
 *
 * @see {@link RaeNoiseRenderer.compile} to produce a compiled scene.
 */
export interface CompiledScene {
  /** Runtime format version. Bump when the replay contract changes. */
  v: number;
  /** Ordered list of layers, bottom-to-top. */
  layers: CompiledLayer[];
}

// ── Plugin interface ───────────────────────────────────

/**
 * Interface implemented by rendering plugins.
 *
 * A plugin is a self-contained visual module that knows how to render one
 * type of visual (noise, particles, lines, etc.). The renderer orchestrates
 * plugins and composites their output; each plugin manages its own shaders,
 * geometry, and per-frame rendering logic.
 *
 * @typeParam L - The layer config type this plugin handles. Must extend
 *               {@link LayerBase} so the renderer can access shared fields.
 *
 * @remarks
 * ## Lifecycle
 *
 * 1. {@link init} — called once when the plugin is first registered
 * 2. {@link render} — called every frame for each visible layer owned by this plugin
 * 3. {@link needsRecompile} — checked when a layer's config changes
 * 4. {@link recompile} — called when structural changes require a shader rebuild
 * 5. {@link removeLayer} — called when a layer is deleted
 * 6. {@link destroy} — called when the renderer shuts down
 *
 * ## Creating a custom plugin
 *
 * ```ts
 * import type { Plugin, LayerBase } from "rae-noise";
 *
 * interface ParticleLayerConfig extends LayerBase {
 *   plugin: "particles";
 *   count: number;
 *   size: number;
 * }
 *
 * class ParticlePlugin implements Plugin<ParticleLayerConfig> {
 *   readonly type = "particles";
 *   readonly schemaVersion = 1;
 *
 *   init(gl: WebGL2RenderingContext) { ... }
 *   render(layer, time, w, h, worldTransform) { ... }
 *   needsRecompile(prev, next) { return prev.count !== next.count; }
 *   recompile(id, layer) { ... }
 *   removeLayer(id) { ... }
 *   destroy() { ... }
 *   serialize(layer) { return { count: layer.count, size: layer.size }; }
 *   deserialize(data, version) { ... }
 *   compile(layer) { ... }
 * }
 *
 * // Register with the renderer:
 * renderer.registerPlugin(myParticlePlugin);
 * renderer.addLayer({ plugin: "particles", count: 1000, size: 2 });
 * ```
 *
 * @see {@link RaeNoiseRenderer.registerPlugin} to register a custom plugin.
 * @see The built-in noise plugin at `src/plugin/noise/` for a complete example.
 */
export interface Plugin<L extends LayerBase = LayerBase> {
  /**
   * Unique plugin type string (e.g., `"noise"`, `"particles"`).
   * Must match the {@link LayerBase.plugin} discriminant on layers this plugin owns.
   */
  readonly type: PluginType;

  /**
   * Schema version of this plugin's layer config. Bump when you rename,
   * remove, or change the semantics of a field — the deserializer uses
   * this to migrate older blobs to the current shape.
   *
   * @remarks
   * Each plugin versions its schema independently of the renderer config
   * envelope version. This means you can evolve your plugin's data format
   * without bumping the top-level config version.
   */
  readonly schemaVersion: number;

  /**
   * Called once when the plugin is first registered with the renderer.
   * Create WebGL programs, buffers, textures, and other GPU resources here.
   *
   * @param gl - The WebGL2 rendering context shared by all plugins.
   */
  init(gl: WebGL2RenderingContext): void;

  /**
   * Render a single layer to the currently bound framebuffer.
   * The compositor binds the layer's FBO before calling this.
   *
   * @param layer          - The layer configuration with all current values.
   * @param time           - Elapsed time in seconds since the renderer started.
   * @param width          - Render target width in physical pixels.
   * @param height         - Render target height in physical pixels.
   * @param worldTransform - Resolved world-space transform from the scene graph walk.
   *                         Full-canvas plugins (noise) may ignore this.
   */
  render(
    layer: L,
    time: number,
    width: number,
    height: number,
    worldTransform: WorldTransform
  ): void;

  /**
   * Called when a layer's config changes. Return `true` if the plugin
   * needs to recompile its shader / rebuild resources for this layer.
   *
   * @remarks
   * Only check structural fields that affect the shader. Uniform-only
   * changes (speed, opacity, palette values) should return `false` —
   * they are uploaded per-frame without recompilation.
   *
   * @param prev - The layer config before the update.
   * @param next - The layer config after the update.
   * @returns `true` if {@link recompile} should be called.
   */
  needsRecompile(prev: L, next: L): boolean;

  /**
   * Called when a structural layer config change requires a shader rebuild.
   * Only called after {@link needsRecompile} returns `true`.
   *
   * @param layerId - The unique id of the layer being recompiled.
   * @param layer   - The updated layer configuration.
   */
  recompile(layerId: string, layer: L): void;

  /**
   * Called when a layer is removed. Clean up any per-layer GPU resources
   * (programs, textures, buffers) associated with this layer id.
   *
   * @param layerId - The unique id of the removed layer.
   */
  removeLayer(layerId: string): void;

  /**
   * Release all GPU resources owned by this plugin (programs, buffers,
   * textures, VAOs). Called when the renderer is destroyed.
   */
  destroy(): void;

  // ── Schema ownership ──

  /**
   * Convert an in-memory layer config to the opaque `data` blob stored in
   * a {@link LayerEntry}. Strip the shared fields ({@link LayerBase}) —
   * the envelope stores those separately.
   *
   * @remarks
   * Return a plain JSON-safe object. Avoid `Float32Array`, `Map`, or other
   * non-serializable types — the data must survive `JSON.stringify`.
   *
   * @param layer - The full layer config including shared fields.
   * @returns An opaque, JSON-safe blob containing only plugin-specific data.
   *
   * @see {@link deserialize} for the inverse operation.
   */
  serialize(layer: L): unknown;

  /**
   * Inverse of {@link serialize}. Takes a raw `data` blob and the
   * `schemaVersion` it was written under, and returns the plugin-specific
   * fields matching the current in-memory shape.
   *
   * @remarks
   * Run migrations here. Add `if (version < N)` blocks for each schema
   * bump to rewrite the blob in place before extracting fields.
   *
   * The caller supplies the shared {@link LayerBase} fields separately;
   * `deserialize` only needs to reconstruct the plugin-specific parts.
   *
   * @param data    - The opaque blob from {@link serialize}.
   * @param version - The schema version the blob was written under.
   * @returns Plugin-specific fields (everything except {@link LayerBase} fields).
   *
   * @see {@link serialize} for the forward operation.
   */
  deserialize(data: unknown, version: number): Omit<L, keyof LayerBase>;

  // ── Compilation ──

  /**
   * Compile a layer config to a {@link CompiledLayer} the minimal runtime
   * can replay. This is the design-time → production-time transition:
   * shader source is finalized, compile-time constants are inlined,
   * unused code paths are dead-code eliminated.
   *
   * @remarks
   * Called by the top-level compiler, not by the live renderer. The
   * compiled output should be self-contained — the runtime does not
   * have access to the plugin's builder, chunks, or schema.
   *
   * @param layer - The full layer config to compile.
   * @returns A compiled layer ready for the production runtime.
   *
   * @see {@link CompiledLayer} for the output format.
   * @see {@link RaeNoiseRenderer.compile} for the top-level entry point.
   */
  compile(layer: L): CompiledLayer;
}

// ── Renderer config (JSON serialization) ────────────────

/**
 * Manifest envelope for a single layer in an exported config.
 *
 * The envelope holds the shared compositor/scene-graph fields; the
 * plugin-specific payload lives inside the opaque {@link data} blob,
 * owned by the plugin's {@link Plugin.serialize} / {@link Plugin.deserialize}
 * pair.
 *
 * This shape lets the serializer stay plugin-agnostic: adding a new
 * plugin doesn't require any changes to config or serializer code.
 *
 * @example
 * ```ts
 * const entry: LayerEntry = {
 *   plugin: "noise",
 *   bv: 1,
 *   name: "background",
 *   opacity: 0.8,
 *   blendMode: "add",
 *   data: { noiseType: "fbm", scale: 4, ... },
 * };
 * ```
 *
 * @see {@link RendererConfig} for the top-level config envelope.
 * @see {@link Plugin.serialize} for producing the `data` blob.
 */
export interface LayerEntry {
  /**
   * Layer id at export time. Preserved so parent references in
   * {@link parent} round-trip correctly. The renderer allocates fresh
   * ids on import and remaps parents via an old-id → new-id table.
   */
  id?: string;
  /** Plugin type string. Used to look up the correct (de)serializer. */
  plugin: PluginType;
  /** Plugin schema version the `data` blob was written under. */
  bv: number;
  /** Human-readable name for the layer UI. */
  name?: string;
  /** Compositor opacity `[0, 1]`. */
  opacity?: number;
  /** Compositor blend mode. */
  blendMode?: BlendMode;
  /** Whether this layer is rendered. */
  visible?: boolean;
  /** Parent layer id for scene-graph transform inheritance. */
  parent?: string | null;
  /** Local 2D transform; omitted if identity. */
  transform?: Transform2D;
  /** Plugin-specific payload, opaque to the serializer. */
  data: unknown;
}

/**
 * Serializable renderer configuration. Represents the complete state
 * of all layers, suitable for JSON export/import.
 *
 * @remarks
 * Reserved top-level keys (`scene`, `timeline`, `assets`, `post`, `bindings`)
 * are not implemented yet, but are reserved so future additions don't
 * require a breaking version bump.
 *
 * @example
 * ```ts
 * // Save to localStorage:
 * const config = renderer.exportConfig();
 * localStorage.setItem("my-preset", JSON.stringify(config));
 *
 * // Restore later:
 * const saved = JSON.parse(localStorage.getItem("my-preset")!);
 * renderer.importConfig(saved);
 * ```
 *
 * @see {@link RaeNoiseRenderer.exportConfig} to produce a config.
 * @see {@link RaeNoiseRenderer.importConfig} to consume a config.
 */
export interface RendererConfig {
  /** Manifest format version. Rarely changes — plugin schemas version independently. */
  version: number;
  /** Ordered layer stack (bottom to top). */
  layers: LayerEntry[];
  /** Reserved for future scene-level state (background, tone mapping, etc.). */
  scene?: unknown;
  /** Reserved for future timeline / keyframe data. */
  timeline?: unknown;
  /** Reserved for future asset manifest (images, videos, LUTs). */
  assets?: unknown;
  /** Reserved for future post-processing pass list. */
  post?: unknown;
  /** Reserved for future parameter-binding / expression system. */
  bindings?: unknown;
}

// ── Public renderer interface ───────────────────────────

/**
 * Public interface for the rae-noise renderer. Manages a stack of layers,
 * composites them in real time via WebGL2, and renders to the target canvas.
 *
 * Obtain an instance via {@link createRenderer}.
 *
 * @example
 * ```ts
 * import { createRenderer, defaultLayer } from "rae-noise";
 *
 * const renderer = createRenderer(document.querySelector("canvas")!);
 * renderer.addLayer({ noiseType: "fbm", scale: 4 });
 * renderer.addLayer({ noiseType: "worley", blendMode: "screen", opacity: 0.5 });
 *
 * // Clean up when done:
 * renderer.destroy();
 * ```
 *
 * @see {@link createRenderer} to create an instance.
 * @see {@link defaultLayer} for default layer configuration values.
 */
export interface RaeNoiseRenderer {
  /**
   * Adds a new layer to the top of the stack.
   *
   * @param layer - Optional partial configuration merged with defaults.
   *                When `plugin` is omitted, defaults to `"noise"`.
   * @returns The unique `id` assigned to the new layer.
   *
   * @example
   * ```ts
   * const id = renderer.addLayer({ noiseType: "fbm", scale: 4 });
   * ```
   */
  addLayer: (layer?: Partial<Layer>) => string;

  /**
   * Removes a layer by its id. If the id is not found, this is a no-op.
   *
   * @param id - The layer id returned by {@link addLayer}.
   */
  removeLayer: (id: string) => void;

  /**
   * Patches one or more properties on an existing layer. Structural changes
   * trigger an automatic shader recompilation for that layer's plugin.
   *
   * @param id    - The layer id to update.
   * @param patch - A partial layer config merged onto the existing layer.
   *
   * @example
   * ```ts
   * renderer.updateLayer(id, { scale: 8, speed: 0.5 });
   * ```
   */
  updateLayer: (id: string, patch: Partial<Layer>) => void;

  /**
   * Returns a shallow copy of the current layer stack, ordered bottom to top.
   */
  getLayers: () => Layer[];

  /**
   * Stops the render loop, releases all GPU resources, and disconnects
   * the resize observer. Call this when the renderer is no longer needed.
   */
  destroy: () => void;

  /**
   * Reorders layers to match the given id sequence. If the resulting order
   * has fewer layers than the current stack, the reorder is skipped.
   *
   * @param ids - Layer ids in the desired order (bottom to top).
   */
  reorderLayers: (ids: string[]) => void;

  /**
   * Exports the current layer stack as a serializable JSON config.
   *
   * @returns A {@link RendererConfig} that can be `JSON.stringify`'d and saved.
   *
   * @see {@link importConfig} to restore a config.
   */
  exportConfig: () => RendererConfig;

  /**
   * Replaces the current layer stack with the layers from a config object.
   * Validates and migrates the config if needed.
   *
   * @param config - A config object produced by {@link exportConfig} or constructed manually.
   *
   * @see {@link exportConfig} to produce a config.
   */
  importConfig: (config: RendererConfig) => void;

  /**
   * Compile the current layer stack to a {@link CompiledScene} for
   * shipping to the minimal production runtime. Strips everything the
   * runtime doesn't need (builders, defaults, validation) and bakes
   * compile-time constants into shaders where possible.
   *
   * @returns A self-contained compiled scene.
   *
   * @see {@link CompiledScene} for the output format.
   */
  compile: () => CompiledScene;

  /**
   * Reparents a layer in the scene graph. Passing `null` detaches the
   * layer so it resolves directly against the canvas. Throws if the
   * reparent would create a cycle.
   *
   * @param id       - The layer to reparent.
   * @param parentId - The new parent layer id, or `null` to detach.
   * @throws If the reparent would create a cycle in the scene graph.
   */
  setParent: (id: string, parentId: string | null) => void;

  /**
   * Patches a layer's local {@link Transform2D}. Does not trigger a
   * shader recompile — transforms are per-frame state.
   *
   * @param id    - The layer to update.
   * @param patch - Partial transform fields to merge.
   */
  setTransform: (id: string, patch: Partial<Transform2D>) => void;

  /**
   * Registers a custom rendering plugin. Built-in plugins (noise) are
   * registered automatically by {@link createRenderer}.
   *
   * @param plugin - The plugin instance to register. Its {@link Plugin.type}
   *                 must be unique — registering a duplicate type throws.
   * @throws If a plugin with the same type is already registered.
   *
   * @example
   * ```ts
   * renderer.registerPlugin(new ParticlePlugin());
   * renderer.addLayer({ plugin: "particles", count: 1000 });
   * ```
   *
   * @see {@link Plugin} for the interface custom plugins must implement.
   */
  registerPlugin: (plugin: Plugin) => void;

  /**
   * Optional callback invoked roughly every 500 ms with the current
   * frames-per-second count. Useful for performance overlays.
   *
   * @example
   * ```ts
   * renderer.onFps = (fps) => {
   *   document.getElementById("fps")!.textContent = `${fps} FPS`;
   * };
   * ```
   */
  onFps?: (fps: number) => void;
}
