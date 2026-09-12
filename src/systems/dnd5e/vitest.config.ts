import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    name: "dnd5e",
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
