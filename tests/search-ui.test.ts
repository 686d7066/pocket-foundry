import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { createMobileShellController } from "../src/core/mobile-shell/controller.ts";
import { RouteView } from "../src/router/routes.ts";

const user = { id: "player" };

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "addEventListener");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "renderTemplate");
  Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  Reflect.deleteProperty(globalThis, "foundry");
});

function createDocument(options: {
  uuid: string;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  visible?: boolean;
  items?: SearchFixtureDocument[];
}): SearchFixtureDocument {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: options.documentName,
    type: options.type,
    img: options.img,
    visible: options.visible ?? true,
    items: options.items ?? [],
    testUserPermission: (_user, level) => level === "OBSERVER" && (options.visible ?? true),
    canUserModify: () => false,
    getUserLevel: () => (options.visible === false ? 0 : 2)
  };
}

test("search template preserves required regions and registers for preload", () => {
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const searchTemplate = readFileSync(new URL("../src/templates/search.hbs", import.meta.url), "utf8");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8");

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
  const itemDetailTemplate = readFileSync(new URL("../src/templates/item-detail.hbs", import.meta.url), "utf8");
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

const SEARCH_DEBOUNCE_BUFFER_MS = 310;

type SearchFixtureDocument = {
  uuid: string;
  id: string | undefined;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  visible?: boolean;
  items?: SearchFixtureDocument[];
  testUserPermission: (user: unknown, level: string) => boolean;
  canUserModify: (user: unknown, action: string) => boolean;
  getUserLevel: (user: unknown) => number;
};

type ShellTemplateData = {
  activeDestination: string;
  contentType: string;
  title: string;
  subtitle: string;
  portraitImage?: string | null;
  itemDetail?: {
    available: boolean;
    name?: string;
  };
  search?: {
    query: string;
    typeFilters: Array<{ label: string; active: boolean }>;
    results: Array<{ uuid: string; name: string; type: string }>;
  };
};

type TestElement = {
  id: string;
  dataset: Record<string, string>;
  innerHTML: string;
  scrollTop: number;
  children: TestElement[];
  listeners: Map<string, (event: TestEvent) => void>;
  pushedUrls: string[];
  pushedStates: unknown[];
  replacedStates: Array<{ state: unknown; url?: string | URL | null }>;
  addEventListener: (type: string, handler: (event: TestEvent) => void) => void;
  append: (element: TestElement) => void;
  querySelector: <T>(selector: string) => T | null;
  dispatch: (type: string, event: TestEvent) => void;
  remove: () => void;
};

type TestEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
  target: {
    value?: string;
    closest: (selector: string) => {
      dataset: Record<string, string | undefined>;
      value?: string;
    } | null;
  };
};

type TestInput = {
  dataset: Record<string, string>;
  value: string;
  focused: boolean;
  focus: () => void;
  setSelectionRange: () => void;
  closest: () => TestInput;
};

function installShellFixtureRuntime(options: {
  root: TestElement;
  searchInput: TestInput;
  actors?: unknown;
  items?: unknown;
  journals?: unknown;
  packs?: unknown;
  systemId?: string;
  renderTemplate: (path: string, data: object) => Promise<string>;
}): void {
  Object.defineProperty(globalThis, "Element", { configurable: true, value: Object });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        dataset: {},
        append: (element: TestElement) => options.root.append(element)
      },
      createElement: () => options.root,
      getElementById: () => null,
      querySelectorAll: () => []
    }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      actors: options.actors ?? [],
      items: options.items ?? [],
      journal: options.journals ?? [],
      packs: options.packs ?? [],
      system: options.systemId ? { id: options.systemId } : undefined,
      user,
      settings: {
        get: () => true,
        register: () => undefined,
        set: async () => undefined
      }
    }
  });
  const historyFixture = {
    length: 1,
    state: null as unknown,
    pushState: (state: unknown, _unused: string, url?: string | URL | null) => {
      options.root.pushedUrls.push(String(url));
      options.root.pushedStates.push(state);
      historyFixture.state = state;
    },
    replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
      options.root.replacedStates.push({ state, url });
      historyFixture.state = state;
    },
    back: () => undefined
  };
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: historyFixture
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "http://localhost/game", hash: "" }
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => undefined
    }
  });
  Object.defineProperty(globalThis, "renderTemplate", {
    configurable: true,
    value: options.renderTemplate
  });
  Object.defineProperty(globalThis, "foundry", {
    configurable: true,
    value: {
      utils: {
        fromUuid: async (uuid: string) => findByUuid([options.actors, options.items, options.journals], uuid),
        fromUuidSync: (uuid: string) => findByUuid([options.actors, options.items, options.journals], uuid)
      }
    }
  });

  options.root.querySelector = <T,>(selector: string): T | null => (selector === "[data-search-input]" ? (options.searchInput as T) : null);
}

function createElement(): TestElement {
  return {
    id: "",
    dataset: {},
    innerHTML: "",
    scrollTop: 0,
    children: [],
    listeners: new Map(),
    pushedUrls: [],
    pushedStates: [],
    replacedStates: [],
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    append(element) {
      this.children.push(element);
    },
    querySelector() {
      return null;
    },
    dispatch(type, event) {
      this.listeners.get(type)?.(event);
    },
    remove() {
      return undefined;
    }
  };
}

function createInput(): TestInput {
  const input: TestInput = {
    dataset: { searchInput: "" },
    value: "",
    focused: false,
    focus() {
      this.focused = true;
    },
    setSelectionRange() {
      return undefined;
    },
    closest() {
      return input;
    }
  };
  return input;
}

function createActionEvent(data: { action: string; route?: string; typeFilter?: string; resultId?: string }): TestEvent {
  return {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
    target: {
      closest: () => ({
        dataset: {
          action: data.action,
          route: data.route,
          typeFilter: data.typeFilter,
          resultId: data.resultId
        }
      })
    }
  };
}

function createInputEvent(input: TestInput): TestEvent {
  return {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    stopImmediatePropagation: () => undefined,
    target: input
  };
}

function createSearchableCollection(documents: SearchFixtureDocument[], delays: Record<string, number>) {
  return {
    contents: documents,
    search: async ({ query }: { query?: string }) => {
      await wait(delays[query ?? ""] ?? 0);
      const normalizedQuery = (query ?? "").toLocaleLowerCase();
      return documents.filter(document => document.name.toLocaleLowerCase().includes(normalizedQuery));
    },
    [Symbol.iterator]() {
      return documents[Symbol.iterator]();
    }
  };
}

function findByUuid(collections: unknown[], uuid: string): SearchFixtureDocument | null {
  for (const collection of collections) {
    for (const document of flattenCollection(collection)) {
      if (document.uuid === uuid) return document;
    }
  }

  return null;
}

function flattenCollection(collection: unknown): SearchFixtureDocument[] {
  if (!collection) return [];

  const documents = Array.isArray(collection)
    ? collection
    : typeof collection === "object" && "contents" in collection && Array.isArray(collection.contents)
      ? collection.contents
      : [];

  return documents.flatMap(document => [document, ...(document.items ?? [])]);
}

function isHistoryState(value: unknown): value is { route: unknown } {
  return Boolean(value && typeof value === "object" && "route" in value);
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await wait(0);
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

