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
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    BLEND: 0x0be2,
    ONE: 1,
    ZERO: 0,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE_MINUS_SRC_COLOR: 0x0301,
    DST_COLOR: 0x0306,
    FUNC_ADD: 0x8006,
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
    // FBO / texture / blend support
    createFramebuffer: () => ({}),
    bindFramebuffer: vi.fn(),
    deleteFramebuffer: vi.fn(),
    createTexture: () => ({}),
    bindTexture: vi.fn(),
    deleteTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: () => 0x8cd5, // FRAMEBUFFER_COMPLETE
    activeTexture: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    blendEquation: vi.fn(),
  };

  return gl;
}

// Patch HTMLCanvasElement to return our mock context
const originalGetContext = HTMLCanvasElement.prototype.getContext;
(HTMLCanvasElement.prototype as { getContext: unknown }).getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
  ...args: unknown[]
) {
  if (contextId === "webgl2") {
    return createWebGL2Mock() as unknown as WebGL2RenderingContext;
  }
  return originalGetContext.call(this, contextId as "2d", ...args);
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
  return ++rafId;
});
globalThis.cancelAnimationFrame = vi.fn();

// ── devicePixelRatio ─────────────────────────────────────
Object.defineProperty(globalThis, "devicePixelRatio", { value: 1, writable: true });
