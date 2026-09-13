import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createMobileShellController } from "../../../core/mobile-shell/controller.ts";
import { type ShellTemplateData, installShellFixtureRuntime, createElement, createInput, createActionEvent, settle } from "../../../tests/support/search-ui-fixture.ts";
afterEach(() => {
  for (const key of ["document", "Element", "addEventListener", "removeEventListener", "game", "history", "location", "localStorage", "renderTemplate", "requestAnimationFrame", "foundry"]) Reflect.deleteProperty(globalThis, key);
});

test("dnd5e search exposes system-owned compendium result filters", async () => {
  const root = createElement();
  const searchInput = createInput();
  const renderModels: unknown[] = [];

  installShellFixtureRuntime({
    root,
    searchInput,
    systemId: "dnd5e",
    renderTemplate: async (_path, data) => {
      renderModels.push(data);
      return "<input data-search-input><button data-action=\"navigate\" data-route=\"search\">Search</button>";
    }
  });

  const shell = createMobileShellController();
  await shell.mount();
  root.dispatch("click", createActionEvent({ action: "navigate", route: "search" }));
  await settle();

  const latestModel = renderModels.at(-1) as ShellTemplateData;
  assert.deepEqual(
    latestModel.search?.typeFilters.map(filter => filter.label),
    ["All", "Character", "Item", "Journal Entry", "Journal Page", "Spell"]
  );
});
