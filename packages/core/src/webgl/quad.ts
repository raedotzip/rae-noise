export const FULLSCREEN_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Map [-1,1] clip space to [0,1] uv
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export function createFullscreenQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to create VAO");
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);
  return vao;
}

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
