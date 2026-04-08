// packages/core/rollup.config.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import glsl from "rollup-plugin-glsl";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const input = "src/index.ts";

export default [
  // ESM build + declarations
  {
    input,
    output: {
      dir: "dist/esm",
      format: "esm",
      entryFileNames: "index.js",
      sourcemap: true,
    },
    plugins: [
      resolve(),
      glsl(),
      typescript({
        tsconfig: path.resolve(__dirname, "./tsconfig.build.json"),
        outDir: "dist/esm",
        declaration: true,
        declarationDir: "dist/esm",  // must be inside dir
      }),
    ],
  },
  // CJS build (no declarations)
  {
    input,
    output: {
      dir: "dist/cjs",
      format: "cjs",
      entryFileNames: "index.cjs",
      sourcemap: true,
    },
    plugins: [
      resolve(),
      glsl(),
      typescript({
        tsconfig: path.resolve(__dirname, "./tsconfig.build.json"),
        outDir: "dist/cjs",
        declaration: false,
        declarationDir: undefined,
      }),
    ],
  },
];