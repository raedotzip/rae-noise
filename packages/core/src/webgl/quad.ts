/**
 * @file Fullscreen quad geometry and vertex shader for rae-noise.
 *
 * Provides the shared fullscreen quad mesh and vertex shader used by every
 * rendering pass in the library — noise layers, compositor blending, and
 * gamma correction all draw a fullscreen quad to fill the viewport.
 *
 * ## Geometry
 *
 * The quad is a 4-vertex triangle strip covering clip space `[-1, 1]`:
 * ```
 * (-1, 1) ──── (1, 1)
 *    │  \         │
 *    │    \       │
 *    │      \     │
 *    │        \   │
 * (-1,-1) ──── (1,-1)
 * ```
 *
 * The vertex shader maps clip-space positions to UV coordinates `[0, 1]`
 * for texture sampling.
 *
 * @example
 * ```ts
 * const quad = createFullscreenQuad(gl);
 * gl.useProgram(program);
 * bindQuadToProgram(gl, program, quad);
 * gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
 * ```
 *
 * @see {@link NoisePlugin} which creates a quad per plugin instance.
 * @see {@link Compositor} which creates a quad for blending passes.
 */

/**
 * GLSL ES 3.0 vertex shader for fullscreen quads.
 *
 * Maps the `a_pos` attribute (clip space `[-1, 1]`) to the `v_uv`
 * varying (texture space `[0, 1]`). Shared by every program in the library.
 */
export const FULLSCREEN_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Map [-1,1] clip space to [0,1] uv
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Vertex data for a fullscreen quad — 4 vertices as a triangle strip. */
const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

/**
 * Create a WebGL VAO containing a fullscreen quad mesh.
 *
 * The VAO holds a single VBO with 4 vertices (`[-1,-1], [1,-1], [-1,1], [1,1]`)
 * suitable for `gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)`. Vertex attributes
 * are not enabled here — call {@link bindQuadToProgram} before drawing.
 *
 * @param gl - The WebGL2 rendering context.
 * @returns A VAO containing the fullscreen quad vertex data.
 * @throws If VAO creation fails.
 *
 * @example
 * ```ts
 * const quad = createFullscreenQuad(gl);
 * // Later, for each draw call:
 * bindQuadToProgram(gl, program, quad);
 * gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
 * ```
 */
export function createFullscreenQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to create VAO");
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
  return vao;
}

/**
 * Bind a fullscreen quad VAO to a program and enable its `a_pos` attribute.
 *
 * Must be called before every `drawArrays` call because different programs
 * may have `a_pos` at different attribute locations.
 *
 * @param gl      - The WebGL2 rendering context.
 * @param program - The linked program to bind the quad to.
 * @param vao     - The VAO returned by {@link createFullscreenQuad}.
 *
 * @example
 * ```ts
 * gl.useProgram(program);
 * bindQuadToProgram(gl, program, quad);
 * gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
 * ```
 */
export function bindQuadToProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vao: WebGLVertexArrayObject
): void {
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}
