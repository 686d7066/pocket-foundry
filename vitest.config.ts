import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pocket-foundry tests",
    include: ["tests/*.test.ts"],
    environment: "node"
  }
});
