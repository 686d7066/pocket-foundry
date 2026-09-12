import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getFoundryTextEditor } from "../src/core/foundry-globals.ts";

test("repeated enrichment resolves the configured editor without reading the deprecated global", async () => {
  const legacy = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const implementation = {
    marker: "configured",
    async enrichHTML(this: { marker: string }, content: string): Promise<string> {
      return `${this.marker}:${content}`;
    }
  };
  vi.stubGlobal("foundry", { applications: { ux: { TextEditor: { implementation } } } });
  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    get() { throw new Error("Deprecated TextEditor getter accessed"); }
  });
  try {
    for (let index = 0; index < 2000; index++) {
      const editor = getFoundryTextEditor();
      assert.equal(editor, implementation);
      assert.equal(await editor?.enrichHTML("description"), "configured:description");
    }
  } finally {
    vi.unstubAllGlobals();
    if (legacy) Object.defineProperty(globalThis, "TextEditor", legacy);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});
