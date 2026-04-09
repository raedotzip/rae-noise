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

// ── Backend interface ───────────────────────────────────

/**
 * Interface that all rendering backends must implement.
 * Each backend owns its own shaders, geometry, and per-frame rendering logic.
 *
 * @typeParam L - The layer config type this backend handles.
 */
export interface Backend<L extends LayerBase = LayerBase> {
  /** Unique backend type string (e.g., `"noise"`). */
  readonly type: BackendType;

  /**
   * Called once when the backend is first needed.
   * Should create programs, buffers, and other GPU resources.
   */
  init(gl: WebGL2RenderingContext): void;

  /**
   * Render a single layer to the currently bound framebuffer.
   * The compositor binds the layer's FBO before calling this.
   *
   * @param layer  - The layer configuration
   * @param time   - Elapsed time in seconds
   * @param width  - Render target width in pixels
   * @param height - Render target height in pixels
   */
  render(layer: L, time: number, width: number, height: number): void;

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
}

// ── Renderer config (JSON serialization) ────────────────

/**
 * Serializable renderer configuration. Represents the complete state
 * of all layers, suitable for JSON export/import.
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
  /** Schema version for forward-compatible migrations. */
  version: number;
  /** Ordered layer stack (bottom to top), without runtime-only `id` fields. */
  layers: Omit<Layer, "id">[];
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
