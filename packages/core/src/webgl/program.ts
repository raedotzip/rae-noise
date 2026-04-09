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

export class UniformCache {
  private cache = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram
  ) {}

  get(name: string): WebGLUniformLocation | null {
    let loc = this.cache.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(this.program, name);
      this.cache.set(name, loc);
    }
    return loc;
  }
}
