import type { Backend, NoiseLayerConfig } from "../../types";
import { UniformCache, linkProgram } from "../../webgl/program";
import { FULLSCREEN_VERT, bindQuadToProgram, createFullscreenQuad } from "../../webgl/quad";
import { MAX_PALETTE_STOPS, buildNoiseShader } from "./builder";

interface LayerProgram {
  program: WebGLProgram;
  uniforms: UniformCache;
}

export class NoiseBackend implements Backend<NoiseLayerConfig> {
  readonly type = "noise" as const;
  private gl!: WebGL2RenderingContext;
  private programs = new Map<string, LayerProgram>();
  private quad!: WebGLVertexArrayObject;

  init(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);
  }

  render(layer: NoiseLayerConfig, time: number, _width: number, _height: number): void {
    const gl = this.gl;
    let lp = this.programs.get(layer.id);
    if (!lp) {
      lp = this.compile(layer);
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

    const lp = this.compile(layer);
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

  private compile(layer: NoiseLayerConfig): LayerProgram {
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
