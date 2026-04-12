import path from "node:path";
import base from "../../vitest.base";

export default {
  ...base,
  resolve: {
    alias: {
      "rae-noise": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    ...base.test,
    exclude: ["test/e2e/**"],
  }
};