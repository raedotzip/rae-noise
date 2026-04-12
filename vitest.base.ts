import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",

    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],

    include: ["**/*.test.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
    },
  },
});