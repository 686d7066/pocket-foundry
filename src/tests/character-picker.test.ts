import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { createMobileShellController } from "../core/mobile-shell/controller.ts";
import { RouteHashKey } from "../router/browser-history.ts";
import {
  buildCharacterPickerViewModel as buildCharacterPickerViewModelWithAdapter,
  type CharacterPickerEnvironment
} from "../services/character-picker.ts";
import { characterPickerFavoritesCodec, createFoundryCharacterPickerFavoritesStorage, readCharacterPickerFavoritesFromStorage, setCharacterPickerFavoriteInStorage } from "../services/character-picker-favorites.ts";
import { createActor } from "./support/character-picker-fixture.ts";

const user = { id: "player" };
const testPickerAdapter: CharacterPickerEnvironment["adapter"] = {
  isCharacterPickerActor: actor => actor.type === "character",
  buildCharacterPickerPresentation: ({ actor }) => ({
    typeLabel: "Persona",
    summary: `Profile for ${actor.name ?? "unknown"}`,
    subtitle: "Synthetic profile",
    headerStats: [{ id: "signal", label: "Signal", value: "7" }],
    chips: [{ id: "origin", label: "Origin", value: "Outer Rim" }]
  })
};

/** Builds shared picker test models through an explicitly supplied synthetic adapter. */
function buildCharacterPickerViewModel(environment: Omit<CharacterPickerEnvironment, "adapter">) {
  return buildCharacterPickerViewModelWithAdapter({ ...environment, adapter: testPickerAdapter });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "renderTemplate");
});

test("character picker lists only observable player characters", () => {
  const visibleCharacter = createActor({ uuid: "Actor.visible", name: "Visible Character" });
  const hiddenCharacter = createActor({ uuid: "Actor.hidden", name: "Hidden Character", visible: false });
  const visibleNpc = createActor({ uuid: "Actor.npc", name: "Visible NPC", type: "npc" });

  const model = buildCharacterPickerViewModel({
    actors: [visibleCharacter, hiddenCharacter, visibleNpc],
    user
  });

  assert.equal(model.hasCharacters, true);
  assert.deepEqual(
    model.characters.map(character => character.name),
    ["Visible Character"]
  );
  assert.doesNotMatch(JSON.stringify(model), /Hidden Character|Visible NPC/);
});

test("character picker carries an unrelated adapter presentation without reading actor system data", () => {
  const visiblePilot = createActor({
    uuid: "Actor.pilot",
    name: "Kei Voss",
    type: "pilot",
    system: { plasmaFlux: { current: 91 }, originCode: "RX-7" }
  });
  const limitedPilot = {
    ...createActor({
      uuid: "Actor.limited-pilot",
      name: "Hidden Profile",
      type: "pilot",
      updateable: false,
      userLevel: 1,
      system: { plasmaFlux: { current: 1000 }, originCode: "SECRET" }
    }),
    testUserPermission: (_user: unknown, level: unknown) => level === "LIMITED",
    getUserLevel: () => 1
  };
  let presentationCalls = 0;
  const adapter: CharacterPickerEnvironment["adapter"] = {
    isCharacterPickerActor: actor => actor.type === "pilot",
    buildCharacterPickerPresentation: ({ actor }) => {
      presentationCalls += 1;
      const flux = (actor.system?.plasmaFlux as { current?: number } | undefined)?.current ?? 0;
      return {
        typeLabel: "Void Pilot",
        summary: "RX-7 expedition lead",
        subtitle: "Signal runner",
        headerStats: [
          { id: "flux", label: "Flux", value: String(flux), suffix: "%" },
          { id: "resolve", label: "Resolve", value: "4" },
          { id: "stress", label: "Stress", value: "2" }
        ],
        chips: [{ id: "clearance", label: "Clearance", value: "Gamma" }]
      };
    }
  };

  const model = buildCharacterPickerViewModelWithAdapter({ actors: [visiblePilot, limitedPilot], user, adapter });

  assert.equal(presentationCalls, 1);
  assert.deepEqual(model.characters[0]?.headerStats, [
    { id: "flux", label: "Flux", value: "91", suffix: "%" },
    { id: "resolve", label: "Resolve", value: "4" },
    { id: "stress", label: "Stress", value: "2" }
  ]);
  assert.equal(model.characters[0]?.summary, "RX-7 expedition lead");
  assert.equal(model.characters[0]?.subtitle, "Signal runner");
  assert.deepEqual(model.characters[0]?.chips, [{ id: "clearance", label: "Clearance", value: "Gamma" }]);
  const limitedRow = model.characters.find(row => row.uuid === "Actor.limited-pilot");
  assert.equal(limitedRow?.limited, true);
  assert.equal(limitedRow?.summary, "");
  assert.deepEqual(limitedRow?.headerStats, []);
  assert.doesNotMatch(JSON.stringify(limitedRow), /SECRET|1000/);
});

test("character picker includes limited characters like the Foundry actor directory", () => {
  const limitedCharacter = createActor({
    uuid: "Actor.limited",
    name: "Limited Character",
    updateable: false,
    userLevel: 1
  });
  const noPermissionCharacter = createActor({
    uuid: "Actor.none",
    name: "No Permission Character",
    updateable: false,
    userLevel: 0,
    visible: false
  });

  const model = buildCharacterPickerViewModel({
    actors: [limitedCharacter, noPermissionCharacter],
    user
  });

  assert.deepEqual(model.characters.map(character => character.name), ["Limited Character"]);
});

test("character picker prioritizes owned player characters before observed characters", () => {
  const observed = createActor({ uuid: "Actor.observed", name: "Aster Vale", updateable: false, userLevel: 2 });
  const owned = createActor({ uuid: "Actor.owned", name: "Borin Flint", updateable: true, userLevel: 3 });

  const model = buildCharacterPickerViewModel({
    actors: [observed, owned],
    user
  });

  assert.deepEqual(
    model.characters.map(character => `${character.name}:${character.ownershipLabel}`),
    ["Borin Flint:Owner", "Aster Vale:Observer"]
  );
});

test("character picker template preserves regions and Character terminology", () => {
  const template = readFileSync(new URL("../templates/character-picker.hbs", import.meta.url), "utf8");

  assert.match(template, /class="character-picker-view"/);
  assert.match(template, /character-picker-view[\s\S]*partials\/pane-search-toolbar\.hbs[\s\S]*class="section pf-view-section character-picker"/);
  assert.match(template, /class="section pf-view-section character-picker"/);
  assert.match(template, /partials\/pane-search-toolbar\.hbs/);
  assert.match(template, /<a class="row character-picker-row/);
  assert.match(template, /role="link" tabindex="0"/);
  assert.doesNotMatch(template, new RegExp(`href="#${RouteHashKey.Character}=`));
  assert.doesNotMatch(template, /<button class="row character-picker-row"/);
  assert.match(template, /class="portrait character-picker-portrait"/);
  assert.match(template, /class="title-block character-picker-title-block"/);
  assert.match(template, /class="header-stats character-picker-header-stats"/);
  assert.match(template, /character-picker-row-limited/);
  assert.match(template, /\{\{#if subtitle\}\}<span>\{\{subtitle\}\}<\/span>\{\{\/if\}\}/);
  assert.match(template, /\{\{#if headerStats\.length\}\}[\s\S]*class="header-stats character-picker-header-stats"/);
  assert.match(template, /\{\{#each headerStats\}\}/);
  assert.doesNotMatch(template, /acLabel|acValue|hpLabel|hpValue/);
  assert.match(template, /class="character-folder-toggle"/);
  assert.match(template, /data-action="character-picker-toggle-folder"/);
  assert.match(template, /class="character-picker-block-heading character-picker-block-heading-help"/);
  assert.match(template, /class="character-picker-help-toggle"/);
  assert.match(template, /data-action="character-picker-toggle-favorite-help"/);
  assert.match(template, /fa-circle-info/);
  assert.match(template, /POCKETFOUNDRY\.CharacterPicker\.FavoriteHelpText/);
  assert.match(template, /characterPickerSearch=true/);
  assert.match(template, /addAction="character-picker-add-favorite"/);
  assert.match(template, /removeAction="character-picker-remove-favorite"/);
  assert.doesNotMatch(template, /class="row-action"/);
  assert.doesNotMatch(template, /data-chip="count"/);
  assert.doesNotMatch(template, /<b>Characters<\/b><strong>\{\{characters\.length\}\}<\/strong>/);
  assert.match(template, /data-action="open-character"/);
  assert.doesNotMatch(template, /\bActors?\b/);
});

test("character picker template is registered for Foundry preload", () => {
  const moduleSource = readFileSync(new URL("../module.ts", import.meta.url), "utf8");

  assert.match(moduleSource, /`\$\{TEMPLATE_ROOT\}\/character-picker\.hbs`/);
});

test("character picker rows use anchor semantics and two-line grid rows", () => {
  const css = readFileSync(new URL("../styles/pocket-foundry.css", import.meta.url), "utf8");
  const template = readFileSync(new URL("../templates/character-picker.hbs", import.meta.url), "utf8");

  assert.match(template, /<a class="row character-picker-row/);
  assert.doesNotMatch(template, new RegExp(`href="#${RouteHashKey.Character}=`));
  assert.doesNotMatch(css, /\.pocket-foundry-root button\.row/);
  assert.match(css, /@import "tailwindcss\/theme"/);
  assert.match(css, /@import "tailwindcss\/utilities"/);
  assert.match(css, /\.pocket-foundry-root a \{ @apply text-inherit no-underline; \}/);
  assert.match(css, /\.pocket-foundry-root \.row \{ @apply grid min-h-\[62px\]/);
  assert.match(css, /\.pocket-foundry-root \.character-folder-node/);
  assert.match(css, /\.pocket-foundry-root \.character-folder-toggle \{[\s\S]*position: relative; z-index: 0;/);
  assert.match(css, /\.pocket-foundry-root \.character-folder-children \{[\s\S]*position: relative; z-index: 1;/);
  assert.match(css, /\.pocket-foundry-root \.character-picker-row\.character-picker-row-limited/);
  assert.match(css, /\.pocket-foundry-root \.character-picker-title-block strong \{ @apply block truncate text-\[1\.05rem\]/);
  assert.match(css, /\.pocket-foundry-root \.character-picker-header-stats \.header-stat b \{ @apply text-\[\.64rem\]; \}/);
  assert.match(css, /\.pocket-foundry-root \.character-picker-help-toggle/);
});

test("character picker anchor clicks prevent browser navigation and use the internal router", async () => {
  const root = createElement("div");
  let prevented = false;
  let propagationStopped = false;
  let immediatePropagationStopped = false;
  let renderedRoute = "";
  let pushedUrl = "";
  let persistedCharacterUuid = "";
  const actors = [
    createActor({
      uuid: "Actor.arlen",
      name: "Arlen Mire",
      updateable: true
    })
  ];

  Object.defineProperty(globalThis, "Element", { configurable: true, value: Object });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        dataset: {},
        append: (element: unknown) => {
          root.children.push(element as TestElement);
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
      actors,
      user,
      settings: {
        get: () => true,
        register: () => undefined,
        set: async () => undefined
      }
    }
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      length: 1,
      state: null,
      pushState: (_state: unknown, _unused: string, url?: string | URL | null) => {
        pushedUrl = String(url);
      },
      replaceState: () => undefined,
      back: () => undefined
    }
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: "http://localhost/game", hash: "" }
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: (_key: string, value: string) => {
        persistedCharacterUuid = value;
      }
    }
  });
  Object.defineProperty(globalThis, "renderTemplate", {
    configurable: true,
    value: async (_path: string, data: { activeDestination: string; bottomNav: { items: Array<{ label: string }> } }) => {
      renderedRoute = data.activeDestination;
      assert.equal(data.bottomNav.items[0]?.label, "Characters");
      return `<a class="row character-picker-row" href="#${RouteHashKey.Character}=Actor.arlen&pane=Unavailable" data-action="open-character" data-uuid="Actor.arlen"></a>`;
    }
  });

  const shell = createMobileShellController();
  await shell.mount();
  const clickHandler = root.listeners.get("click");
  assert.ok(clickHandler);

  clickHandler({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      propagationStopped = true;
    },
    stopImmediatePropagation: () => {
      immediatePropagationStopped = true;
    },
    target: {
      closest: () => ({
        dataset: {
          action: "open-character",
          uuid: "Actor.arlen"
        }
      })
    }
  });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(immediatePropagationStopped, true);
  assert.equal(renderedRoute, RouteHashKey.Characters);
  assert.equal(pushedUrl, `http://localhost/game#${RouteHashKey.Character}=Actor.arlen&pane=Unavailable`);
  assert.equal(persistedCharacterUuid, "Actor.arlen");
});

test("persisted selected character becomes the Characters nav shortcut away from the character sheet", async () => {
  const root = createElement("div");
  let firstBottomNavLabel = "";
  const actors = [
    createActor({
      uuid: "Actor.arlen",
      name: "Arlen Mire",
      updateable: true
    })
  ];

  Object.defineProperty(globalThis, "Element", { configurable: true, value: Object });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        dataset: {},
        append: (element: unknown) => {
          root.children.push(element as TestElement);
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
      actors,
      user,
      settings: {
        get: () => true,
        register: () => undefined,
        set: async () => undefined
      }
    }
  });
  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      length: 1,
      state: null,
      pushState: () => undefined,
      replaceState: () => undefined,
      back: () => undefined
    }
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { href: `http://localhost/game#${RouteHashKey.Journal}`, hash: `#${RouteHashKey.Journal}` }
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => "Actor.arlen",
      setItem: () => undefined
    }
  });
  Object.defineProperty(globalThis, "renderTemplate", {
    configurable: true,
    value: async (_path: string, data: { bottomNav: { items: Array<{ label: string }> } }) => {
      firstBottomNavLabel = data.bottomNav.items[0]?.label ?? "";
      return "<main></main>";
    }
  });

  const shell = createMobileShellController();
  await shell.mount();

  assert.equal(firstBottomNavLabel, "Arlen");
});

test("character picker keeps favorites as a flat list and builds nested folder tree", () => {
  const model = buildCharacterPickerViewModel({
    actors: [
      createActor({
        uuid: "Actor.testchar2",
        name: "Testchar 2",
        folder: {
          id: "folder.testchars",
          name: "Testchars",
          sort: 10
        }
      }),
      createActor({
        uuid: "Actor.testlock",
        name: "Testlock Observer",
        folder: {
          id: "folder.testchars",
          name: "Testchars",
          sort: 10
        }
      }),
      createActor({
        uuid: "Actor.testpala",
        name: "Testpala Limited",
        folder: {
          id: "folder.second-level",
          name: "Second Level",
          sort: 20,
          folder: {
            id: "folder.testchars",
            name: "Testchars",
            sort: 10
          }
        }
      })
    ],
    user,
    favoriteActorUuids: ["Actor.testlock"],
    expandedFolderIds: ["folder.testchars", "folder.second-level"]
  });

  assert.equal(model.hasFavorites, true);
  assert.deepEqual(model.favorites.map(character => character.uuid), ["Actor.testlock"]);

  const rootFolder = model.folderTree[0];
  assert.equal(rootFolder?.label, "Testchars");
  assert.equal(rootFolder?.expanded, true);
  assert.deepEqual(rootFolder?.characters.map(character => character.uuid), ["Actor.testchar2", "Actor.testlock"]);
  assert.equal(rootFolder?.childFolders[0]?.label, "Second Level");
  assert.deepEqual(rootFolder?.childFolders[0]?.characters.map(character => character.uuid), ["Actor.testpala"]);
});

test("character picker hides folders that are empty for the current user visibility", () => {
  const model = buildCharacterPickerViewModel({
    actors: [
      createActor({
        uuid: "Actor.testlock",
        name: "Testlock Observer",
        folder: {
          id: "folder.testchars",
          name: "Testchars",
          sort: 10
        }
      }),
      createActor({
        uuid: "Actor.hidden-leaf",
        name: "Hidden Leaf Actor",
        visible: false,
        folder: {
          id: "folder.second-level",
          name: "Second Level",
          sort: 20,
          folder: {
            id: "folder.testchars",
            name: "Testchars",
            sort: 10
          }
        }
      })
    ],
    folders: [
      { id: "folder.testchars", name: "Testchars", type: "Actor", sort: 10, folder: null },
      { id: "folder.second-level", name: "Second Level", type: "Actor", sort: 20, folder: { id: "folder.testchars" } }
    ],
    user,
    expandedFolderIds: ["folder.testchars", "folder.second-level"]
  });

  const rootFolder = model.folderTree[0];
  assert.equal(rootFolder?.label, "Testchars");
  assert.equal(rootFolder?.childFolders.length, 0);
});

test("character picker search filters only by character names", () => {
  const model = buildCharacterPickerViewModel({
    actors: [
      createActor({
        uuid: "Actor.aria",
        name: "Aria Dusk",
        system: {
          details: { species: "Elf", level: 2 }
        }
      }),
      createActor({
        uuid: "Actor.borin",
        name: "Borin Flint",
        system: {
          details: { species: "Aria", level: 4 }
        }
      })
    ],
    user,
    searchQuery: "aria"
  });

  assert.equal(model.searchQuery, "aria");
  assert.equal(model.canClearSearch, true);
  assert.deepEqual(model.characters.map(character => character.name), ["Aria Dusk"]);
});

test("character picker favorites codec deduplicates and normalizes actor UUIDs", () => {
  const parsed = characterPickerFavoritesCodec.parse(`["Actor.a"," Actor.a ","","Actor.b"]`);
  assert.deepEqual(parsed, ["Actor.a", "Actor.b"]);
  assert.equal(characterPickerFavoritesCodec.serialize(["Actor.b", "Actor.b", " Actor.c "]), `["Actor.b","Actor.c"]`);
});

test("Foundry character picker favorites are scoped by current system and user inside the server setting", async () => {
  const settingValues = new Map<string, unknown>();
  const runtime = globalThis as typeof globalThis & {
    game?: {
      settings: {
        get: (_namespace: string, key: string) => unknown;
        set: (_namespace: string, key: string, value: unknown) => Promise<void>;
      };
      user: { id: string };
      system: { id: string };
      world: { id: string };
    };
  };
  runtime.game = {
    settings: {
      get: (_namespace, key) => settingValues.get(key) ?? {},
      set: async (_namespace, key, value) => {
        settingValues.set(key, value);
      }
    },
    user: { id: "User1" },
    system: { id: "fixtureSystem" },
    world: { id: "World1" }
  };

  await setCharacterPickerFavoriteInStorage(createFoundryCharacterPickerFavoritesStorage(), "Actor.arlen", true);
  assert.deepEqual(readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage()), ["Actor.arlen"]);

  runtime.game.system.id = "otherFixture";
  assert.deepEqual(readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage()), []);

  runtime.game.system.id = "fixtureSystem";
  runtime.game.user.id = "User2";
  assert.deepEqual(readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage()), []);

  runtime.game.user.id = "User1";
  assert.deepEqual(readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage()), ["Actor.arlen"]);
});

test("concurrent character picker favorite additions preserve both actors", async () => {
  const settingValues = new Map<string, unknown>();
  const firstWriteStarted = deferred<void>();
  const releaseFirstWrite = deferred<void>();
  let writes = 0;
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      settings: {
        get: (_namespace: string, key: string) => settingValues.get(key) ?? {},
        set: async (_namespace: string, key: string, value: unknown) => {
          writes += 1;
          if (writes === 1) {
            firstWriteStarted.resolve();
            await releaseFirstWrite.promise;
          }
          settingValues.set(key, value);
        }
      },
      user: { id: "User1" },
      system: { id: "fixtureSystem" },
      world: { id: "World1" }
    }
  });

  const first = setCharacterPickerFavoriteInStorage(createFoundryCharacterPickerFavoritesStorage(), "Actor.arlen", true);
  await firstWriteStarted.promise;
  const second = setCharacterPickerFavoriteInStorage(createFoundryCharacterPickerFavoritesStorage(), "Actor.mira", true);
  releaseFirstWrite.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage()), ["Actor.arlen", "Actor.mira"]);
});

test("a rejected character picker favorite write propagates without changing stored state", async () => {
  const settingValues = new Map<string, unknown>();
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      settings: {
        get: (_namespace: string, key: string) => settingValues.get(key) ?? {},
        set: async () => {
          throw new Error("picker favorite setting denied");
        }
      },
      user: { id: "User1" },
      system: { id: "fixtureSystem" },
      world: { id: "World1" }
    }
  });

  const storage = createFoundryCharacterPickerFavoritesStorage();
  await assert.rejects(setCharacterPickerFavoriteInStorage(storage, "Actor.denied", true), /picker favorite setting denied/);
  assert.deepEqual(readCharacterPickerFavoritesFromStorage(storage), []);
});

test("character picker view model does not show favorites from a previous Foundry user", async () => {
  const settingValues = new Map<string, unknown>();
  const runtime = globalThis as typeof globalThis & {
    game?: {
      settings: {
        get: (_namespace: string, key: string) => unknown;
        set: (_namespace: string, key: string, value: unknown) => Promise<void>;
      };
      user: { id: string };
      system: { id: string };
      world: { id: string };
    };
  };
  runtime.game = {
    settings: {
      get: (_namespace, key) => settingValues.get(key) ?? {},
      set: async (_namespace, key, value) => {
        settingValues.set(key, value);
      }
    },
    user: { id: "User1" },
    system: { id: "fixtureSystem" },
    world: { id: "World1" }
  };
  const actors = [
    createActor({ uuid: "Actor.arlen", name: "Arlen Mire" }),
    createActor({ uuid: "Actor.mira", name: "Mira Valen" })
  ];

  await setCharacterPickerFavoriteInStorage(createFoundryCharacterPickerFavoritesStorage(), "Actor.arlen", true);

  const firstUserModel = buildCharacterPickerViewModel({
    actors,
    user,
    favoriteActorUuids: readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage())
  });
  assert.equal(firstUserModel.characters.find(character => character.uuid === "Actor.arlen")?.favorite, true);

  runtime.game.user.id = "User2";
  const secondUserModel = buildCharacterPickerViewModel({
    actors,
    user,
    favoriteActorUuids: readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage())
  });

  assert.equal(secondUserModel.characters.find(character => character.uuid === "Actor.arlen")?.favorite, false);
  assert.deepEqual(secondUserModel.favorites, []);
  assert.equal(secondUserModel.hasFavorites, false);
});

type TestElement = {
  id: string;
  dataset: Record<string, string>;
  innerHTML: string;
  children: TestElement[];
  listeners: Map<string, (event: TestClickEvent) => void>;
  addEventListener: (type: string, handler: (event: TestClickEvent) => void) => void;
  remove: () => void;
};

type TestClickEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
  target: {
    closest: () => {
      dataset: {
        action?: string;
        uuid?: string;
        route?: string;
      };
    };
  };
};

function createElement(_tagName: string): TestElement {
  return {
    id: "",
    dataset: {},
    innerHTML: "",
    children: [],
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    remove() {
      return undefined;
    }
  };
}

/** Creates an explicit promise gate without relying on timing delays. */
function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
