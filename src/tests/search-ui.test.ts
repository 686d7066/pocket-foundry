import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { createMobileShellController } from "../core/mobile-shell/controller.ts";
import { createFoundrySearchService, getCharacterSheetSearchAdapters } from "../core/mobile-shell/controller-helpers-search.ts";
import { RouteView } from "../router/routes.ts";
import { createDocument, SEARCH_DEBOUNCE_BUFFER_MS, type ShellTemplateData, installShellFixtureRuntime, createElement, createInput, createActionEvent, createInputEvent, createSearchableCollection, isHistoryState, settle, wait } from "./support/search-ui-fixture.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "addEventListener");
  Reflect.deleteProperty(globalThis, "removeEventListener");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "renderTemplate");
  Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  Reflect.deleteProperty(globalThis, "foundry");
});

test("search template preserves required regions and registers for preload", () => {
  const shellTemplate = readFileSync(new URL("../templates/shell.hbs", import.meta.url), "utf8");
  const searchTemplate = readFileSync(new URL("../templates/search.hbs", import.meta.url), "utf8");
  const moduleSource = readFileSync(new URL("../module.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/pocket-foundry.css", import.meta.url), "utf8");

  assert.match(shellTemplate, /class="pocket-foundry-root mf-app\{\{#if colorBlindMode\}\} color-blind-mode\{\{\/if\}\}"/);
  assert.match(shellTemplate, /class="mf-header"/);
  assert.match(shellTemplate, /class="content"/);
  assert.match(searchTemplate, /class="search-box"/);
  assert.match(searchTemplate, /class="sub-rail rail search-type-rail"/);
  assert.match(searchTemplate, /class="pf-view search-view"/);
  assert.match(searchTemplate, /class="section pf-view-section search-results"/);
  assert.match(searchTemplate, /class="row search-result-row/);
  assert.match(searchTemplate, /class="item-icon"/);
  assert.match(searchTemplate, /class="row-title"/);
  assert.match(searchTemplate, /class="row-action"/);
  assert.match(shellTemplate, /partials\/bottom-nav\.hbs/);
  assert.match(moduleSource, /`\$\{TEMPLATE_ROOT\}\/search\.hbs`/);
  assert.match(moduleSource, /`\$\{TEMPLATE_ROOT\}\/item-detail\.hbs`/);
  assert.match(css, /\.pocket-foundry-root \.search-type-rail/);
  assert.match(css, /\.pocket-foundry-root \.item-detail-view/);
  assert.doesNotMatch(searchTemplate, /create|delete|edit|Open Sheet/i);
  const itemDetailTemplate = readFileSync(new URL("../templates/item-detail.hbs", import.meta.url), "utf8");
  assert.doesNotMatch(itemDetailTemplate, /create|delete|edit|import|Open Sheet/i);
  assert.match(itemDetailTemplate, /class="section-heading content-group-heading pf-view-section-heading item-detail-heading"/);
  assert.doesNotMatch(itemDetailTemplate, /item-detail-header|{{name}}|{{typeLabel}}|{{icon}}/);
});

test("opening Search from bottom navigation focuses input and restores route state", async () => {
  const root = createElement();
  const searchInput = createInput();
  const renderModels: unknown[] = [];

  installShellFixtureRuntime({
    root,
    searchInput,
    actors: [createDocument({ uuid: "Actor.arlen", name: "Arlen Mire", documentName: "Actor", type: "character" })],
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
  assert.equal(searchInput.focused, true);
  assert.equal(latestModel.activeDestination, "search");
  assert.equal(latestModel.search?.query, "");
  assert.equal(latestModel.search?.typeFilters[0]?.label, "All");
  assert.deepEqual(
    latestModel.search?.typeFilters.map(filter => filter.label),
    ["All", "Character", "Item", "Journal Entry", "Journal Page"]
  );
});

test("search UI debounces live results, ignores stale responses, filters by type, and routes selection", async () => {
  const root = createElement();
  const searchInput = createInput();
  const renderModels: ShellTemplateData[] = [];
  const arlen = createDocument({ uuid: "Actor.arlen", name: "Arlen Mire", documentName: "Actor", type: "character" });
  const arcaneFocus = createDocument({ uuid: "Item.arcane-focus", name: "Arcane Focus: Iron Rod", documentName: "Item", type: "equipment", img: "icons/focus.webp" });
  const actors = createSearchableCollection([arlen], {
    ar: 120,
    arc: 0
  });
  const items = createSearchableCollection([arcaneFocus], {
    arc: 0
  });

  installShellFixtureRuntime({
    root,
    searchInput,
    actors,
    items,
    renderTemplate: async (_path, data) => {
      renderModels.push(data as ShellTemplateData);
      return "<input data-search-input><a data-action=\"open-search-result\" data-result-id=\"Item.arcane-focus\">Open</a>";
    }
  });

  const shell = createMobileShellController();
  await shell.mount();
  root.dispatch("click", createActionEvent({ action: "navigate", route: "search" }));
  await settle();

  searchInput.value = "a";
  root.dispatch("input", createInputEvent(searchInput));
  await settle();
  assert.deepEqual(renderModels.at(-1)?.search?.results, []);

  searchInput.value = "ar";
  root.dispatch("input", createInputEvent(searchInput));
  await wait(SEARCH_DEBOUNCE_BUFFER_MS);

  searchInput.value = "arc";
  root.dispatch("input", createInputEvent(searchInput));
  await wait(SEARCH_DEBOUNCE_BUFFER_MS + 160);

  assert.deepEqual(
    renderModels.at(-1)?.search?.results.map(result => result.name),
    ["Arcane Focus: Iron Rod"]
  );
  assert.doesNotMatch(JSON.stringify(renderModels.at(-1)), /Arlen Mire/);

  root.dispatch("click", createActionEvent({ action: "search-type-filter", typeFilter: "Item" }));
  await settle();
  assert.deepEqual(
    renderModels.at(-1)?.search?.typeFilters.map(filter => `${filter.label}:${filter.active}`),
    ["All:false", "Character:false", "Item:true", "Journal Entry:false", "Journal Page:false"]
  );

  root.dispatch("click", createActionEvent({ action: "open-search-result", resultId: "Item.arcane-focus" }));
  await settle();
  await settle();

  assert.deepEqual(renderModels.at(-1)?.activeDestination, "search");
  assert.deepEqual(renderModels.at(-1)?.contentType, "document-detail");
  assert.equal(renderModels.at(-1)?.itemDetail?.available, true);
  assert.equal(renderModels.at(-1)?.itemDetail?.name, "Arcane Focus: Iron Rod");
  assert.equal(renderModels.at(-1)?.title, "Arcane Focus: Iron Rod");
  assert.equal(renderModels.at(-1)?.subtitle, "Equipment - equipment");
  assert.equal(renderModels.at(-1)?.portraitImage, "icons/focus.webp");
  assert.deepEqual(root.pushedUrls.at(-1), "http://localhost/game#document=Item.arcane-focus&type=item&source=equipment");
  assert.deepEqual(root.pushedStates.filter(isHistoryState).at(-1)?.route, {
    view: RouteView.DocumentDetail,
    documentUuid: "Item.arcane-focus",
    documentType: "item",
    source: "equipment"
  });

  const searchRouteBeforeSelection = root.replacedStates
    .map(call => call.state)
    .filter(isHistoryState)
    .at(-1)?.route;
  assert.deepEqual(searchRouteBeforeSelection, {
    view: RouteView.Search,
    query: "arc",
    typeFilter: "Item",
    focusedResultId: "Item.arcane-focus",
    scrollTop: 0
  });
});

test("unsupported systems can enable the shell and navigate shared Foundry sections", async () => {
  const root = createElement();
  const models: object[] = [];
  installShellFixtureRuntime({
    root, searchInput: createInput(), systemId: "unsupported-system",
    renderTemplate: async (_path, data) => { models.push(data); return ""; }
  });
  const shell = createMobileShellController();
  try {
    await shell.setMobileViewEnabled(true);
    assert.equal(shell.isMounted(), true);
    for (const route of ["journal", "search", "recents", "settings"]) {
      root.dispatch("click", createActionEvent({ action: "navigate", route }));
      await settle();
      assert.equal((models.at(-1) as ShellTemplateData).activeDestination, route);
    }
  } finally {
    shell.unmount();
  }
});

test("shared search works with journal-only worlds and includes other available documents without system support", async () => {
  const journal = createDocument({ uuid: "JournalEntry.clue", name: "Clue Journal", documentName: "JournalEntry" });
  const hidden = createDocument({ uuid: "JournalEntry.secret", name: "Clue Secret", documentName: "JournalEntry", visible: false });
  const page = { ...createDocument({ uuid: "JournalEntry.clue.JournalEntryPage.page", name: "Page", documentName: "JournalEntryPage" }), text: { content: "A clue within the text" }, parent: journal };
  for (const includeOtherDocuments of [false, true]) {
    installShellFixtureRuntime({
      root: createElement(), searchInput: createInput(), systemId: "unsupported-system",
      journals: [{ ...journal, pages: [page] }, hidden],
      items: includeOtherDocuments ? [createDocument({ uuid: "Item.clue", name: "Clue Item", documentName: "Item" })] : [],
      actors: includeOtherDocuments ? [createDocument({ uuid: "Actor.clue", name: "Clue Actor", documentName: "Actor" })] : [],
      packs: includeOtherDocuments ? [{ collection: "world.clues", documentName: "JournalEntry", visible: true, index: [{ _id: "clue", name: "Clue Compendium" }] }] : [],
      renderTemplate: async () => ""
    });
    assert.deepEqual(getCharacterSheetSearchAdapters(), []);
    const service = createFoundrySearchService({ parentPaneForOwnedItems: "" });
    const results = await service.search({ query: "clue" });
    const expected = [journal.uuid, page.uuid];
    if (includeOtherDocuments) expected.push("Item.clue", "Actor.clue", "Compendium.world.clues.JournalEntry.clue");
    assert.deepEqual(results.map(result => result.uuid).sort(), expected.sort());
  }
});
