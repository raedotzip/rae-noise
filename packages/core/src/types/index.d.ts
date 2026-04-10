// ── Shared enums / primitives ────────────────────────────

/**
 * Available noise generation algorithms.
 *
 * - `simplex` — Simplex noise, a gradient noise with fewer directional artifacts than Perlin.
 * - `perlin` — Classic Perlin noise, a widely-used gradient noise function.
 * - `worley` — Worley (cellular) noise, produces organic cell-like patterns.
 * - `fbm` — Fractal Brownian Motion, layers multiple octaves of simplex noise for natural-looking detail.
 * - `curl` — Curl noise, derived from the curl of a potential field — produces divergence-free, fluid-like patterns.
 */
export type NoiseType = "simplex" | "perlin" | "worley" | "fbm" | "curl";

/**
 * Blend modes that control how a layer composites onto the layers beneath it.
 *
 * - `add` — Additive blending, brightens the result by summing color values.
 * - `multiply` — Multiplies source and destination, darkening the result.
 * - `screen` — Inverse multiply, lightens the result (useful for glows).
 * - `overlay` — Combines multiply and screen depending on base luminance, increasing contrast.
 */
export type BlendMode = "add" | "multiply" | "screen" | "overlay";

/**
 * Flow types that control how noise coordinates evolve over time when animation is enabled.
 *
 * - `linear` — Translates the noise field along the {@link NoiseLayer.direction | direction} vector.
 * - `radial` — Expands the noise field outward from the center over time.
 * - `spiral` — Rotates the noise field around the center at a constant angular rate.
 * - `vortex` — Distance-dependent rotation where inner regions spin faster than outer regions.
 * - `turbulent` — Linear translation combined with simplex-based domain jitter for chaotic motion.
 */
export type FlowType = "linear" | "radial" | "spiral" | "vortex" | "turbulent";

/**
 * An RGB color triplet where each channel is a float in the range `[0, 1]`.
 *
 * @example
 * ```ts
 * const white: PaletteStop = [1, 1, 1];
 * const red:   PaletteStop = [1, 0, 0];
 * ```
 */
export type PaletteStop = [number, number, number];

// ── Backend type identifiers ────────────────────────────

/** Built-in backend type identifiers. */
export type BuiltinBackendType = "noise";

/**
 * Backend type string. Built-in types are strongly typed;
 * third-party backends use arbitrary strings.
 */
export type BackendType = BuiltinBackendType | (string & {});

// ── Scene graph / transforms ────────────────────────────

/**
 * A 2D affine transform describing a layer's position, rotation, and scale
 * relative to its parent (or the canvas, if parentless).
 *
 * Position is in normalized canvas coordinates `[0, 1]`, where `(0.5, 0.5)`
 * is the canvas center. Rotation is in radians. Scale is a uniform or
 * per-axis multiplier applied after position/rotation.
 *
 * Transforms compose Unity-style: a child's world transform is its local
 * transform multiplied by its parent's world transform, so moving a parent
 * moves all its children.
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
 * A resolved world-space transform passed to a backend's `render` method
 * after the scene graph has been walked for the current frame. Backends
 * that care about placement (sprites, particles) use this; backends that
 * fill the entire canvas (noise) can ignore it.
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
 * Base properties shared by every layer regardless of backend.
 * Backend-specific layer configs extend this interface.
 */
export interface LayerBase {
  /** Unique identifier assigned by the renderer when a layer is added. */
  id: string;
  /** Human-readable display name shown in the layer UI. */
  name: string;
  /** Which rendering backend handles this layer. */
  backend: BackendType;
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
   */
  parent?: string | null;
  /**
   * Local 2D transform relative to the parent (or canvas). Optional because
   * full-canvas backends like noise can ignore it; defaults to identity.
   */
  transform?: Transform2D;
}

/**
 * Configuration for a noise layer. Extends {@link LayerBase} with noise-specific
 * properties like noise algorithm, scale, flow type, palette, and warping.
 */
export interface NoiseLayerConfig extends LayerBase {
  backend: "noise";
  /** The noise algorithm used to generate this layer's pattern. */
  noiseType: NoiseType;
  /**
   * Spatial frequency multiplier. Higher values produce finer, more detailed noise;
   * lower values produce broader, smoother patterns. Typical range: `0.1` - `12`.
   */
  scale: number;
  /**
   * Number of octaves for fractal noise (`fbm` type only). Each octave adds
   * progressively finer detail at half the amplitude. Range: `1` - `8`.
   */
  octaves: number;
  /** Animation speed multiplier. `0` freezes the layer; higher values animate faster. */
  speed: number;
  /**
   * Normalized 2D direction vector `[x, y]` for linear and turbulent flow types.
   * Controls the direction the noise pattern moves when animated.
   */
  direction: [number, number];
  /** The animation flow pattern applied when {@link animate} is `true`. */
  flowType: FlowType;
  /**
   * Contrast adjustment applied to the noise output. `1.0` is neutral; values above
   * `1.0` increase contrast, values below soften it. Range: `0.1` - `4`.
   */
  contrast: number;
  /**
   * Brightness offset added after contrast is applied. `0` is neutral; positive
   * values brighten, negative values darken. Range: `-1` - `1`.
   */
  brightness: number;
  /**
   * Color palette used to map noise values to colors. The noise output `[0, 1]` is
   * interpolated across these stops in order. Minimum 2 stops, maximum 8.
   */
  palette: PaletteStop[];
  /** Whether this layer's noise coordinates evolve over time. */
  animate: boolean;
  /**
   * Domain warp intensity. Displaces the noise sampling coordinates using a secondary
   * simplex noise field, creating organic distortion. `0` disables warping.
   */
  warp: number;
  /**
   * Curl flow strength. Advects the sampling point along a curl noise vector field,
   * producing fluid-like displacement. `0` disables curl flow.
   */
  curlStrength: number;
}

/**
 * Discriminated union of all layer configuration types.
 * Each backend adds its own config interface to this union.
 * The `backend` field acts as the discriminant.
 */
export type Layer = NoiseLayerConfig;

/**
 * Legacy alias for backwards compatibility with pre-2.0 code.
 * @deprecated Use {@link NoiseLayerConfig} instead.
 */
export type NoiseLayer = NoiseLayerConfig;

// ── Compiled scene output ───────────────────────────────

/**
 * A layer compiled to a format the minimal runtime can replay directly.
 * Produced by {@link Backend.compile} at design-time; consumed by the
 * `rae-noise/runtime` entry point at production-time.
 *
 * The shape is deliberately opaque to the renderer — each backend decides
 * what its compiled payload looks like (shader source + uniform table for
 * noise, vertex buffer + instance data for particles, etc.).
 */
export interface CompiledLayer {
  /** Backend type that produced this layer. The runtime uses it to pick a replayer. */
  backend: BackendType;
  /** Shared compositor state baked at compile time. */
  opacity: number;
  blendMode: BlendMode;
  /** Backend-specific opaque payload (shaders, constants, uniform layout, etc.). */
  data: unknown;
  /** Optional world transform snapshot, if the scene is fully static. */
  worldTransform?: WorldTransform;
  /** Optional list of runtime-writable parameter handles exposed to the consumer. */
  exposed?: ExposedParam[];
}

/**
 * A parameter the user elected to keep adjustable at runtime. Exposed
 * params become `scene.set(name, value)` calls on the compiled runtime.
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
 * entry point. Contains no backend code, no shader builders, no validation —
 * just the final data and the ordered replay list.
 */
export interface CompiledScene {
  /** Runtime format version. Bump when the replay contract changes. */
  v: number;
  /** Ordered list of layers, bottom-to-top. */
  layers: CompiledLayer[];
}

// ── Backend interface ───────────────────────────────────

/**
 * Interface that all rendering backends must implement.
 * Each backend owns its own shaders, geometry, per-frame rendering logic,
 * AND its own config schema (serialize/deserialize) and compiled output
 * (compile). This makes backends the unit of schema ownership: adding a
 * new visual type is one new file with zero changes to shared code.
 *
 * @typeParam L - The layer config type this backend handles.
 */
export interface Backend<L extends LayerBase = LayerBase> {
  /** Unique backend type string (e.g., `"noise"`). */
  readonly type: BackendType;

  /**
   * Schema version of this backend's layer config. Bump when you rename,
   * remove, or change the semantics of a field — the deserializer uses
   * this to migrate older blobs to the current shape.
   */
  readonly schemaVersion: number;

  /**
   * Called once when the backend is first needed.
   * Should create programs, buffers, and other GPU resources.
   */
  init(gl: WebGL2RenderingContext): void;

  /**
   * Render a single layer to the currently bound framebuffer.
   * The compositor binds the layer's FBO before calling this.
   *
   * @param layer          - The layer configuration
   * @param time           - Elapsed time in seconds
   * @param width          - Render target width in pixels
   * @param height         - Render target height in pixels
   * @param worldTransform - Resolved world-space transform from the scene graph walk.
   *                         Full-canvas backends (noise) may ignore this.
   */
  render(
    layer: L,
    time: number,
    width: number,
    height: number,
    worldTransform: WorldTransform
  ): void;

  /**
   * Called when a layer's config changes. Returns `true` if the backend
   * needs to recompile its shader for this layer (structural change).
   */
  needsRecompile(prev: L, next: L): boolean;

  /**
   * Called when a structural layer config change requires a shader rebuild.
   * Only called after {@link needsRecompile} returns `true`.
   */
  recompile(layerId: string, layer: L): void;

  /**
   * Called when a layer is removed. Clean up any per-layer GPU resources.
   */
  removeLayer(layerId: string): void;

  /**
   * Release all GPU resources (programs, buffers, textures).
   */
  destroy(): void;

  // ── Schema ownership ──

  /**
   * Convert an in-memory layer config to the opaque `data` blob stored in
   * a {@link LayerEntry}. Strip the shared fields ({@link LayerBase}) —
   * the envelope stores those separately. Returning a plain JSON-safe
   * object is strongly recommended.
   */
  serialize(layer: L): unknown;

  /**
   * Inverse of {@link serialize}. Takes a raw `data` blob and the
   * `schemaVersion` it was written under, and returns a layer config
   * matching the current in-memory shape. Run migrations here.
   *
   * The caller supplies the shared {@link LayerBase} fields separately;
   * `deserialize` only needs to reconstruct the backend-specific parts.
   */
  deserialize(data: unknown, version: number): Omit<L, keyof LayerBase>;

  // ── Compilation ──

  /**
   * Compile a layer config to a {@link CompiledLayer} the minimal runtime
   * can replay. This is the design-time → production-time transition:
   * shader source is finalized, compile-time constants are inlined,
   * unused code paths are dead-code eliminated.
   *
   * Called by the top-level compiler, not by the live renderer.
   */
  compile(layer: L): CompiledLayer;
}

// ── Renderer config (JSON serialization) ────────────────

/**
 * Manifest envelope for a single layer in an exported config. The envelope
 * holds the shared compositor/scene-graph fields; the backend-specific
 * payload lives inside the opaque `data` blob, owned by the backend's
 * {@link Backend.serialize} / {@link Backend.deserialize} pair.
 *
 * This shape lets the serializer stay backend-agnostic: adding a new
 * backend doesn't require any changes to config or serializer code.
 */
export interface LayerEntry {
  /**
   * Layer id at export time. Preserved so parent references in
   * {@link parent} round-trip correctly. The renderer allocates fresh
   * ids on import and remaps parents via an old-id → new-id table.
   */
  id?: string;
  /** Backend type string. Used to look up the correct (de)serializer. */
  backend: BackendType;
  /** Backend schema version the `data` blob was written under. */
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
  /** Backend-specific payload, opaque to the serializer. */
  data: unknown;
}

/**
 * Serializable renderer configuration. Represents the complete state
 * of all layers, suitable for JSON export/import.
 *
 * Reserved top-level keys: `scene`, `timeline`, `assets`, `post`,
 * `bindings` — these are not implemented yet, but are reserved so future
 * additions aren't breaking changes.
 *
 * @example
 * ```ts
 * const config = renderer.exportConfig();
 * localStorage.setItem("my-preset", JSON.stringify(config));
 *
 * // Later:
 * const saved = JSON.parse(localStorage.getItem("my-preset")!);
 * renderer.importConfig(saved);
 * ```
 */
export interface RendererConfig {
  /** Manifest format version. Rarely changes — backend schemas version independently. */
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
 * ```
 */
export interface RaeNoiseRenderer {
  /**
   * Adds a new layer to the top of the stack.
   *
   * @param layer - Optional partial configuration merged with defaults.
   *                When `backend` is omitted, defaults to `"noise"`.
   * @returns The unique `id` assigned to the new layer.
   */
  addLayer: (layer?: Partial<Layer>) => string;

  /**
   * Removes a layer by its id. If the id is not found, this is a no-op.
   */
  removeLayer: (id: string) => void;

  /**
   * Patches one or more properties on an existing layer. Structural changes
   * trigger an automatic shader recompilation for that layer's backend.
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
   */
  reorderLayers: (ids: string[]) => void;

  /**
   * Exports the current layer stack as a serializable JSON config.
   * Layer ids are stripped — they are reassigned on import.
   */
  exportConfig: () => RendererConfig;

  /**
   * Replaces the current layer stack with the layers from a config object.
   * Validates and migrates the config if needed.
   */
  importConfig: (config: RendererConfig) => void;

  /**
   * Compile the current layer stack to a {@link CompiledScene} for
   * shipping to the minimal production runtime. Strips everything the
   * runtime doesn't need (builders, defaults, validation) and bakes
   * compile-time constants into shaders where possible.
   */
  compile: () => CompiledScene;

  /**
   * Reparents a layer in the scene graph. Passing `null` detaches the
   * layer so it resolves directly against the canvas. Throws if the
   * reparent would create a cycle.
   */
  setParent: (id: string, parentId: string | null) => void;

  /**
   * Patches a layer's local {@link Transform2D}. Does not trigger a
   * shader recompile — transforms are per-frame state.
   */
  setTransform: (id: string, patch: Partial<Transform2D>) => void;

  /**
   * Registers a custom rendering backend. Built-in backends (noise) are
   * registered automatically.
   */
  registerBackend: (backend: Backend) => void;

  /**
   * Optional callback invoked roughly every 500 ms with the current
   * frames-per-second count. Useful for performance overlays.
   */
  onFps?: (fps: number) => void;
}
