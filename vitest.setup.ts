import { vi } from "vitest";

function createMockGL(): WebGL2RenderingContext {
  const handler: ProxyHandler<object> = {
    get(target, prop: string) {
      if (prop in target) return (target as Record<string, unknown>)[prop];
      if (typeof prop !== "string") return undefined;

      if (/^[A-Z_0-9]+$/.test(prop)) {
        const val = prop.length;
        (target as Record<string, unknown>)[prop] = val;
        return val;
      }

      if (prop.startsWith("create")) {
        const fn = vi.fn(() => ({ __mock: prop }));
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      }

      if (prop === "getShaderParameter" || prop === "getProgramParameter") {
        const fn = vi.fn(() => true);
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      }

      if (prop === "getUniformLocation") {
        const fn = vi.fn((_p: unknown, name: string) => ({ __loc: name }));
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      }

      if (prop === "getAttribLocation") {
        const fn = vi.fn(() => 0);
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      }

      if (prop === "checkFramebufferStatus") {
        const fn = vi.fn(() => 36053); // FRAMEBUFFER_COMPLETE
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      }

      const fn = vi.fn();
      (target as Record<string, unknown>)[prop] = fn;
      return fn;
    },
  };

  return new Proxy({}, handler) as WebGL2RenderingContext;
}

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn((type: string) => {
    if (type === "webgl2") return createMockGL();
    if (type === "2d") return {};
    return null;
  }),
});

if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number);
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}

if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
