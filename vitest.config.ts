import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["src/tests/**/*.test.ts", "tests/**/*.test.ts"], environment: "node" } },
      "src/systems/*/vitest.config.ts"
    ]
  }
});
