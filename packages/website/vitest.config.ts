import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "rae-noise": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**"],
  },
});
