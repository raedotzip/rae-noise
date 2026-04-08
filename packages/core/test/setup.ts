import { vi } from "vitest";

// ── WebGL2 mock ──────────────────────────────────────────
// Returns a stub context where every method is a no-op and shader
// compilation/linking always succeeds. This is enough for the renderer
// to initialise and manage layers without a real GPU.

function createWebGL2Mock(): Record<string, unknown> {
  const constants: Record<string, number> = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLE_STRIP: 0x0005,
    COLOR_BUFFER_BIT: 0x4000,
  };

  let shaderCounter = 0;
  let programCounter = 0;

  const gl: Record<string, unknown> = {
    ...constants,
    createShader: () => ({ _id: ++shaderCounter }),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: (_s: unknown, pname: number) =>
      pname === constants.COMPILE_STATUS ? true : null,
    getShaderInfoLog: () => "",
    deleteShader: vi.fn(),
    createProgram: () => ({ _id: ++programCounter }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: (_p: unknown, pname: number) =>
      pname === constants.LINK_STATUS ? true : null,
    getProgramInfoLog: () => "",
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    createVertexArray: () => ({}),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    createBuffer: () => ({}),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: () => 0,
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: () => ({}),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
  };

  return gl;
}

// Patch HTMLCanvasElement to return our mock context
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]): any {
  if (contextId === "webgl2") {
    return createWebGL2Mock() as unknown as WebGL2RenderingContext;
  }
  return originalGetContext.call(this, contextId, ...args);
};

// ── ResizeObserver stub (jsdom doesn't provide one) ──────
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// ── requestAnimationFrame / cancelAnimationFrame ─────────
// Use a synchronous stub so tests don't need real timers.
let rafId = 0;
globalThis.requestAnimationFrame = vi.fn((_cb: FrameRequestCallback) => {
  // Do not auto-invoke — tests can call the callback manually if needed
  return ++rafId;
});
globalThis.cancelAnimationFrame = vi.fn();

// ── devicePixelRatio ─────────────────────────────────────
Object.defineProperty(globalThis, "devicePixelRatio", { value: 1, writable: true });
