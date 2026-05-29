import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { FAVORITES_SETTING } from "../src/core/settings.ts";
import {
  adjustFavoriteValue,
  buildDnd5eFavoritesViewModel,
  removeFavorite,
  setContextFavorite,
  useFavorite,
  type Dnd5eFavoriteDocument,
  type Dnd5eFavoritesActor,
  type Dnd5eFavoritesConfig
} from "../src/systems/dnd5e/favorites-view-model.ts";

const user = { id: "player" };
const config: Dnd5eFavoritesConfig = {
  abilities: {
    int: { label: "Intelligence" },
    dex: { label: "Dexterity" }
  },
  skills: {
    arc: { label: "Arcana", icon: "arcana.svg", reference: "Compendium.dnd5e.rules.Skills" }
  },
  tools: {
    thieves: { label: "Thieves' Tools", img: "tools.svg", reference: "Compendium.dnd5e.items.ThievesTools" }
  },
  spellcasting: {
    pact: { img: "pact-{id}.svg", isSR: true }
  }
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
});

test("favorites view model preserves dnd5e order and maps prepared display fields", async () => {
  const actor = createFavoritesActor();
  const model = await buildDnd5eFavoritesViewModel({ actor, user, config, fromUuid: createResolver(actor) });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.rows.map(row => [row.type, row.title]), [
    ["resource", "Infernal Favor"],
    ["slots", "Pact Magic Slots"],
    ["skill", "Arcana"],
    ["tool", "Thieves' Tools"],
    ["item", "Dagger"],
    ["activity", "Hex Curse"],
    ["effect", "Devil's Sight"]
  ]);

  const slots = model.rows.find(row => row.type === "slots");
  assert.deepEqual(slots?.primary, { kind: "uses", label: "Uses", value: "2", max: "2", active: true });
  assert.equal(slots?.secondary, "");
  assert.equal(slots?.subtitle, "2nd Level - SR");

  const skill = model.rows.find(row => row.type === "skill");
  assert.equal(skill?.primary.value, "+3");
  assert.equal(skill?.secondary, "passive 13");

  const item = model.rows.find(row => row.type === "item");
  assert.equal(item?.title, "Dagger");
  assert.equal(item?.primary.value, "+4");
  assert.equal(item?.secondary, "20/60 ft");
  assert.equal(item?.canInspect, true);

  const activity = model.rows.find(row => row.type === "activity");
  assert.equal(activity?.title, "Hex Curse");
  assert.equal(activity?.primary.value, "2");
  assert.equal(activity?.primary.max, "3");

  const effect = model.rows.find(row => row.type === "effect");
  assert.equal(effect?.primary.kind, "toggle");
  assert.equal(effect?.primary.value, "on");

  assert.deepEqual(model.sections.map(section => [section.kind, section.label]), [
    ["skills", "Skills"],
    ["tools", "Tools"],
    ["inventory", "Inventory"],
    ["effects", "Effects"],
    ["legacy-resources", "Resources"]
  ]);
  const inventorySection = model.sections.find(section => section.kind === "inventory");
  assert.equal(inventorySection?.kind === "inventory" ? inventorySection.items[0]?.name : "", "Dagger");
  const skillSection = model.sections.find(section => section.kind === "skills");
  assert.equal(skillSection?.kind === "skills" ? skillSection.skills[0]?.id : "", "arc");
});

test("favorites hide missing or hidden targets without leaking private metadata", async () => {
  const actor = createFavoritesActor();
  actor.system.favorites = [
    { type: "item", id: ".Item.hidden-dagger", sort: 1000 },
    { type: "item", id: ".Item.missing", sort: 2000 },
    { type: "item", id: ".Item.dagger", sort: 3000 }
  ];

  const model = await buildDnd5eFavoritesViewModel({ actor, user, config, fromUuid: createResolver(actor) });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.rows.map(row => row.title), ["Infernal Favor", "Dagger"]);
  assert.equal(JSON.stringify(model).includes("Hidden Dagger"), false);
  assert.equal(JSON.stringify(model).includes("missing"), false);
});

test("favorites view model requires observer permission before rendering", async () => {
  const hiddenActor = createFavoritesActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eFavoritesViewModel({ actor: hiddenActor, user, config, fromUuid: createResolver(hiddenActor) }), {
    unavailable: true,
    title: "Favorites Unavailable",
    body: "These favorites are not available to the current user."
  });
});

test("favorites restore and persist through Foundry settings by current system, user, and actor", async () => {
  const actor = createFavoritesActor();
  actor.system.favorites = [];
  const settingValues = new Map<string, unknown>([
    [
      FAVORITES_SETTING,
      {
        dnd5e: {
          player: {
            "Actor.arlen": [{ type: "skill", id: "arc", sort: 1000 }]
          }
        }
      }
    ]
  ]);
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { id: "player" },
      system: { id: "dnd5e" },
      settings: {
        get: (_namespace: string, key: string) => settingValues.get(key) ?? {},
        set: async (_namespace: string, key: string, value: unknown) => {
          settingValues.set(key, value);
        }
      }
    }
  });

  const model = await buildDnd5eFavoritesViewModel({ actor, user, config, fromUuid: createResolver(actor) });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;
  assert.deepEqual(model.rows.map(row => [row.type, row.title]), [
    ["resource", "Infernal Favor"],
    ["skill", "Arcana"]
  ]);

  assert.deepEqual(await setContextFavorite(actor, user, "tool", "thieves", true), { ok: true });
  assert.deepEqual(
    (((settingValues.get(FAVORITES_SETTING) as Record<string, unknown>).dnd5e as Record<string, unknown>).player as Record<string, unknown>)["Actor.arlen"],
    [
      { type: "skill", id: "arc", sort: 1000 },
      { type: "tool", id: "thieves", sort: 101000 }
    ]
  );

  (globalThis as typeof globalThis & { game: { system: { id: string } } }).game.system.id = "pf2e";
  const otherSystemModel = await buildDnd5eFavoritesViewModel({ actor, user, config, fromUuid: createResolver(actor) });
  assert.equal(otherSystemModel.unavailable, false);
  if (otherSystemModel.unavailable) return;
  assert.deepEqual(otherSystemModel.rows.map(row => [row.type, row.title]), [["resource", "Infernal Favor"]]);
});

test("favorite play actions check permissions and call dnd5e document APIs", async () => {
  const actor = createFavoritesActor();
  const denied = createFavoritesActor({
    canUserModify: () => false,
    getUserLevel: () => 2
  });
  const resolver = createResolver(actor);

  assert.deepEqual(await useFavorite(actor, user, ".Item.dagger", "item", undefined, resolver), { ok: true });
  assert.deepEqual(await useFavorite(actor, user, ".Item.hex.Activity.curse", "activity", undefined, resolver), { ok: true });
  assert.deepEqual(await useFavorite(actor, user, ".ActiveEffect.devils-sight", "effect", undefined, resolver), { ok: true });
  assert.deepEqual(await useFavorite(actor, user, "arc", "skill", undefined, resolver), { ok: true });
  assert.deepEqual(await useFavorite(actor, user, "thieves", "tool", undefined, resolver), { ok: true });
  assert.deepEqual(await useFavorite(actor, user, "pact", "slots", undefined, resolver), { ok: false, reason: "unsupported" });
  assert.deepEqual(await adjustFavoriteValue(actor, user, "resources.primary", "resource", -1, resolver), { ok: true });
  assert.deepEqual(await adjustFavoriteValue(actor, user, ".Item.hex.Activity.curse", "activity", -1, resolver), { ok: true });
  assert.deepEqual(await setContextFavorite(actor, user, "item", ".Item.dagger", true), { ok: true });
  assert.deepEqual(await setContextFavorite(actor, user, "skill", "arc", true), { ok: true });
  assert.deepEqual(await setContextFavorite(actor, user, "slots", "pact", true), { ok: true });
  assert.deepEqual(await removeFavorite(actor, user, ".Item.dagger"), { ok: true });

  assert.equal(getItem(actor, "dagger")?.used, 1);
  assert.equal(getActivity(actor)?.used, 1);
  assert.deepEqual(getEffect(actor, "devils-sight")?.updates, [{ disabled: true }]);
  assert.deepEqual(actor.skillRolls, ["arc"]);
  assert.deepEqual(actor.toolRolls, ["thieves"]);
  assert.deepEqual(actor.actorUpdates, [{ "system.resources.primary.value": 1 }]);
  assert.deepEqual(getItem(actor, "hex")?.updates, [{ "system.activities.curse.uses.value": 1 }]);
  assert.deepEqual(actor.favoriteCalls, [
    ["add", { type: "item", id: ".Item.dagger" }],
    ["add", { type: "skill", id: "arc" }],
    ["add", { type: "slots", id: "pact" }],
    ["remove", ".Item.dagger"]
  ]);

  assert.deepEqual(await useFavorite(denied, user, ".Item.dagger", "item", undefined, createResolver(denied)), { ok: false, reason: "forbidden" });
  assert.deepEqual(await adjustFavoriteValue(denied, user, "resources.primary", "resource", -1, createResolver(denied)), { ok: false, reason: "forbidden" });
  assert.deepEqual(await removeFavorite(denied, user, ".Item.dagger"), { ok: false, reason: "forbidden" });
});

test("favorites template, styles, and shell wiring preserve required regions", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/favorites.hbs", import.meta.url), "utf8");
  const favoriteContextMenuTemplate = readFileSync(new URL("../src/templates/partials/favorite-context-menu.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const detailsTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/details.hbs", import.meta.url), "utf8");
  const detailsSkillRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/details-skill-row.hbs", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const actorSheetNavigationSource = readFileSync(new URL("../src/systems/dnd5e/actor-sheet-navigation.ts", import.meta.url), "utf8");
  const eventsSource = readFileSync(new URL("../src/core/mobile-shell/events.ts", import.meta.url), "utf8");
  const uiSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-ui.ts", import.meta.url), "utf8");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(shellTemplate, /bottom-nav/);
  assert.match(template, /class="content sheet-dense favorites-pane"/);
  assert.match(template, /class="favorites-help"/);
  assert.match(template, /\{\{helpText\}\}/);
  assert.match(template, /class="compact-panels favorites-sections"/);
  assert.match(template, /data-favorite-kind="\{\{kind\}\}"/);
  assert.match(template, /partials\/details-skill-row\.hbs/);
  assert.match(template, /partials\/details-tool-row\.hbs/);
  assert.match(template, /partials\/inventory-list-row\.hbs/);
  assert.match(template, /partials\/spell-row\.hbs/);
  assert.match(template, /partials\/feature-row\.hbs/);
  assert.match(template, /partials\/effect-row\.hbs/);
  assert.match(template, /partials\/favorite-context-menu\.hbs/);
  assert.match(template, /class="item-icon"/);
  assert.match(template, /removeAction="favorites-remove-context"/);
  assert.match(favoriteContextMenuTemplate, /class="favorite-context-menu"/);
  assert.match(detailsTemplate, /partials\/details-skill-row\.hbs/);
  assert.match(detailsSkillRowTemplate, /addAction="context-add-favorite"/);
  assert.match(detailsSkillRowTemplate, /favoriteType="skill"/);
  assert.doesNotMatch(template, /data-action="create"|data-action="delete"|Open Sheet|sub-rail|favorites-mode-rail|fa-ellipsis-vertical/);
  assert.doesNotMatch(detailsTemplate, /<h2>Favorites<\/h2>|data-region="details-favorites"/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(actorSheetNavigationSource, /buildDnd5eFavoritesViewModel/);
  assert.match(actorSheetNavigationSource, /case "Favorites":/);
  assert.match(actorSheetNavigationSource, /favorites-remove-context/);
  assert.match(actorSheetNavigationSource, /getFavoriteContextGestureLabel/);
  assert.match(eventsSource, /contextmenu/);
  assert.match(eventsSource, /favoriteLongPressTimer/);
  assert.match(eventsSource, /openFavoriteContextMenu/);
  assert.match(uiSource, /favorite-action-sheet/);
  assert.match(uiSource, /favorite-context-close/);
  assert.match(css, /\.pocket-foundry-root \.favorites-panel/);
  assert.match(css, /\.pocket-foundry-root \.favorites-help/);
  assert.match(css, /\.pocket-foundry-root \.favorites-list/);
  assert.match(css, /\.pocket-foundry-root \.favorite-row/);
  assert.match(css, /\.pocket-foundry-root \.favorite-primary/);
  assert.match(css, /\.pocket-foundry-root \.favorite-secondary/);
  assert.match(css, /\.pocket-foundry-root \.favorite-context-menu/);
  assert.match(css, /\.pocket-foundry-root \.favorite-action-sheet/);
  assert.match(css, /\.pocket-foundry-root \.favorite-action-button/);
});

type TestFavoritesActor = Dnd5eFavoritesActor & {
  system: Record<string, unknown> & {
    resources: Record<string, unknown>;
    favorites: unknown[];
    spells: Record<string, unknown>;
  };
  items: TestFavoriteDocument[];
  effects: TestFavoriteDocument[];
  actorUpdates: Record<string, unknown>[];
  favoriteCalls: Array<[string, unknown]>;
  skillRolls: string[];
  toolRolls: string[];
};

type TestFavoriteDocument = Dnd5eFavoriteDocument & {
  id: string;
  used?: number;
  updates?: Record<string, unknown>[];
};

function createFavoritesActor(overrides: Partial<TestFavoritesActor> = {}): TestFavoritesActor {
  const actor = {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    name: "Arlen Mire",
    _source: {
      system: {
        resources: {
          primary: { value: 2, max: 3, label: "Infernal Favor", sr: true, lr: false }
        }
      }
    },
    system: {
      resources: {
        primary: { value: 2, max: 3, label: "Infernal Favor", sr: true, lr: false }
      },
      favorites: [
        { type: "effect", id: ".ActiveEffect.devils-sight", sort: 7000 },
        { type: "item", id: ".Item.dagger", sort: 4000 },
        { type: "slots", id: "pact", sort: 1000 },
        { type: "skill", id: "arc", sort: 2000 },
        { type: "activity", id: ".Item.hex.Activity.curse", sort: 5000 },
        { type: "tool", id: "thieves", sort: 3000 }
      ],
      skills: {
        arc: { total: 3, passive: 13, ability: "int" }
      },
      tools: {
        thieves: { total: 6, passive: 16, ability: "dex" }
      },
      spells: {
        pact: { value: 2, max: 2, level: 2, type: "pact" }
      },
      addFavorite(favorite: unknown) {
        actor.favoriteCalls.push(["add", favorite]);
        return Promise.resolve();
      },
      removeFavorite(id: string) {
        actor.favoriteCalls.push(["remove", id]);
        return Promise.resolve();
      }
    },
    items: [],
    effects: [],
    actorUpdates: [],
    favoriteCalls: [],
    skillRolls: [],
    toolRolls: [],
    testUserPermission: () => true,
    canUserModify: () => true,
    getUserLevel: () => 3,
    update(data: Record<string, unknown>) {
      actor.actorUpdates.push(data);
      if ("system.resources.primary.value" in data) actor.system.resources.primary = { ...(actor.system.resources.primary as object), value: data["system.resources.primary.value"] };
      return Promise.resolve();
    },
    rollSkill({ skill }: { skill: string }) {
      actor.skillRolls.push(skill);
      return Promise.resolve();
    },
    rollToolCheck({ tool }: { tool: string }) {
      actor.toolRolls.push(tool);
      return Promise.resolve();
    },
    ...overrides
  } satisfies TestFavoritesActor;

  const dagger = createFavoriteDocument(actor, {
    id: "dagger",
    uuid: "Actor.arlen.Item.dagger",
    name: "Dagger",
    type: "weapon",
    img: null,
    system: {
      getFavoriteData: () => ({
        img: null,
        title: "Dagger",
        subtitle: "Simple Melee Weapon",
        modifier: 4,
        range: { value: 20, long: 60, units: "ft" }
      })
    }
  });
  const hiddenDagger = createFavoriteDocument(actor, {
    id: "hidden-dagger",
    uuid: "Actor.arlen.Item.hidden-dagger",
    name: "Hidden Dagger",
    testUserPermission: () => false,
    getUserLevel: () => 0,
    system: {
      getFavoriteData: () => ({
        title: "Hidden Dagger",
        subtitle: "Private weapon",
        modifier: 99
      })
    }
  });
  const hex = createFavoriteDocument(actor, {
    id: "hex",
    uuid: "Actor.arlen.Item.hex",
    name: "Hex",
    type: "spell",
    updates: []
  });
  const curse = createFavoriteDocument(actor, {
    id: "curse",
    uuid: "Actor.arlen.Item.hex.Activity.curse",
    name: "Hex Curse",
    item: hex,
    getFavoriteData: () => ({
      img: "hex.svg",
      title: "Hex Curse",
      subtitle: "Bonus Action",
      uses: { value: 2, max: 3, name: "system.activities.curse.uses.value" },
      range: { value: 90, units: "ft" }
    })
  });
  const devilsSight = createFavoriteDocument(actor, {
    id: "devils-sight",
    uuid: "Actor.arlen.ActiveEffect.devils-sight",
    name: "Devil's Sight",
    disabled: false,
    updates: [],
    getFavoriteData: () => ({
      img: "sight.svg",
      title: "Devil's Sight",
      subtitle: "Eldritch Invocation Effect",
      toggle: true,
      range: { value: 120, units: "ft" }
    })
  });

  actor.items = [dagger, hiddenDagger, hex];
  actor.effects = [devilsSight];
  actor.items.push(curse);
  return actor;
}

function createFavoriteDocument(actor: TestFavoritesActor, data: Partial<TestFavoriteDocument>): TestFavoriteDocument {
  const document = {
    id: data.id ?? "",
    uuid: data.uuid,
    parent: actor,
    updates: [],
    testUserPermission: () => true,
    getUserLevel: () => 3,
    use() {
      document.used = (document.used ?? 0) + 1;
      return Promise.resolve();
    },
    update(update: Record<string, unknown>) {
      document.updates?.push(update);
      return Promise.resolve();
    },
    ...data
  } satisfies TestFavoriteDocument;
  return document;
}

function createResolver(actor: TestFavoritesActor) {
  return async (uuid: string): Promise<TestFavoriteDocument | null> => {
    const id = uuid.split(".").at(-1);
    if (!id) return null;
    return actor.items.find(item => item.id === id || item.uuid === uuid || `.${item.uuid?.replace(actor.uuid ?? "", "").replace(/^\./, "")}` === uuid)
      ?? actor.effects.find(effect => effect.id === id || effect.uuid === uuid || `.${effect.uuid?.replace(actor.uuid ?? "", "").replace(/^\./, "")}` === uuid)
      ?? null;
  };
}

function getItem(actor: TestFavoritesActor, id: string): TestFavoriteDocument | undefined {
  return actor.items.find(item => item.id === id);
}

function getActivity(actor: TestFavoritesActor): TestFavoriteDocument | undefined {
  return actor.items.find(item => item.id === "curse");
}

function getEffect(actor: TestFavoritesActor, id: string): TestFavoriteDocument | undefined {
  return actor.effects.find(effect => effect.id === id);
}

