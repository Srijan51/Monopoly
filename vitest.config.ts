import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@mwt/engine": fileURLToPath(new URL("./packages/engine/src/index.ts", import.meta.url)) } },
  test: {
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/dist/**", "packages/engine/src/types.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});
