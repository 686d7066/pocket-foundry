import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  buildDnd5eEffectsViewModel,
  deleteTemporaryEffect,
  endEffectConcentration,
  setEffectFavorite,
  toggleCondition,
  toggleEffectDisabled,
  type Dnd5eActiveEffect,
  type Dnd5eEffectsActor,
  type Dnd5eEffectsConfig
} from "../src/systems/dnd5e/effects-view-model.ts";

const user = { id: "player" };
const config: Dnd5eEffectsConfig = {
  specialStatusEffects: { CONCENTRATING: "concentrating" },
  damageTypes: {
    radiant: "Radiant",
    necrotic: "Necrotic"
  },
  conditionTypes: {
    blinded: { name: "Blinded", img: "blind.svg", reference: "Compendium.dnd5e.rules.ConditionBlinded" },
    charmed: { name: "Charmed", img: "charmed.svg" },
    frightened: { name: "Frightened", img: "frightened.svg" },
    grappled: { name: "Grappled", img: "grappled.svg" },
    stunned: { name: "Stunned", img: "stunned.svg" },
    hiddenPseudo: { name: "Hidden Pseudo", pseudo: true }
  }
};

test("effects view model maps dnd5e categories, conditions, and sources", async () => {
  const actor = createEffectsActor();
  const model = await buildDnd5eEffectsViewModel({ actor, user, config });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(
    model.sections.map(section => [section.id, section.label, section.count, section.effects.map(effect => effect.name)]),
    [
      ["temporary", "Active Effects", 2, ["Bless", "Grappled"]],
      ["passive", "Passive Effects", 1, ["Devil's Sight"]],
      ["inactive", "Inactive Effects", 5, ["Blinded", "Charmed", "Jack of All Trades", "Mage Armor", "Stunned"]],
      ["suppressed", "Unavailable", 1, ["Suppressed Ward"]],
      ["enchantmentActive", "Active Enchantments", 1, ["Flaming Blade"]]
    ]
  );

  const bless = model.sections.find(section => section.id === "temporary")?.effects[0];
  assert.equal(bless?.sourceName, "Bless Spell");
  assert.equal(bless?.durationLabel, "9 rounds, 54 seconds");
  assert.deepEqual(bless?.durationParts, ["9 rounds", "54 seconds"]);
  assert.equal(bless?.actions.canToggle, false);
  assert.equal(bless?.actions.canEndConcentration, true);
  assert.equal(bless?.actions.canDelete, true);

  const mageArmor = model.sections.find(section => section.id === "inactive")?.effects[0];
  assert.equal(mageArmor?.active, false);
  assert.equal(mageArmor?.actions.canToggle, true);
  assert.equal(mageArmor?.actions.canDelete, true);

  const jack = model.sections.find(section => section.id === "inactive")?.effects.find(effect => effect.id === "jack");
  assert.deepEqual(jack?.changes, []);

  const passive = model.sections.find(section => section.id === "passive")?.effects[0];
  assert.equal(passive?.actions.canDelete, false);
  assert.equal(passive?.changes.find(change => change.label === "Damage Resistance")?.value, "Radiant");
  assert.equal(passive?.sourceLinkable, false);

  assert.deepEqual(model.conditions.map(condition => [condition.id, condition.name, condition.active, condition.exists, condition.canToggle, condition.showAdd]), [
    ["blinded", "Blinded", false, true, false, false],
    ["charmed", "Charmed", false, true, false, false],
    ["frightened", "Frightened", false, false, true, true],
    ["grappled", "Grappled", true, true, false, false],
    ["stunned", "Stunned", false, true, false, false]
  ]);
  assert.deepEqual(model.status.map(card => [card.id, card.value, card.label]), [
    ["temporary", "2", "Temporary Effects"],
    ["passive", "1", "Passive Effects"],
    ["inactive", "5", "Inactive Effects"],
    ["conditions", "1", "Conditions"],
    ["concentration", "Active", "Bless"]
  ]);
  assert.equal(JSON.stringify(model).includes("Hidden Effect"), false);
  assert.equal(JSON.stringify(model).includes("Hidden Pseudo"), false);
});

test("effects descriptions render enriched HTML when TextEditor is available", async () => {
  const previousTextEditor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const actor = createEffectsActor();
  const bless = getEffect(actor, "bless");
  if (bless) bless.description = "@Embed[Compendium.dnd5e.rules.JournalEntry.some]{Rule Link}";

  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    value: {
      enrichHTML: async (content: string) => content.replace(
        "@Embed[Compendium.dnd5e.rules.JournalEntry.some]{Rule Link}",
        "<a data-uuid=\"Compendium.dnd5e.rules.JournalEntry.some\">Rule Link</a>"
      )
    }
  });

  try {
    const model = await buildDnd5eEffectsViewModel({ actor, user, config });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;

    const row = model.sections.flatMap(section => section.effects).find(effect => effect.id === "bless");
    assert.match(row?.description ?? "", /<a data-uuid="Compendium\.dnd5e\.rules\.JournalEntry\.some">Rule Link<\/a>/);
  } finally {
    if (previousTextEditor) Object.defineProperty(globalThis, "TextEditor", previousTextEditor);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});

test("effects descriptions keep content links but strip roll actions", async () => {
  const previousTextEditor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const actor = createEffectsActor();
  const bless = getEffect(actor, "bless");
  if (bless) bless.description = "<p>Target attempts [[/save ability=wis dc=15 format=long]].</p>";

  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    value: {
      enrichHTML: async (content: string) => content
        .replace("[[/save ability=wis dc=15 format=long]]", "<a class=\"inline-roll\" data-action=\"roll\">WIS Save</a>")
        .replace("Target", "<a class=\"content-link\" data-uuid=\"Compendium.dnd5e.rules.Item.target\">Target</a>")
    }
  });

  try {
    const model = await buildDnd5eEffectsViewModel({ actor, user, config });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;
    const row = model.sections.flatMap(section => section.effects).find(effect => effect.id === "bless");
    assert.match(row?.description ?? "", /WIS Save/);
    assert.doesNotMatch(row?.description ?? "", /data-action="roll"/);
    assert.match(row?.description ?? "", /data-uuid="Compendium\.dnd5e\.rules\.Item\.target"/);
  } finally {
    if (previousTextEditor) Object.defineProperty(globalThis, "TextEditor", previousTextEditor);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});

test("effects view model requires observer permission before rendering", async () => {
  const hiddenActor = createEffectsActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eEffectsViewModel({ actor: hiddenActor, user, config }), {
    unavailable: true,
    title: "Effects Unavailable",
    body: "These effects are not available to the current user."
  });
});

test("effects search filters categories without showing empty effect sections", async () => {
  const model = await buildDnd5eEffectsViewModel({ actor: createEffectsActor(), user, config, searchQuery: "jack" });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.searchQuery, "jack");
  assert.equal(model.canClearSearch, true);
  assert.deepEqual(model.sections.map(section => [section.id, section.effects.map(effect => effect.name)]), [["inactive", ["Jack of All Trades"]]]);
  assert.deepEqual(model.conditions.map(condition => condition.name), []);
  assert.equal(model.showConditions, false);
});

test("effect and condition controls require update permission and call dnd5e APIs", async () => {
  const actor = createEffectsActor();
  const denied = createEffectsActor({
    canUserModify: () => false,
    getUserLevel: () => 2
  });
  const activeEffectImplementation = {
    created: [] as unknown[],
    async fromStatusEffect(id: string) {
      return { id: `dnd5e${id}`, name: id };
    },
    async create(data: unknown, options: unknown) {
      this.created.push([data, options]);
    }
  };

  assert.deepEqual(await toggleEffectDisabled(actor, user, "mage-armor"), { ok: true });
  assert.deepEqual(await toggleCondition(actor, user, "blinded", activeEffectImplementation), { ok: false, reason: "unsupported" });
  assert.deepEqual(await toggleCondition(actor, user, "charmed", activeEffectImplementation), { ok: false, reason: "unsupported" });
  assert.deepEqual(await toggleCondition(actor, user, "frightened", activeEffectImplementation), { ok: true });
  assert.deepEqual(await deleteTemporaryEffect(actor, user, "mage-armor"), { ok: true });
  assert.deepEqual(await deleteTemporaryEffect(actor, user, "devils-sight"), { ok: false, reason: "unsupported" });
  assert.deepEqual(await setEffectFavorite(actor, user, "devils-sight", true), { ok: true });
  assert.deepEqual(await setEffectFavorite(actor, user, "devils-sight", false), { ok: true });
  assert.deepEqual(await endEffectConcentration(actor, user, "bless"), { ok: true });

  assert.deepEqual(getEffect(actor, "mage-armor")?.updates, [{ disabled: false }]);
  assert.equal(getEffect(actor, "mage-armor")?.deleted, 1);
  assert.equal(getEffect(actor, "dnd5eblinded")?.deleted, 0);
  assert.deepEqual(activeEffectImplementation.created, [[{ id: "dnd5efrightened", name: "frightened" }, { parent: actor, keepId: true }]]);
  assert.deepEqual(actor.favoriteCalls, [
    ["add", { type: "effect", id: "ActiveEffect.devils-sight" }],
    ["remove", "ActiveEffect.devils-sight"]
  ]);
  assert.deepEqual(actor.concentrationEnded, ["bless"]);

  assert.deepEqual(await toggleEffectDisabled(denied, user, "mage-armor"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await deleteTemporaryEffect(denied, user, "mage-armor"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await toggleCondition(denied, user, "charmed", activeEffectImplementation), { ok: false, reason: "forbidden" });
  assert.deepEqual(await setEffectFavorite(denied, user, "devils-sight", true), { ok: false, reason: "forbidden" });
  assert.deepEqual(await endEffectConcentration(denied, user, "bless"), { ok: false, reason: "forbidden" });
});

test("effects template and styles preserve required regions with minimal effect rows", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/effects.hbs", import.meta.url), "utf8");
  const rowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/effect-row.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const eventsSource = readFileSync(new URL("../src/core/mobile-shell/events.ts", import.meta.url), "utf8");
  const actionsSource = readFileSync(new URL("../src/core/mobile-shell/actions-character-sheet.ts", import.meta.url), "utf8");
  const actorSheetNavigationSource = readFileSync(new URL("../src/systems/dnd5e/actor-sheet-navigation.ts", import.meta.url), "utf8");
  const navigationSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-navigation.ts", import.meta.url), "utf8");
  const searchSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-search.ts", import.meta.url), "utf8");
  const characterPanesSource = readFileSync(new URL("../src/systems/dnd5e/character-panes.ts", import.meta.url), "utf8");
  const shellSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-shell.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(shellTemplate, /bottom-nav/);
  assert.match(template, /class="content sheet-dense effects-pane"/);
  assert.match(template, /partials\/pane-search-toolbar\.hbs/);
  assert.match(template, /toolbarClass="effects-toolbar"/);
  assert.match(template, /placeholder="Search effects"/);
  assert.match(template, /pane="Effects"/);
  assert.match(template, /value=searchQuery/);
  assert.match(template, /canClear=canClearSearch/);
  assert.match(template, /class="section sheet-group effects-section effects-section-\{\{id\}\}"/);
  assert.match(template, /partials\/effect-row\.hbs/);
  assert.match(rowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(rowTemplate, /class="row sheet-list-row effects-list-row effect-row/);
  assert.match(rowTemplate, /drawerClass="effect-detail-drawer"/);
  assert.match(rowTemplate, /summaryClass="effect-row-summary[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-source-actions"/);
  assert.match(rowTemplate, /bodyClass="pf-expandable-detail-body"/);
  assert.match(rowTemplate, /class="meta-row pf-detail-meta"/);
  assert.match(rowTemplate, /class="pf-detail-facts"/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 160px\), 1fr\)\)/);
  assert.match(rowTemplate, /class="effect-detail-actions[^"]*pf-detail-actions"/);
  assert.match(rowTemplate, /partials\/pill\.hbs/);
  assert.match(rowTemplate, /action="details-open-reference"/);
  assert.match(template, /class="condition-grid effects-condition-grid"/);
  assert.match(template, /class="condition effects-condition/);
  assert.match(rowTemplate, /class="sheet-list-value effects-list-value"/);
  assert.match(rowTemplate, /data-action="effects-delete-temporary"/);
  assert.match(rowTemplate, /data-action="effects-end-concentration"/);
  assert.match(rowTemplate, /fa-solid fa-trash/);
  assert.doesNotMatch(rowTemplate, /data-action="effects-toggle-disabled"/);
  assert.doesNotMatch(template, /fa-ellipsis-vertical|data-action="effects-open-source"|data-action="effects-add-favorite"|data-action="effects-remove-favorite"/);
  assert.match(template, /data-action="effects-toggle-condition"/);
  assert.match(template, /\{\{#if showAdd\}\}/);
  assert.doesNotMatch(template, /fa-toggle-on|fa-toggle-off/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(actorSheetNavigationSource, /buildDnd5eEffectsViewModel/);
  assert.match(actorSheetNavigationSource, /case "Effects":/);
  assert.match(actorSheetNavigationSource, /effects-toggle-condition/);
  assert.match(actorSheetNavigationSource, /deleteTemporaryEffect/);
  assert.match(actorSheetNavigationSource, /effects-delete-temporary/);
  assert.match(searchSource, /getPaneSearchQuery/);
  assert.match(navigationSource, /updatePaneSearch/);
  assert.match(shellSource, /restorePaneSearchFocus/);
  assert.match(eventsSource, /\[data-pane-search-input\]/);
  assert.match(actionsSource, /pane-clear-search/);
  assert.match(characterPanesSource, /effects:search:/);
  assert.match(actorSheetNavigationSource, /effects-toggle-condition/);
  assert.match(css, /\.pocket-foundry-root \.effects-toolbar/);
  assert.match(css, /\.pocket-foundry-root \.effects-sections/);
  assert.match(css, /\.pocket-foundry-root \.effects-list-row/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list-row/);
  assert.match(css, /\.pocket-foundry-root \.condition-grid/);
  assert.doesNotMatch(template, /data-action="create"|data-action="delete"|EffectCreate|Open Sheet|sub-rail|effects-mode-rail/);
});

type TestEffectsActor = Dnd5eEffectsActor & {
  effects: TestEffectCollection;
  favoriteCalls: Array<[string, unknown]>;
  concentrationEnded: string[];
};

type TestEffect = Dnd5eActiveEffect & {
  id: string;
  name: string;
  updates: Record<string, unknown>[];
  deleted: number;
};

class TestEffectCollection extends Array<TestEffect> {
  get(id: string): TestEffect | undefined {
    return this.find(effect => effect.id === id);
  }
}

function createEffectsActor(overrides: Partial<TestEffectsActor> = {}): TestEffectsActor {
  const actor: TestEffectsActor = {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    name: "Arlen Mire",
    system: {
      favorites: ["ActiveEffect.devils-sight"],
      addFavorite: async (favorite: unknown) => {
        actor.favoriteCalls.push(["add", favorite]);
      },
      removeFavorite: async (favorite: unknown) => {
        actor.favoriteCalls.push(["remove", favorite]);
      }
    },
    effects: new TestEffectCollection(),
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    favoriteCalls: [],
    concentrationEnded: [],
    allApplicableEffects: () => actor.effects,
    endConcentration: async effect => {
      actor.concentrationEnded.push(effect.id ?? "");
    },
    ...overrides
  };

  const blessSource = { uuid: "Actor.arlen.Item.bless-spell", name: "Bless Spell" };
  actor.effects.push(
    createEffect(actor, {
      id: "bless",
      name: "Bless",
      img: "bless.svg",
      isTemporary: true,
      statuses: new Set(["concentrating"]),
      duration: { remaining: 9, label: "9 rounds, 54 seconds" },
      changes: [{ key: "system.bonuses.abilities.save", value: "+1d4" }],
      description: "Saving throw bonus.",
      getSource: async () => blessSource
    }),
    createEffect(actor, {
      id: "devils-sight",
      name: "Devil's Sight",
      img: "sight.svg",
      changes: [
        { key: "system.attributes.senses.darkvision", value: "120" },
        { key: "system.traits.dr.value", value: "radiant" }
      ],
      getRelativeUUID: () => "ActiveEffect.devils-sight"
    }),
    createEffect(actor, {
      id: "mage-armor",
      name: "Mage Armor",
      disabled: true,
      isTemporary: true,
      duration: { label: "8 hours" }
    }),
    createEffect(actor, {
      id: "jack",
      name: "Jack of All Trades",
      disabled: true,
      isTemporary: true,
      changes: [{ key: "flags.dnd5e.jackOfAllTrades", value: true }],
      getSource: async () => ({ uuid: "Actor.arlen.Item.jack", name: "Jack of All Trades" })
    }),
    createEffect(actor, {
      id: "suppressed-ward",
      name: "Suppressed Ward",
      isSuppressed: true
    }),
    createEffect(actor, {
      id: "flaming-blade",
      name: "Flaming Blade",
      isAppliedEnchantment: true
    }),
    createEffect(actor, {
      id: "dnd5eblinded",
      name: "Blinded",
      img: "existing-blind.svg",
      disabled: true,
      isTemporary: true,
      statuses: new Set(["blinded"])
    }),
    createEffect(actor, {
      id: "dnd5echarmed0000",
      name: "Charmed",
      img: "charmed.svg",
      disabled: true,
      isTemporary: true,
      statuses: new Set(["charmed"])
    }),
    createEffect(actor, {
      id: "dnd5estunned0000",
      name: "Stunned",
      img: "stunned.svg",
      disabled: true,
      isTemporary: true,
      statuses: new Set(["stunned"])
    }),
    createEffect(actor, {
      id: "dnd5egrappled0000",
      name: "Grappled",
      img: "grappled.svg",
      disabled: false,
      isTemporary: true,
      statuses: new Set(["grappled"])
    }),
    createEffect(actor, {
      id: "hidden",
      name: "Hidden Effect",
      testUserPermission: () => false,
      getUserLevel: () => 0
    })
  );

  return actor;
}

function createEffect(actor: TestEffectsActor, data: Partial<TestEffect> & Pick<TestEffect, "id" | "name">): TestEffect {
  const effect: TestEffect = {
    uuid: `Actor.arlen.ActiveEffect.${data.id}`,
    parent: actor,
    target: actor,
    disabled: false,
    isOwner: true,
    updates: [],
    deleted: 0,
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    update(update: Record<string, unknown>) {
      effect.updates.push(update);
      if ("disabled" in update) effect.disabled = update.disabled as boolean;
      return Promise.resolve();
    },
    delete() {
      effect.deleted += 1;
      return Promise.resolve();
    },
    updateDuration() {
      return undefined;
    },
    ...data
  };
  return effect;
}

function getEffect(actor: TestEffectsActor, id: string): TestEffect | undefined {
  return actor.effects.get(id);
}

