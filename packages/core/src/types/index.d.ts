/**
 * Available noise generation algorithms.
 *
 * - `simplex` — Simplex noise, a gradient noise with fewer directional artifacts than Perlin.
 * - `perlin` — Classic Perlin noise, a widely-used gradient noise function.
 * - `worley` — Worley (cellular) noise, produces organic cell-like patterns.
 * - `fbm` — Fractal Brownian Motion, layers multiple octaves of simplex noise for natural-looking detail.
 * - `curl` — Curl noise, derived from the curl of a potential field — produces divergence-free, fluid-like patterns.
 */
export type NoiseType  = 'simplex' | 'perlin' | 'worley' | 'fbm' | 'curl';

/**
 * Blend modes that control how a layer composites onto the layers beneath it.
 *
 * - `add` — Additive blending, brightens the result by summing color values.
 * - `multiply` — Multiplies source and destination, darkening the result.
 * - `screen` — Inverse multiply, lightens the result (useful for glows).
 * - `overlay` — Combines multiply and screen depending on base luminance, increasing contrast.
 */
export type BlendMode  = 'add' | 'multiply' | 'screen' | 'overlay';

/**
 * Flow types that control how noise coordinates evolve over time when animation is enabled.
 *
 * - `linear` — Translates the noise field along the {@link NoiseLayer.direction | direction} vector.
 * - `radial` — Expands the noise field outward from the center over time.
 * - `spiral` — Rotates the noise field around the center at a constant angular rate.
 * - `vortex` — Distance-dependent rotation where inner regions spin faster than outer regions.
 * - `turbulent` — Linear translation combined with simplex-based domain jitter for chaotic motion.
 */
export type FlowType   = 'linear' | 'radial' | 'spiral' | 'vortex' | 'turbulent';

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

/**
 * Configuration for a single noise layer. Multiple layers are composited together
 * by the renderer in stack order using each layer's {@link blendMode} and {@link opacity}.
 *
 * Create a layer with sensible defaults via {@link defaultLayer}, then override
 * individual properties as needed.
 */
export interface NoiseLayer {
  /** Unique identifier assigned by the renderer when a layer is added. */
  id:           string;
  /** Human-readable display name shown in the layer UI. */
  name:         string;
  /** The noise algorithm used to generate this layer's pattern. */
  noiseType:    NoiseType;
  /**
   * Spatial frequency multiplier. Higher values produce finer, more detailed noise;
   * lower values produce broader, smoother patterns. Typical range: `0.1` – `12`.
   */
  scale:        number;
  /**
   * Number of octaves for fractal noise (`fbm` type only). Each octave adds
   * progressively finer detail at half the amplitude. Range: `1` – `8`.
   */
  octaves:      number;
  /** Animation speed multiplier. `0` freezes the layer; higher values animate faster. */
  speed:        number;
  /**
   * Normalized 2D direction vector `[x, y]` for linear and turbulent flow types.
   * Controls the direction the noise pattern moves when animated.
   */
  direction:    [number, number];
  /** The animation flow pattern applied when {@link animate} is `true`. */
  flowType:     FlowType;
  /**
   * Contrast adjustment applied to the noise output. `1.0` is neutral; values above
   * `1.0` increase contrast, values below soften it. Range: `0.1` – `4`.
   */
  contrast:     number;
  /**
   * Brightness offset added after contrast is applied. `0` is neutral; positive
   * values brighten, negative values darken. Range: `-1` – `1`.
   */
  brightness:   number;
  /**
   * Color palette used to map noise values to colors. The noise output `[0, 1]` is
   * interpolated across these stops in order. Minimum 2 stops, maximum 8.
   */
  palette:      PaletteStop[];
  /**
   * Layer opacity for blending. `0` is fully transparent, `1` is fully opaque.
   */
  opacity:      number;
  /** How this layer composites onto the layers below it. */
  blendMode:    BlendMode;
  /** Whether this layer's noise coordinates evolve over time. */
  animate:      boolean;
  /**
   * Domain warp intensity. Displaces the noise sampling coordinates using a secondary
   * simplex noise field, creating organic distortion. `0` disables warping.
   */
  warp:         number;
  /**
   * Curl flow strength. Advects the sampling point along a curl noise vector field,
   * producing fluid-like displacement. `0` disables curl flow.
   */
  curlStrength: number;
}

/**
 * Public interface for the rae-noise renderer. Manages a stack of {@link NoiseLayer}s,
 * composites them in real time via WebGL2, and renders to the target canvas.
 *
 * Obtain an instance via {@link createRenderer}.
 *
 * @example
 * ```ts
 * import { createRenderer, defaultLayer } from "rae-noise";
 *
 * const renderer = createRenderer(document.querySelector("canvas")!);
 * renderer.addLayer({ ...defaultLayer(), noiseType: "fbm", scale: 4 });
 * ```
 */
export interface RaeNoiseRenderer {
  /**
   * Adds a new noise layer to the top of the stack.
   *
   * @param layer - Optional partial configuration merged with {@link defaultLayer} defaults.
   * @returns The unique `id` assigned to the new layer.
   */
  addLayer:    (layer?: Partial<NoiseLayer>) => string;
  /**
   * Removes a layer by its id. If the id is not found, this is a no-op.
   *
   * @param id - The layer id returned by {@link addLayer}.
   */
  removeLayer: (id: string) => void;
  /**
   * Patches one or more properties on an existing layer. Structural changes
   * (noise type, blend mode, octaves, warp, animate) trigger an automatic
   * shader recompilation.
   *
   * @param id - The layer id to update.
   * @param patch - A partial layer object with the properties to change.
   */
  updateLayer: (id: string, patch: Partial<NoiseLayer>) => void;
  /**
   * Returns a shallow copy of the current layer stack, ordered bottom to top.
   */
  getLayers:   () => NoiseLayer[];
  /**
   * Stops the render loop, releases the WebGL program and vertex array, and
   * disconnects the resize observer. Call this when the renderer is no longer needed.
   */
  destroy:     () => void;
  /**
   * Reorders layers to match the given id sequence. Ids not present in the
   * current stack are ignored. If the resulting order has fewer layers than
   * the current stack, the reorder is skipped entirely.
   *
   * @param ids - Layer ids in the desired order (bottom to top).
   */
  reorderLayers: (ids: string[]) => void;
}