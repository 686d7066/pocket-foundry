import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getFoundryHandlebars } from "../src/core/foundry-globals.ts";

test("template loading and rendering avoid both deprecated global getters", async () => {
  const globals = ["renderTemplate", "loadTemplates"] as const;
  const descriptors = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const loadTemplates = vi.fn(async () => []);
  const renderTemplate = vi.fn(async () => "<section>Rendered</section>");
  vi.stubGlobal("window", {});
  vi.stubGlobal("foundry", { applications: { handlebars: { loadTemplates, renderTemplate } } });
  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() { throw new Error(`Deprecated ${name} getter accessed`); }
    });
  }
  try {
    const { loadPocketFoundryTemplates } = await import("../src/module.ts");
    await loadPocketFoundryTemplates();
    assert.equal(loadTemplates.mock.calls.length, 1);
    const html = await getFoundryHandlebars().renderTemplate?.("template.hbs", {});
    assert.equal(html, "<section>Rendered</section>");
    assert.equal(renderTemplate.mock.calls.length, 1);
  } finally {
    vi.unstubAllGlobals();
    globals.forEach((name, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
