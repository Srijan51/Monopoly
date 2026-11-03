import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@mwt/engine": fileURLToPath(new URL("./packages/engine/src/index.ts", import.meta.url)) } },
  test: { coverage: { provider: "v8", thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 } } }
});
