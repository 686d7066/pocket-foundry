import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { createMobileShellController } from "../src/core/mobile-shell/controller.ts";
import { RouteHashKey } from "../src/router/browser-history.ts";
import { RouteView, ShellDestination } from "../src/router/routes.ts";
import { DND5E_CHARACTER_PANE_CONFIG } from "../src/systems/dnd5e/character-panes.ts";
import {
  buildActorSheetNavigationViewModel,
  createCharacterPaneRoute,
  createOwnedDocumentRoute,
  getPaneFromSwipe,
  isInteractiveSwipeTarget,
  normalizeCharacterPane,
  type ActorSheetNavigationActor
} from "../src/systems/dnd5e/actor-sheet-navigation.ts";
import { getCharacterSheetAdapter } from "../src/systems/character-sheet-adapter-registry.ts";

const user = { id: "player" };

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "foundry");
  Reflect.deleteProperty(globalThis, "renderTemplate");
  Reflect.deleteProperty(globalThis, "addEventListener");
});

function createCharacter(): ActorSheetNavigationActor {
  return {
    uuid: "Actor.arlen",
    id: "arlen",
    name: "Arlen Mire",
    type: "character",
    img: null,
    system: {
      details: { species: "Human", level: 3 },
      attributes: {
        hp: { value: 24, max: 24, temp: 0 },
        ac: { value: 13 }
      }
    },
    items: [{ name: "Warlock", type: "class", system: { levels: 3 } }],
    testUserPermission: (_user, level) => level === "OBSERVER",
    getUserLevel: () => 2
  };
}

test("actor sheet pane list contains every normal dnd5e character pane", () => {
  const model = buildActorSheetNavigationViewModel({
    actor: createCharacter(),
    user,
    activePane: "Details"
  });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(
    model.panes.map(pane => pane.label),
    ["Favorites", "Details", "Inventory", "Features", "Spells", "Effects", "Biography"]
  );
  assert.deepEqual(
    model.panes.map(pane => pane.active),
    [false, true, false, false, false, false, false]
  );
  assert.equal(model.panes[0]?.displayLabel, "★");
  assert.equal(model.panes[0]?.railClass, "icon-only");
  assert.equal(model.actorName, "Arlen Mire");
  assert.equal(model.classSummary, "Human Warlock 3");
});

test("character sheet adapter uses dnd5e only for dnd5e or fixture runtimes", () => {
  const actor = createCharacter();

  Object.defineProperty(globalThis, "game", { configurable: true, value: { system: { id: "dnd5e" } } });

  assert.deepEqual(getCharacterSheetAdapter().getCompendiumSearchCustomization?.().resultTypes, ["Spell"]);
  assert.equal(
    getCharacterSheetAdapter().buildNavigationViewModel({ actor, user, activePane: "Inventory" }).unavailable,
    false
  );

  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: { system: { id: "pf2e" } }
  });

  assert.deepEqual(getCharacterSheetAdapter().buildNavigationViewModel({ actor, user, activePane: "Inventory" }), {
    unavailable: true,
    title: "Character Unavailable",
    body: "pf2e character sheets are not yet supported in the mobile shell. Journal, Search, and Settings are still available."
  });
});

test("dnd5e character pane config owns pane order and compact display labels", () => {
  assert.deepEqual(
    DND5E_CHARACTER_PANE_CONFIG.map(pane => [pane.id, pane.displayLabel, pane.railClass]),
    [
      ["Favorites", "★", "icon-only"],
      ["Details", "Details", ""],
      ["Inventory", "Inventory", ""],
      ["Features", "Features", ""],
      ["Spells", "Spells", ""],
      ["Effects", "Effects", ""],
      ["Biography", "Bio", ""]
    ]
  );
});

test("Bio compact label still normalizes and routes to Biography", () => {
  const model = buildActorSheetNavigationViewModel({
    actor: createCharacter(),
    user,
    activePane: "Bio"
  });

  assert.equal(normalizeCharacterPane("Bio"), "Biography");
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const biographyPane = model.panes.find(pane => pane.id === "Biography");
  assert.equal(biographyPane?.displayLabel, "Bio");
  assert.equal(biographyPane?.active, true);
  assert.deepEqual(createCharacterPaneRoute({ actorUuid: "Actor.arlen", pane: "Bio", scrollTop: 312 }), {
    view: RouteView.Character,
    actorUuid: "Actor.arlen",
    pane: "Biography",
    scrollTop: 312
  });
});

test("pane navigation produces exact character route states", () => {
  assert.deepEqual(createCharacterPaneRoute({ actorUuid: "Actor.arlen", pane: "Inventory", scrollTop: 85 }), {
    view: RouteView.Character,
    actorUuid: "Actor.arlen",
    pane: "Inventory",
    scrollTop: 85
  });
});

test("active navigation to a different character pane starts at top", () => {
  assert.deepEqual(createCharacterPaneRoute({ actorUuid: "Actor.arlen", pane: "Inventory", scrollTop: 0 }), {
    view: RouteView.Character,
    actorUuid: "Actor.arlen",
    pane: "Inventory",
    scrollTop: 0
  });
});

test("back from owned item detail restores the previous actor pane and scroll position", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Inventory", scrollTop: 188 }
  });

  await router.push(
    createOwnedDocumentRoute({
      actorUuid: "Actor.arlen",
      documentUuid: "Actor.arlen.Item.pactBlade",
      parentPane: "Inventory",
      scrollTop: 0
    })
  );

  assert.deepEqual(await router.back(), {
    view: RouteView.Character,
    actorUuid: "Actor.arlen",
    pane: "Inventory",
    scrollTop: 188
  });
});

test("back from a journal link opened inside Biography restores the Biography route", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Biography", scrollTop: 429 }
  });

  await router.push({ view: RouteView.Journal, entryUuid: "Journal.lore", pageUuid: "JournalPage.history", scrollTop: 0 });

  assert.deepEqual(await router.back(), {
    view: RouteView.Character,
    actorUuid: "Actor.arlen",
    pane: "Biography",
    scrollTop: 429
  });
});

test("swipe gestures ignore vertical movement and use horizontal pane movement", () => {
  assert.equal(getPaneFromSwipe("Inventory", { startX: 20, startY: 20, endX: 96, endY: 102 }), null);
  assert.equal(getPaneFromSwipe("Inventory", { startX: 120, startY: 20, endX: 42, endY: 34 }), "Features");
  assert.equal(getPaneFromSwipe("Inventory", { startX: 42, startY: 20, endX: 122, endY: 26 }), "Details");
  assert.equal(getPaneFromSwipe("Details", { startX: 42, startY: 20, endX: 122, endY: 26 }), "Favorites");
  assert.equal(getPaneFromSwipe("Favorites", { startX: 42, startY: 20, endX: 122, endY: 26 }), null);
});

test("swipe gestures ignore interactive controls", () => {
  Object.defineProperty(globalThis, "Element", { configurable: true, value: TestElement });

  assert.equal(isInteractiveSwipeTarget(new TestElement("button") as unknown as EventTarget), true);
  assert.equal(isInteractiveSwipeTarget(new TestElement("input") as unknown as EventTarget), true);
  assert.equal(isInteractiveSwipeTarget(new TestElement("div", "[data-action]") as unknown as EventTarget), true);
  assert.equal(isInteractiveSwipeTarget(new TestElement("section") as unknown as EventTarget), false);
});

test("actor sheet template preserves required regions and Character terminology", () => {
  const template = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8");

  assert.match(template, /class="mf-header actor-sheet-header"/);
  assert.match(template, /class="portrait"/);
  assert.match(template, /class="title-block"/);
  assert.match(template, /class="header-stats/);
  assert.match(template, /class="header-inspiration-button .*inspiration-toggle/);
  assert.match(template, /aria-label="Heroic Inspiration"/);
  assert.match(template, /\{\{#if headerDetails\}\}/);
  assert.match(template, /headerDetails\.header\.hp\.value/);
  assert.match(template, /railClass="pane-rail"/);
  const paneRailTemplate = readFileSync(new URL("../src/templates/partials/pane-rail.hbs", import.meta.url), "utf8");
  assert.match(paneRailTemplate, /aria-label="\{\{label\}\}"/);
  assert.match(paneRailTemplate, /\{\{displayLabel\}\}/);
  assert.match(paneRailTemplate, /class="\{\{railClass\}\}/);
  assert.match(template, /class="content actor-pane-content"/);
  assert.match(shellTemplate, /partials\/bottom-nav\.hbs/);
  assert.match(shellTemplate, /data-content-type="\{\{contentType\}\}"/);
  assert.doesNotMatch(shellTemplate, /isCharacters|isCharacterSheet|isJournal|isRecents|isSearch|isSettings/);
  assert.doesNotMatch(template, /data-action="select-character-pane"/);
  assert.doesNotMatch(template, /sectionPickerLabel/);
  assert.doesNotMatch(template, /<span class="chip accent"><b>Character<\/b>/);
  assert.doesNotMatch(css, /\.pocket-foundry-root \.section-picker/);
  assert.match(css, /@import "tailwindcss\/theme"/);
  assert.match(css, /@import "tailwindcss\/utilities"/);
  assert.match(css, /\.pocket-foundry-root \.rail button\.icon-only[\s\S]*@apply min-w-11/);
  assert.match(css, /--pf-header-height: 72px/);
  assert.match(css, /\.pocket-foundry-root \.header-inspiration-button/);
  assert.match(css, /\.pocket-foundry-root \.header-stats \{ @apply flex min-w-0 flex-nowrap items-center justify-end gap-1 overflow-visible/);
  assert.doesNotMatch(css, /\.pocket-foundry-root \.header-stats::-webkit-scrollbar/);
  assert.doesNotMatch(template, /\bActors?\b/);
});

test("actor sheet template is registered for Foundry preload", () => {
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");

  assert.match(moduleSource, /`\$\{TEMPLATE_ROOT\}\/actor-sheet-shell\.hbs`/);
});

test("mobile shell hydrates the initial character route from the browser hash before writing history", async () => {
  const root = createRootElement();
  const actor = createCharacter();
  const writtenUrls: string[] = [];
  let renderedData: { contentType?: string; actorSheet?: { unavailable: boolean; actorName?: string; activePane?: string; headerDetails?: { unavailable: boolean; header?: { name: string } }; details?: unknown } } | undefined;

  Object.defineProperty(globalThis, "Element", { configurable: true, value: Object });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        dataset: {},
        append: (element: unknown) => {
          root.children.push(element as TestRootElement);
        }
      },
      createElement: () => root,
      getElementById: () => root,
      querySelectorAll: () => []
    }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      system: { id: "dnd5e" },
      user,
      actors: [actor],
      settings: {
        get: () => true,
        register: () => undefined,
        set: async () => undefined
      }
    }
  });
  Object.defineProperty(globalThis, "foundry", {
    configurable: true,
    value: {
      utils: {
        fromUuidSync: (uuid: string) => (uuid === "Actor.arlen" ? actor : null)
      }
    }
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      length: 1,
      state: null,
      pushState: (_state: unknown, _unused: string, url?: string | URL | null) => {
        writtenUrls.push(String(url));
      },
      replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => {
        writtenUrls.push(String(url));
      },
      back: () => undefined
    }
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
        href: `http://localhost/game#${RouteHashKey.Character}=Actor.arlen&pane=Inventory`,
        hash: `#${RouteHashKey.Character}=Actor.arlen&pane=Inventory`
    }
  });
  Object.defineProperty(globalThis, "renderTemplate", {
    configurable: true,
    value: async (_path: string, data: typeof renderedData) => {
      renderedData = data;
      return `<main class="pocket-foundry-root mf-app" data-view="${ShellDestination.Characters}"></main>`;
    }
  });

  const shell = createMobileShellController();
  await shell.mount();

  assert.equal(renderedData?.contentType, "character");
  assert.equal(renderedData?.actorSheet?.unavailable, false);
  assert.equal(renderedData?.actorSheet?.actorName, "Arlen Mire");
  assert.equal(renderedData?.actorSheet?.activePane, "Inventory");
  assert.equal(renderedData?.actorSheet?.headerDetails?.unavailable, false);
  assert.equal(renderedData?.actorSheet?.details, undefined);
  assert.equal(writtenUrls.at(-1), `http://localhost/game#${RouteHashKey.Character}=Actor.arlen&pane=Inventory`);
  assert.ok(!writtenUrls.includes(`http://localhost/game#${RouteHashKey.Characters}`));
});

class TestElement {
  private readonly tagName: string;
  private readonly selector: string;

  constructor(tagName: string, selector = "") {
    this.tagName = tagName;
    this.selector = selector;
  }

  closest(selector: string): TestElement | null {
    if (selector.includes(this.tagName)) return this;
    if (this.selector && selector.includes(this.selector)) return this;
    return null;
  }
}

type TestRootElement = {
  id: string;
  dataset: Record<string, string>;
  innerHTML: string;
  scrollTop: number;
  children: TestRootElement[];
  listeners: Map<string, EventListener>;
  addEventListener: (type: string, handler: EventListener) => void;
  querySelector: () => null;
  remove: () => void;
};

function createRootElement(): TestRootElement {
  return {
    id: "",
    dataset: {},
    innerHTML: "",
    scrollTop: 0,
    children: [],
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    querySelector: () => null,
    remove: () => undefined
  };
}

