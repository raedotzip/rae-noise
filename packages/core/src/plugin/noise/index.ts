/**
 * @file Built-in noise rendering plugin for rae-noise.
 *
 * This module implements the {@link NoisePlugin} class, which is the default
 * visual plugin shipped with the library. It renders procedural noise patterns
 * (simplex, perlin, worley, fbm, curl) to fullscreen quads using dynamically
 * generated GLSL ES 3.0 fragment shaders.
 *
 * ## How it works
 *
 * 1. When a noise layer is first rendered, the plugin generates a fragment
 *    shader tailored to that layer's config (noise type, flow type, octave
 *    count, warp/curl toggles) via {@link buildNoiseShader}.
 * 2. The compiled program is cached per layer id. Subsequent frames reuse it.
 * 3. Per-frame, the plugin uploads time-varying uniforms (time, speed, scale,
 *    palette, etc.) and draws a fullscreen quad.
 * 4. When a structural config change occurs (e.g., noise type changes), the
 *    old program is deleted and a new one is compiled.
 *
 * ## Structural vs. uniform-only changes
 *
 * Not every config change requires a shader recompile. The plugin distinguishes:
 *
 * - **Structural** (triggers recompile): `noiseType`, `flowType`, `octaves`,
 *   `animate`, `warp` (zero ↔ nonzero), `curlStrength` (zero ↔ nonzero)
 * - **Uniform-only** (per-frame upload, no recompile): `speed`, `scale`,
 *   `direction`, `contrast`, `brightness`, `palette`, `opacity`, `warp`
 *   (within nonzero range), `curlStrength` (within nonzero range)
 *
 * ## Schema versioning
 *
 * The noise plugin owns its serialization format via {@link NOISE_SCHEMA_VERSION}.
 * When fields are added, renamed, or change semantics, bump the version and
 * add a migration step in {@link NoisePlugin.deserialize}.
 *
 * @example
 * ```ts
 * // The noise plugin is registered automatically by createRenderer().
 * // You don't need to import or instantiate it directly:
 * import { createRenderer } from "rae-noise";
 * const renderer = createRenderer(canvas);
 * renderer.addLayer({ noiseType: "fbm", scale: 4 });
 * ```
 *
 * @see {@link Plugin} for the interface this class implements.
 * @see {@link buildNoiseShader} for the GLSL shader generation logic.
 * @see {@link NoiseLayerConfig} for all configurable layer properties.
 */

import type {
  CompiledLayer,
  LayerBase,
  NoiseLayerConfig,
  Plugin,
  WorldTransform,
} from "../../types";
import { UniformCache, linkProgram } from "../../webgl/program";
import { FULLSCREEN_VERT, bindQuadToProgram, createFullscreenQuad } from "../../webgl/quad";
import { MAX_PALETTE_STOPS, buildNoiseShader } from "./builder";

/**
 * Schema version for {@link NoiseLayerConfig} serialization.
 *
 * Bump when fields are added, renamed, or change semantics, then extend
 * {@link NoisePlugin.deserialize} with a migration step for the old version.
 *
 * @example
 * ```ts
 * // In deserialize(), handle older versions:
 * if (version < 2) {
 *   // Migrate from v1 to v2 shape
 *   d.newField = d.oldField ?? defaultValue;
 * }
 * ```
 */
export const NOISE_SCHEMA_VERSION = 1;

/**
 * Internal cache entry for a compiled WebGL program and its uniform locations.
 * One entry exists per visible noise layer.
 */
interface LayerProgram {
  /** The linked WebGL program (vertex + fragment shader). */
  program: WebGLProgram;
  /** Memoized uniform location cache for this program. */
  uniforms: UniformCache;
}

/**
 * Built-in noise rendering plugin.
 *
 * Implements the {@link Plugin} interface for {@link NoiseLayerConfig} layers.
 * Manages per-layer GLSL programs, fullscreen quad geometry, and uniform
 * uploads. Registered automatically by {@link createRenderer}.
 *
 * @remarks
 * This class is exported so tests and advanced users can access the noise
 * plugin directly. In normal usage, you interact with it through the
 * renderer's public API — not by instantiating `NoisePlugin` yourself.
 *
 * @see {@link Plugin} for the full lifecycle contract.
 * @see {@link buildNoiseShader} for the dynamic GLSL generation.
 */
export class NoisePlugin implements Plugin<NoiseLayerConfig> {
  /** Plugin type identifier — matches the `plugin: "noise"` discriminant on layers. */
  readonly type = "noise" as const;

  /** Current schema version for serialize/deserialize. */
  readonly schemaVersion = NOISE_SCHEMA_VERSION;

  /** WebGL2 context, set during {@link init}. */
  private gl!: WebGL2RenderingContext;

  /** Per-layer compiled program cache, keyed by layer id. */
  private programs = new Map<string, LayerProgram>();

  /** Shared fullscreen quad VAO used by all noise layers. */
  private quad!: WebGLVertexArrayObject;

  /**
   * Initialize the noise plugin. Creates the shared fullscreen quad VAO.
   * Called once by the renderer when the plugin is first registered.
   *
   * @param gl - The shared WebGL2 rendering context.
   */
  init(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);
  }

  /**
   * Render a single noise layer to the currently bound framebuffer.
   *
   * On first call for a given layer, compiles and caches a tailored GLSL
   * program. Subsequent frames reuse the cached program and only upload
   * updated uniforms.
   *
   * @param layer          - The noise layer configuration.
   * @param time           - Elapsed seconds since the renderer started.
   * @param _width         - Render target width (unused — noise fills the quad).
   * @param _height        - Render target height (unused — noise fills the quad).
   * @param _worldTransform - World transform (unused — noise ignores transforms).
   */
  render(
    layer: NoiseLayerConfig,
    time: number,
    _width: number,
    _height: number,
    _worldTransform: WorldTransform
  ): void {
    const gl = this.gl;
    let lp = this.programs.get(layer.id);
    if (!lp) {
      lp = this.compileProgram(layer);
      this.programs.set(layer.id, lp);
    }

    gl.useProgram(lp.program);
    bindQuadToProgram(gl, lp.program, this.quad);

    this.uploadUniforms(lp.uniforms, layer, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Determine whether a config change requires a shader recompile.
   *
   * Only structural changes that affect the GLSL source return `true`.
   * Uniform-only changes (speed, scale, palette, etc.) return `false`.
   *
   * @param prev - Layer config before the update.
   * @param next - Layer config after the update.
   * @returns `true` if {@link recompile} should be called.
   */
  needsRecompile(prev: NoiseLayerConfig, next: NoiseLayerConfig): boolean {
    return (
      prev.noiseType !== next.noiseType ||
      prev.animate !== next.animate ||
      prev.octaves !== next.octaves ||
      prev.warp !== next.warp ||
      prev.flowType !== next.flowType ||
      prev.curlStrength > 0 !== next.curlStrength > 0
    );
  }

  /**
   * Recompile the GLSL program for a layer after a structural config change.
   * Deletes the old program and caches the new one.
   *
   * @param layerId - The unique id of the layer being recompiled.
   * @param layer   - The updated layer configuration.
   */
  recompile(layerId: string, layer: NoiseLayerConfig): void {
    const gl = this.gl;
    const existing = this.programs.get(layerId);
    if (existing) gl.deleteProgram(existing.program);

    const lp = this.compileProgram(layer);
    this.programs.set(layerId, lp);
  }

  /**
   * Clean up GPU resources for a removed layer.
   * Deletes the WebGL program and removes it from the cache.
   *
   * @param layerId - The unique id of the removed layer.
   */
  removeLayer(layerId: string): void {
    const lp = this.programs.get(layerId);
    if (lp) {
      this.gl.deleteProgram(lp.program);
      this.programs.delete(layerId);
    }
  }

  /**
   * Release all GPU resources owned by this plugin.
   * Called when the renderer is destroyed.
   */
  destroy(): void {
    const gl = this.gl;
    for (const lp of this.programs.values()) {
      gl.deleteProgram(lp.program);
    }
    this.programs.clear();
    if (this.quad) gl.deleteVertexArray(this.quad);
  }

  // ── Schema ownership ──────────────────────────────────

  /**
   * Serialize a noise layer to a plain JSON-safe blob.
   *
   * Strips shared {@link LayerBase} fields — the config envelope holds those
   * separately. Only noise-specific fields are included in the output.
   *
   * @param layer - The full noise layer config.
   * @returns A plain object with noise-specific fields, safe for `JSON.stringify`.
   *
   * @see {@link deserialize} for the inverse operation.
   */
  serialize(layer: NoiseLayerConfig): unknown {
    return {
      noiseType: layer.noiseType,
      scale: layer.scale,
      octaves: layer.octaves,
      speed: layer.speed,
      direction: [layer.direction[0], layer.direction[1]],
      flowType: layer.flowType,
      contrast: layer.contrast,
      brightness: layer.brightness,
      palette: layer.palette.map((stop) => [stop[0], stop[1], stop[2]]),
      animate: layer.animate,
      warp: layer.warp,
      curlStrength: layer.curlStrength,
    };
  }

  /**
   * Reconstruct noise-specific fields from a serialized data blob.
   *
   * Fill in any missing fields with reasonable defaults so older configs
   * keep loading as the schema grows. Migration steps live here — add an
   * `if (version < N)` block for each schema bump.
   *
   * @param data    - The opaque blob from {@link serialize}.
   * @param version - The schema version the blob was written under.
   * @returns Noise-specific fields (everything except {@link LayerBase} fields).
   * @throws If `data` is not a valid object.
   *
   * @example
   * ```ts
   * // Future migration example:
   * if (version < 2) {
   *   d.newField = d.oldField ?? 0;
   *   delete d.oldField;
   * }
   * ```
   */
  deserialize(data: unknown, version: number): Omit<NoiseLayerConfig, keyof LayerBase> {
    if (typeof data !== "object" || data === null) {
      throw new Error(`noise plugin: deserialize expected an object, got ${typeof data}`);
    }
    const d = data as Record<string, unknown>;

    // Future migrations:
    // if (version < 2) { ...rewrite d in place... }
    void version;

    const direction = Array.isArray(d.direction)
      ? ([Number(d.direction[0]) || 0, Number(d.direction[1]) || 0] as [number, number])
      : ([1, 0] as [number, number]);

    const palette = Array.isArray(d.palette)
      ? (d.palette as unknown[])
          .filter((s): s is unknown[] => Array.isArray(s))
          .map(
            (s) =>
              [Number(s[0]) || 0, Number(s[1]) || 0, Number(s[2]) || 0] as [
                number,
                number,
                number,
              ]
          )
      : [
          [0, 0, 0] as [number, number, number],
          [1, 1, 1] as [number, number, number],
        ];

    return {
      noiseType: (d.noiseType as NoiseLayerConfig["noiseType"]) ?? "simplex",
      scale: Number(d.scale ?? 3),
      octaves: Number(d.octaves ?? 4),
      speed: Number(d.speed ?? 0.3),
      direction,
      flowType: (d.flowType as NoiseLayerConfig["flowType"]) ?? "linear",
      contrast: Number(d.contrast ?? 1),
      brightness: Number(d.brightness ?? 0),
      palette,
      animate: Boolean(d.animate ?? true),
      warp: Number(d.warp ?? 0),
      curlStrength: Number(d.curlStrength ?? 0),
    };
  }

  // ── Compilation ───────────────────────────────────────

  /**
   * Compile a noise layer to a {@link CompiledLayer} for the production runtime.
   *
   * The fragment shader source is finalized here and baked into the output
   * alongside the frozen uniform table. The runtime does not need the builder,
   * GLSL chunks, or schema — just the string and constant values.
   *
   * @param layer - The noise layer config to compile.
   * @returns A compiled layer with baked shader source and constant uniforms.
   *
   * @see {@link CompiledLayer} for the output format.
   * @see {@link buildNoiseShader} for the shader generation.
   */
  compile(layer: NoiseLayerConfig): CompiledLayer {
    const fragSrc = buildNoiseShader(layer);

    // Pack the palette once at compile time, matching uploadUniforms.
    const stops = layer.palette.slice(0, MAX_PALETTE_STOPS);
    const paletteFlat = new Array<number>(MAX_PALETTE_STOPS * 3).fill(0);
    for (let k = 0; k < stops.length; k++) {
      paletteFlat[k * 3] = stops[k][0];
      paletteFlat[k * 3 + 1] = stops[k][1];
      paletteFlat[k * 3 + 2] = stops[k][2];
    }

    return {
      plugin: "noise",
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      data: {
        fragSrc,
        // Everything after `time` is constant for the scene's lifetime —
        // the runtime uploads these once and only writes `time` per frame.
        constants: {
          speed: layer.speed,
          scale: layer.scale,
          contrast: layer.contrast,
          brightness: layer.brightness,
          warp: layer.warp,
          curl: layer.curlStrength,
          dir: [layer.direction[0], layer.direction[1]],
          center: [0.5, 0.5],
          paletteLen: stops.length,
          palette: paletteFlat,
        },
      },
    };
  }

  // ── Internal ──────────────────────────────────────────

  /**
   * Compile a GLSL program from a layer config. Generates the fragment
   * shader via {@link buildNoiseShader}, links it with the fullscreen
   * vertex shader, and wraps it in a {@link LayerProgram} with a
   * uniform cache.
   */
  private compileProgram(layer: NoiseLayerConfig): LayerProgram {
    const fragSrc = buildNoiseShader(layer);
    const program = linkProgram(this.gl, FULLSCREEN_VERT, fragSrc);
    const uniforms = new UniformCache(this.gl, program);
    return { program, uniforms };
  }

  /**
   * Upload all per-frame uniforms for a noise layer. Called every frame
   * for each visible noise layer, after the program is bound.
   *
   * @param u     - The uniform location cache for this layer's program.
   * @param layer - The current layer configuration.
   * @param time  - Elapsed seconds since the renderer started.
   */
  private uploadUniforms(u: UniformCache, layer: NoiseLayerConfig, time: number): void {
    const gl = this.gl;

    gl.uniform1f(u.get("u_time"), time);
    gl.uniform1f(u.get("u_speed"), layer.speed);
    gl.uniform1f(u.get("u_scale"), layer.scale);
    gl.uniform1f(u.get("u_contrast"), layer.contrast);
    gl.uniform1f(u.get("u_brightness"), layer.brightness);
    gl.uniform1f(u.get("u_warp"), layer.warp);
    gl.uniform1f(u.get("u_curl"), layer.curlStrength);
    gl.uniform2fv(u.get("u_dir"), layer.direction);
    gl.uniform2fv(u.get("u_center"), [0.5, 0.5]);

    const stops = layer.palette.slice(0, MAX_PALETTE_STOPS);
    const padded = new Float32Array(MAX_PALETTE_STOPS * 3);
    for (let k = 0; k < stops.length; k++) {
      const [r, g, b] = stops[k];
      padded[k * 3] = r;
      padded[k * 3 + 1] = g;
      padded[k * 3 + 2] = b;
    }
    gl.uniform3fv(u.get("u_pal"), padded);
    gl.uniform1i(u.get("u_palLen"), stops.length);
  }
}
