import { vi } from "vitest";

export function mockWebGL() {
  const gl = {} as WebGL2RenderingContext;

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (contextId: string): RenderingContext | null => {
      if (contextId === "webgl2") return gl;
      return null;
    }
  );

  return gl;
}
