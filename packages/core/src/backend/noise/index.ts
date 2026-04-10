import type {
  Backend,
  CompiledLayer,
  LayerBase,
  NoiseLayerConfig,
  WorldTransform,
} from "../../types";
import { UniformCache, linkProgram } from "../../webgl/program";
import { FULLSCREEN_VERT, bindQuadToProgram, createFullscreenQuad } from "../../webgl/quad";
import { MAX_PALETTE_STOPS, buildNoiseShader } from "./builder";

/**
 * Schema version for {@link NoiseLayerConfig}. Bump when fields are added,
 * renamed, or change semantics, and extend {@link NoiseBackend.deserialize}
 * with a migration step.
 */
export const NOISE_SCHEMA_VERSION = 1;

interface LayerProgram {
  program: WebGLProgram;
  uniforms: UniformCache;
}

export class NoiseBackend implements Backend<NoiseLayerConfig> {
  readonly type = "noise" as const;
  readonly schemaVersion = NOISE_SCHEMA_VERSION;
  private gl!: WebGL2RenderingContext;
  private programs = new Map<string, LayerProgram>();
  private quad!: WebGLVertexArrayObject;

  init(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);
  }

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

  recompile(layerId: string, layer: NoiseLayerConfig): void {
    const gl = this.gl;
    const existing = this.programs.get(layerId);
    if (existing) gl.deleteProgram(existing.program);

    const lp = this.compileProgram(layer);
    this.programs.set(layerId, lp);
  }

  removeLayer(layerId: string): void {
    const lp = this.programs.get(layerId);
    if (lp) {
      this.gl.deleteProgram(lp.program);
      this.programs.delete(layerId);
    }
  }

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
   * Serialize a noise layer to a plain JSON-safe blob. Strips shared
   * {@link LayerBase} fields — the envelope holds those separately.
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
   * Reconstruct a noise layer from an opaque data blob plus the schema
   * version it was written under. Fill in any missing fields with
   * reasonable defaults so older configs keep loading as the schema grows.
   *
   * Migration steps live here — add an `if (version < N)` block for each
   * bump and rewrite the blob in place.
   */
  deserialize(data: unknown, version: number): Omit<NoiseLayerConfig, keyof LayerBase> {
    if (typeof data !== "object" || data === null) {
      throw new Error(`noise backend: deserialize expected an object, got ${typeof data}`);
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
   * Compile a noise layer to a {@link CompiledLayer} the minimal runtime
   * can replay. The fragment shader source is finalized here and baked
   * into the output alongside the frozen uniform table. The runtime does
   * not need the builder, chunks, or schema — just the string and values.
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
      backend: "noise",
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

  private compileProgram(layer: NoiseLayerConfig): LayerProgram {
    const fragSrc = buildNoiseShader(layer);
    const program = linkProgram(this.gl, FULLSCREEN_VERT, fragSrc);
    const uniforms = new UniformCache(this.gl, program);
    return { program, uniforms };
  }

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
