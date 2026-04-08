import path from "node:path";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [glsl()],
  resolve: {
    alias: {
      "rae-noise": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
