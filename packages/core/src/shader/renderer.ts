import type { NoiseLayer, RaeNoiseRenderer } from '../types';
import { buildFragShader, MAX_PALETTE_STOPS } from './builder';

// ── Vertex shader — fullscreen triangle strip ─────────────
const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Map [-1,1] clip space to [0,1] uv
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Returns a new layer configuration object with sensible defaults.
 *
 * The returned object omits `id` — the renderer assigns one automatically
 * when the layer is added via {@link RaeNoiseRenderer.addLayer}.
 *
 * Default values:
 * | Property       | Default          |
 * |----------------|------------------|
 * | `noiseType`    | `"simplex"`      |
 * | `scale`        | `3.0`            |
 * | `octaves`      | `4`              |
 * | `speed`        | `0.3`            |
 * | `direction`    | `[1, 0]`         |
 * | `flowType`     | `"linear"`       |
 * | `contrast`     | `1.0`            |
 * | `brightness`   | `0.0`            |
 * | `palette`      | black → white    |
 * | `opacity`      | `1.0`            |
 * | `blendMode`    | `"add"`          |
 * | `animate`      | `true`           |
 * | `warp`         | `0.0`            |
 * | `curlStrength` | `0.0`            |
 *
 * @returns A default layer configuration without an `id`.
 *
 * @example
 * ```ts
 * import { createRenderer, defaultLayer } from "rae-noise";
 *
 * const renderer = createRenderer(canvas);
 * // Add a default layer, then customize:
 * const id = renderer.addLayer({ ...defaultLayer(), noiseType: "worley", scale: 5 });
 * ```
 */
export function defaultLayer(): Omit<NoiseLayer, 'id'> {
  return {
    name:         'layer',
    noiseType:    'simplex',
    scale:        3.0,
    octaves:      4,
    speed:        0.3,
    direction:    [1.0, 0.0],
    flowType:     'linear',
    contrast:     1.0,
    brightness:   0.0,
    palette:      [[0, 0, 0], [1, 1, 1]],
    opacity:      1.0,
    blendMode:    'add',
    animate:      true,
    warp:         0.0,
    curlStrength: 0.0,
  };
}

// ── Helpers ───────────────────────────────────────────────
function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('Failed to create program');
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
 * Core WebGL2 noise renderer. Manages a stack of {@link NoiseLayer}s, dynamically
 * compiles GLSL shaders based on the active layer configuration, and renders
 * the composited result to an HTML canvas at display refresh rate.
 *
 * Prefer using the {@link createRenderer} factory function rather than
 * instantiating this class directly.
 *
 * **Lifecycle:**
 * 1. Construction initializes WebGL2, sets up a fullscreen quad, and starts a
 *    `requestAnimationFrame` render loop.
 * 2. Adding or modifying layers marks the shader as dirty; on the next frame the
 *    fragment shader is regenerated and recompiled.
 * 3. Call {@link destroy} to stop the loop and free GPU resources.
 *
 * @see {@link createRenderer} — the recommended way to obtain an instance.
 */
export class NoiseRenderer implements RaeNoiseRenderer {
  private gl:      WebGL2RenderingContext;
  private canvas:  HTMLCanvasElement;
  private layers:  NoiseLayer[] = [];
  private program: WebGLProgram | null = null;
  private vao:     WebGLVertexArrayObject | null = null;
  private dirty    = false;
  private rafId:   number | null = null;
  private startTime: number = performance.now();

  /**
   * Optional callback invoked roughly every 500 ms with the current
   * frames-per-second count. Useful for performance overlays.
   *
   * @example
   * ```ts
   * renderer.onFps = (fps) => console.log(`${fps} FPS`);
   * ```
   */
  onFps?: (fps: number) => void;
  private frameCount = 0;
  private lastFpsTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.setupGeometry();
    this.setupResize();
    this.startLoop();
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * {@inheritDoc RaeNoiseRenderer.addLayer}
   */
  addLayer(partial: Partial<NoiseLayer> = {}): string {
    const id = crypto.randomUUID();
    const layer: NoiseLayer = { ...defaultLayer(), ...partial, id };
    this.layers.push(layer);
    this.dirty = true;
    return id;
  }

  /** {@inheritDoc RaeNoiseRenderer.removeLayer} */
  removeLayer(id: string): void {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx !== -1) { this.layers.splice(idx, 1); this.dirty = true; }
  }

  /** {@inheritDoc RaeNoiseRenderer.updateLayer} */
  updateLayer(id: string, patch: Partial<NoiseLayer>): void {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const prev = this.layers[idx];
    this.layers[idx] = { ...prev, ...patch };

    const structural: (keyof NoiseLayer)[] = ['noiseType', 'blendMode', 'animate', 'octaves', 'warp'];
    if (structural.some(k => k in patch && patch[k] !== prev[k])) {
      this.dirty = true;
    }
  }

  /** {@inheritDoc RaeNoiseRenderer.getLayers} */
  getLayers(): NoiseLayer[] { return [...this.layers]; }

  /** {@inheritDoc RaeNoiseRenderer.destroy} */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.program) this.gl.deleteProgram(this.program);
    if (this.vao)     this.gl.deleteVertexArray(this.vao);
  }

  // ── Internals ───────────────────────────────────────────

  private setupGeometry(): void {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Fullscreen quad as triangle strip
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  }

  private setupResize(): void {
    const resize = () => {
      this.canvas.width  = this.canvas.clientWidth  * devicePixelRatio;
      this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    };
    new ResizeObserver(resize).observe(this.canvas);
    resize();
  }

  private rebuildProgram(): void {
    const gl = this.gl;
    try {
      const fragSrc = buildFragShader(this.layers);
      const next = linkProgram(gl, VERT_SRC, fragSrc);
      if (this.program) gl.deleteProgram(this.program);
      this.program = next;

      // Re-bind geometry to new program
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      const loc = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    } catch (e) {
      console.error('Shader rebuild failed:', e);
    }
  }

  private uploadUniforms(nowSecs: number): void {
    const gl = this.gl;
    const prog = this.program;
    if (!prog) return;

    const uLoc = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniform1f(uLoc('u_time'), nowSecs);

    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i];
      gl.uniform1f(uLoc(`u_speed${i}`),      l.speed);
      gl.uniform1f(uLoc(`u_scale${i}`),      l.scale);
      gl.uniform1f(uLoc(`u_contrast${i}`),   l.contrast);
      gl.uniform1f(uLoc(`u_brightness${i}`), l.brightness);
      gl.uniform1f(uLoc(`u_opacity${i}`),    l.opacity);
      gl.uniform1f(uLoc(`u_warp${i}`),       l.warp);
      gl.uniform2fv(uLoc(`u_dir${i}`),       l.direction);
      gl.uniform1f(uLoc(`u_curl${i}`),    l.curlStrength);
      gl.uniform2fv(uLoc(`u_center${i}`), [0.5, 0.5]);

      // Palette stops — pad to MAX_PALETTE_STOPS
      const stops = l.palette.slice(0, MAX_PALETTE_STOPS);
      const padded = new Float32Array(MAX_PALETTE_STOPS * 3);
      for (let k = 0; k < stops.length; k++) {
        const [r, g, b] = stops[k];
        padded[k * 3]     = r;
        padded[k * 3 + 1] = g;
        padded[k * 3 + 2] = b;
      }
      gl.uniform3fv(uLoc(`u_pal${i}`),    padded);
      gl.uniform1i( uLoc(`u_palLen${i}`), stops.length);
    }
  }

  private startLoop(): void {
    const loop = (now: DOMHighResTimeStamp) => {
      this.rafId = requestAnimationFrame(loop);

      if (this.dirty) {
        this.rebuildProgram();
        this.dirty = false;
      }

      const gl = this.gl;

      if (this.layers.length === 0 || !this.program) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);

      const secs = (now - this.startTime) / 1000;
      this.uploadUniforms(secs);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // FPS
      this.frameCount++;
      if (now - this.lastFpsTime >= 500) {
        this.onFps?.(Math.round(this.frameCount * 1000 / (now - this.lastFpsTime)));
        this.frameCount = 0;
        this.lastFpsTime = now;
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** {@inheritDoc RaeNoiseRenderer.reorderLayers} */
  reorderLayers(ids: string[]): void {
    const map = new Map(this.layers.map(l => [l.id, l]));
    const next = ids.map(id => map.get(id)).filter(Boolean) as NoiseLayer[];
    if (next.length === this.layers.length) {
      this.layers = next;
      this.dirty  = true;
    }
  }
}

/**
 * Creates a new {@link RaeNoiseRenderer} bound to the given canvas element.
 *
 * This is the main entry point for the library. It initializes a WebGL2 context,
 * sets up a fullscreen quad, and starts a `requestAnimationFrame` render loop.
 * The canvas is automatically resized to match its CSS dimensions at the
 * device's pixel ratio.
 *
 * @param canvas - The `<canvas>` element to render into. Must support WebGL2.
 * @returns A renderer instance ready to accept layers.
 * @throws If the browser does not support WebGL2.
 *
 * @example
 * ```ts
 * import { createRenderer } from "rae-noise";
 *
 * const canvas = document.querySelector<HTMLCanvasElement>("#noise")!;
 * const renderer = createRenderer(canvas);
 *
 * renderer.addLayer({ noiseType: "fbm", scale: 4, speed: 0.2 });
 * renderer.addLayer({ noiseType: "worley", blendMode: "screen", opacity: 0.5 });
 *
 * // Later, clean up:
 * renderer.destroy();
 * ```
 */
export function createRenderer(canvas: HTMLCanvasElement): NoiseRenderer {
  return new NoiseRenderer(canvas);
}