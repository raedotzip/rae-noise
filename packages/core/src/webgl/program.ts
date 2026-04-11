/**
 * @file WebGL2 shader compilation, program linking, and uniform caching.
 *
 * Provides low-level GPU resource creation used by both plugins and the
 * compositor. All functions throw descriptive errors on failure, including
 * the GLSL info log from the driver.
 *
 * ## Exports
 *
 * - {@link compileShader} — compile a single GLSL shader (vertex or fragment)
 * - {@link linkProgram} — compile and link a vertex + fragment shader pair
 * - {@link UniformCache} — memoized uniform location lookups for a program
 *
 * @example
 * ```ts
 * import { linkProgram, UniformCache } from "./program";
 *
 * const program = linkProgram(gl, vertSrc, fragSrc);
 * const uniforms = new UniformCache(gl, program);
 * gl.useProgram(program);
 * gl.uniform1f(uniforms.get("u_time"), elapsed);
 * ```
 *
 * @see {@link NoisePlugin} which uses these to compile per-layer noise shaders.
 * @see {@link Compositor} which uses these for blend and gamma programs.
 */

/**
 * Compile a single GLSL shader from source.
 *
 * @param gl   - The WebGL2 rendering context.
 * @param type - Shader type: `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
 * @param src  - The GLSL source code string.
 * @returns The compiled WebGL shader object.
 * @throws If shader creation fails or compilation produces errors.
 *
 * @example
 * ```ts
 * const vert = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
 * const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
 * ```
 */
export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

/**
 * Compile a vertex and fragment shader, link them into a program, and return it.
 *
 * This is a convenience wrapper around {@link compileShader} that handles
 * both compilation steps and the link step in one call.
 *
 * @param gl   - The WebGL2 rendering context.
 * @param vert - GLSL vertex shader source string.
 * @param frag - GLSL fragment shader source string.
 * @returns The linked WebGL program object.
 * @throws If program creation, shader compilation, or linking fails.
 *
 * @example
 * ```ts
 * const program = linkProgram(gl, FULLSCREEN_VERT, myFragmentShader);
 * gl.useProgram(program);
 * ```
 */
export function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create program");
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error:\n${log}`);
  }
  return prog;
}

/**
 * Memoized uniform location cache for a WebGL program.
 *
 * Avoids repeated `gl.getUniformLocation()` calls by caching results on
 * first access. Each noise layer program and each compositor program gets
 * its own `UniformCache` instance.
 *
 * @example
 * ```ts
 * const uniforms = new UniformCache(gl, program);
 *
 * // First call looks up the location; subsequent calls use the cache:
 * gl.uniform1f(uniforms.get("u_time"), elapsed);
 * gl.uniform1f(uniforms.get("u_scale"), 4.0);
 * ```
 */
export class UniformCache {
  /** Internal cache map from uniform name to location (or null if not found). */
  private cache = new Map<string, WebGLUniformLocation | null>();

  /**
   * Create a new uniform cache for a program.
   *
   * @param gl      - The WebGL2 rendering context.
   * @param program - The linked program to look up uniforms in.
   */
  constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram
  ) {}

  /**
   * Get the uniform location for a given name. Returns `null` if the
   * uniform does not exist in the program (which is valid — the driver
   * may have optimized it away).
   *
   * @param name - The GLSL uniform name (e.g., `"u_time"`).
   * @returns The cached uniform location, or `null`.
   */
  get(name: string): WebGLUniformLocation | null {
    let loc = this.cache.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(this.program, name);
      this.cache.set(name, loc);
    }
    return loc;
  }
}
