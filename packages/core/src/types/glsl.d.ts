/**
 * @file TypeScript module declarations for GLSL shader imports.
 *
 * Allows importing `.glsl` files as strings in TypeScript. These declarations
 * support two import styles:
 *
 * - `import src from "./shader.glsl"` — used by Rollup's GLSL plugin (production build)
 * - `import src from "./shader.glsl?raw"` — used by Vite's raw import (dev server)
 *
 * Both resolve to a plain string containing the GLSL source code.
 *
 * @see The noise plugin's builder (`plugin/noise/builder.ts`) for usage.
 */

declare module "*.glsl" {
  const src: string;
  export default src;
}

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare module "rollup-plugin-glsl";
