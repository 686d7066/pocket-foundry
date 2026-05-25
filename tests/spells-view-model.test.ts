import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  adjustSpellRemainingUses,
  buildDnd5eSpellsViewModel,
  getNextSpellSlotValue,
  rechargeSpell,
  setSpellFavorite,
  setSpellcastingAbility,
  toggleSpellPrepared,
  toggleSpellSlotPip,
  useSpellActivity,
  useSpellItem,
  type Dnd5eSpellActivity,
  type Dnd5eSpellItem,
  type Dnd5eSpellsActor,
  type Dnd5eSpellsConfig
} from "../src/systems/dnd5e/spells-view-model.ts";

const user = { id: "player" };
const config: Dnd5eSpellsConfig = {
  spellcasting: {
    spell: {
      key: "spell",
      order: 100,
      slots: true,
      cantrips: true,
      prepares: true,
      getAvailableLevels: () => [1, 2],
      getSpellSlotKey: level => `spell${level ?? 1}`,
      getLabel: ({ level }) => (level === 0 ? "Cantrips" : `${level} Level`)
    },
    pact: {
      key: "pact",
      order: 200,
      slots: true,
      getAvailableLevels: () => [2],
      getSpellSlotKey: () => "pact",
      getLabel: () => "Pact Magic"
    },
    innate: {
      key: "innate",
      order: 300,
      slots: false,
      getAvailableLevels: () => [],
      getSpellSlotKey: () => "innate",
      getLabel: () => "Innate"
    }
  },
  abilities: { cha: { abbreviation: "CHA", label: "Charisma" } },
  spellSchools: { evo: "Evocation", enc: "Enchantment", con: "Conjuration", abj: "Abjuration" },
  spellPreparationStates: {
    always: { value: "always", label: "Always prepared" },
    prepared: { value: true, label: "Prepared" },
    unprepared: { value: false, label: "Unprepared" }
  }
};

test("spells view model maps spellcasting cards, slot tracks, and dnd5e spellbook sections", async () => {
  const actor = createSpellsActor();
  const model = await buildDnd5eSpellsViewModel({ actor, user, config });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.spellcasting.map(card => [card.label, card.abilityLabel, card.abilityMod, card.attack, card.save, card.prepared, card.primary]), [
    ["Warlock Spellcasting", "CHA", "+3", "+5", "13", "4/5", true]
  ]);

  assert.deepEqual(
    model.slotTracks.map(track => [track.id, track.label, track.levelLabel, track.value, track.max, track.displayMax, track.pips.map(pip => [pip.n, pip.filled, pip.temporary])]),
    [
      ["spell1", "1 Level", "1st level", 3, 2, 3, [[1, true, false], [2, true, false], [3, true, true]]],
      ["spell2", "2 Level", "2nd level", 0, 1, 1, [[1, false, false]]],
      ["pact", "Pact", "2nd level", 2, 2, 2, [[1, true, false], [2, true, false]]]
    ]
  );

  assert.deepEqual(
    model.sections.map(section => [section.id, section.label, section.count, section.spells.map(spell => spell.name)]),
    [
      ["spell0", "Cantrips", 1, ["Eldritch Blast"]],
      ["spell1", "1 Level", 2, ["Armor of Agathys", "Hex"]],
      ["spell2", "2 Level", 1, ["Misty Step"]],
      ["pact", "Pact Magic", 1, ["Mirror Image"]],
      ["innate", "Innate", 1, ["Hellish Rebuke"]]
    ]
  );

  const hex = model.sections.find(section => section.id === "spell1")?.spells.find(spell => spell.name === "Hex");
  assert.equal(hex?.subtitle, "Fiend Patron - V,S,M");
  assert.equal(hex?.source, "Fiend Patron");
  assert.equal(hex?.components, "V,S,M");
  assert.equal(hex?.activation, "BA");
  assert.equal(hex?.range, "90 ft");
  assert.equal(hex?.target, "1 creature");
  assert.equal(hex?.roll, "WIS 13");
  assert.equal(hex?.activities[0]?.roll, "WIS 13");
  assert.equal(hex?.preparedLabel, "Prepared");
  assert.equal(hex?.alwaysPrepared, false);
  assert.match(hex?.description ?? "", /curse a creature/i);
  assert.equal(hex?.actions.canUse, true);
  assert.equal(hex?.actions.canPrepare, true);
  assert.equal(hex?.actions.canAdjustUses, true);
  const eldritchBlast = model.sections.find(section => section.id === "spell0")?.spells.find(spell => spell.name === "Eldritch Blast");
  assert.equal(eldritchBlast?.actions.canPrepare, false);
  const hellishRebuke = model.sections.find(section => section.id === "innate")?.spells.find(spell => spell.name === "Hellish Rebuke");
  assert.equal(hellishRebuke?.actions.canPrepare, false);
  const mirrorImage = model.sections.find(section => section.id === "pact")?.spells.find(spell => spell.name === "Mirror Image");
  assert.equal(mirrorImage?.activation, "1h");
  assert.equal(JSON.stringify(model).includes("Hidden Spell"), false);
});

test("spellcasting cards fall back to class preparation max when merged spellcasting max is zero", async () => {
  const actor = createSpellsActor();
  const spellClass = actor.spellcastingClasses?.warlock as
    | (Dnd5eSpellItem & { spellcasting?: Record<string, unknown>; system?: Record<string, unknown> })
    | undefined;
  if (!spellClass) throw new Error("Missing spellcasting class fixture.");

  spellClass.spellcasting = { ...(spellClass.spellcasting ?? {}), preparation: { value: 6, max: 0 } };
  spellClass.system = {
    ...(spellClass.system ?? {}),
    spellcasting: {
      ...(((spellClass.system ?? {}) as { spellcasting?: Record<string, unknown> }).spellcasting ?? {}),
      preparation: { value: 6, max: 6 }
    }
  };

  const model = await buildDnd5eSpellsViewModel({ actor, user, config });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.spellcasting[0]?.prepared, "6/6");
});

test("spells view model requires observer permission before rendering", async () => {
  const hiddenActor = createSpellsActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eSpellsViewModel({ actor: hiddenActor, user, config }), {
    unavailable: true,
    title: "Spells Unavailable",
    body: "These spells are not available to the current user."
  });
});

test("spells search filters rows inside visible method and level sections", async () => {
  const model = await buildDnd5eSpellsViewModel({ actor: createSpellsActor(), user, config, searchQuery: "hex" });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.searchQuery, "hex");
  assert.equal(model.canClearSearch, true);
  assert.deepEqual(
    model.sections.map(section => [section.id, section.filtered, section.count, section.spells.map(spell => spell.name)]),
    [
      ["spell1", true, 1, ["Hex"]]
    ]
  );
});

test("spells search uses title-only matching and ignores activity/metadata text", async () => {
  const model = await buildDnd5eSpellsViewModel({ actor: createSpellsActor(), user, config, searchQuery: "wis 13" });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.sections.flatMap(section => section.spells.map(spell => spell.name)), []);
  assert.equal(JSON.stringify(model).includes("Hidden Spell"), false);
});

test("spell descriptions keep normal links but strip roll actions after enrichment", async () => {
  const previousTextEditor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const actor = createSpellsActor();
  const hex = getSpell(actor, "hex");
  if (!hex) throw new Error("Missing hex spell fixture.");
  hex.system = {
    ...(hex.system ?? {}),
    description: {
      value: "<p>You try to compel a creature. One creature makes a [[/save ability=wis dc=@attributes.spelldc format=long]].</p>"
    }
  };

  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    value: {
      enrichHTML: async (content: string) => content
        .replace(
          "[[/save ability=wis dc=@attributes.spelldc format=long]]",
          "<button class=\"inline-roll\">WIS Save</button>"
        )
        .replace("compel a creature", "compel a <a class=\"content-link\" data-uuid=\"Compendium.dnd5e.spells.Item.hex\">creature</a>")
    }
  });

  try {
    const model = await buildDnd5eSpellsViewModel({ actor, user, config });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;

    const row = model.sections.flatMap(section => section.spells).find(spell => spell.id === "hex");
    assert.match(row?.description ?? "", /WIS Save/);
    assert.doesNotMatch(row?.description ?? "", /<button\b/i);
    assert.match(row?.description ?? "", /data-uuid="Compendium\.dnd5e\.spells\.Item\.hex"/);
  } finally {
    if (previousTextEditor) Object.defineProperty(globalThis, "TextEditor", previousTextEditor);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});

test("spell slot pips follow dnd5e toggle semantics and actor update path", async () => {
  const actor = createSpellsActor();

  assert.equal(getNextSpellSlotValue(2, 2), 1);
  assert.equal(getNextSpellSlotValue(1, 2), 2);
  assert.deepEqual(await toggleSpellSlotPip(actor, user, "pact", 2), { ok: true });
  assert.deepEqual(actor.actorUpdates, [{ "system.spells.pact.value": 1 }]);

  const denied = createSpellsActor({ canUserModify: () => false, getUserLevel: () => 2 });
  assert.deepEqual(await toggleSpellSlotPip(denied, user, "pact", 2), { ok: false, reason: "forbidden" });
  assert.deepEqual(denied.actorUpdates, []);
});

test("spell controls require update permission and call dnd5e document APIs", async () => {
  const actor = createSpellsActor();
  const denied = createSpellsActor({ canUserModify: () => false, getUserLevel: () => 2 });

  assert.deepEqual(await useSpellItem(actor, user, "eldritch-blast"), { ok: true });
  assert.deepEqual(await useSpellActivity(actor, user, "hex", "hex-save"), { ok: true });
  assert.deepEqual(await toggleSpellPrepared(actor, user, "hex", config), { ok: true });
  assert.deepEqual(await adjustSpellRemainingUses(actor, user, "hex", -1), { ok: true });
  assert.deepEqual(await rechargeSpell(actor, user, "hellish-rebuke"), { ok: true });
  assert.deepEqual(await setSpellcastingAbility(actor, user, "cha"), { ok: true });
  assert.deepEqual(await setSpellFavorite(actor, user, "hex", true), { ok: true });
  assert.deepEqual(await setSpellFavorite(actor, user, "hex", false), { ok: true });

  assert.equal(getSpell(actor, "eldritch-blast")?.useCalls, 1);
  assert.equal(getActivity(actor, "hex", "hex-save")?.useCalls, 1);
  assert.deepEqual(actor.embeddedUpdates, [
    { embeddedName: "Item", updates: [{ _id: "hex", "system.prepared": false }] },
    { embeddedName: "Item", updates: [{ _id: "hex", "system.uses.spent": 2 }] }
  ]);
  assert.equal(actor.recharged, 1);
  assert.deepEqual(actor.actorUpdates, [{ "system.attributes.spellcasting": "cha" }]);
  assert.deepEqual(actor.favoriteCalls, [
    ["add", "hex"],
    ["remove", "hex"]
  ]);

  assert.deepEqual(await useSpellItem(denied, user, "eldritch-blast"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await toggleSpellPrepared(denied, user, "hex", config), { ok: false, reason: "forbidden" });
  assert.deepEqual(await adjustSpellRemainingUses(denied, user, "hex", -1), { ok: false, reason: "forbidden" });
  assert.deepEqual(await rechargeSpell(denied, user, "hellish-rebuke"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await setSpellcastingAbility(denied, user, "cha"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await setSpellFavorite(denied, user, "hex", true), { ok: false, reason: "forbidden" });
  assert.deepEqual(denied.embeddedUpdates, []);
});

test("spells template and styles preserve required regions without create or delete controls", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/spells.hbs", import.meta.url), "utf8");
  const rowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/spell-row.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const actorSheetNavigationSource = readFileSync(new URL("../src/systems/dnd5e/actor-sheet-navigation.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(template, /class="content sheet-dense spells-pane"/);
  assert.match(template, /class="spell-summary"/);
  assert.match(template, /class="spell-stats"/);
  assert.match(template, /partials\/pane-search-toolbar\.hbs/);
  assert.match(template, /toolbarClass="spells-toolbar"/);
  assert.match(template, /placeholder="Search spells"/);
  assert.match(template, /pane="Spells"/);
  assert.match(template, /canClear=canClearSearch/);
  assert.match(template, /class="slot-tracks spell-section-slots"/);
  assert.match(template, /class="compact-panels spell-sections"/);
  assert.match(template, /class="section sheet-group spells-section"/);
  assert.match(template, /class="sheet-table sheet-list spells-table"/);
  assert.match(template, /partials\/spell-row\.hbs/);
  assert.match(rowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(rowTemplate, /class="row spells-list-row spell-row"/);
  assert.match(rowTemplate, /drawerClass="spell-detail-drawer"/);
  assert.match(rowTemplate, /summaryClass="spell-row-summary[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-4meta-actions"/);
  assert.match(rowTemplate, /bodyClass="pf-expandable-detail-body"/);
  assert.match(rowTemplate, /class="spell-activity-row[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-4meta-actions"/);
  assert.match(rowTemplate, /class="spell-description[^"]*pf-detail-description"/);
  assert.doesNotMatch(rowTemplate, /class="meta-row pf-detail-meta"/);
  assert.doesNotMatch(rowTemplate, /data-action="spells-use-activity"/);
  assert.match(rowTemplate, /data-action="spells-toggle-prepared"/);
  assert.doesNotMatch(rowTemplate, />Cast<\/button>/);
  assert.match(template, /data-action="spells-toggle-slot-pip"/);
  assert.match(rowTemplate, /fa-certificate/);
  assert.doesNotMatch(template, /fa-solid fa-expand|spell-expand-state/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(actorSheetNavigationSource, /buildDnd5eSpellsViewModel/);
  assert.match(actorSheetNavigationSource, /case "Spells":/);
  assert.match(actorSheetNavigationSource, /spells-toggle-slot-pip/);
  assert.match(actorSheetNavigationSource, /spells-confirm-uses-delta/);
  assert.match(css, /\.pocket-foundry-root \.spell-stats/);
  assert.match(css, /\.pocket-foundry-root \.slot-tracks/);
  assert.match(css, /\.pocket-foundry-root \.spell-sections/);
  assert.match(css, /\.pocket-foundry-root \.spells-list-row/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list-row/);
  assert.match(css, /\.pocket-foundry-root \.spell-detail-drawer/);
  assert.match(css, /\.pocket-foundry-root \.spell-activity-row/);
  assert.doesNotMatch(css, /spell-expand-state/);
  assert.doesNotMatch(template, /data-action="create"|data-action="delete"|SpellAdd|SpellCreate|Open Sheet|spell-levels|sub-rail|Filter spells|Sort spells|No matching|fa-filter|fa-arrow-down-short-wide/);
});

type TestSpellActor = Dnd5eSpellsActor & {
  embeddedUpdates: Array<{ embeddedName: "Item"; updates: Array<Record<string, unknown>> }>;
  actorUpdates: Array<Record<string, unknown>>;
  favoriteCalls: string[][];
  recharged: number;
};

type TestSpellItem = Dnd5eSpellItem & {
  useCalls?: number;
};

type TestSpellActivity = Dnd5eSpellActivity & {
  useCalls?: number;
};

function createSpellsActor(overrides: Partial<TestSpellActor> = {}): TestSpellActor {
  const actor = {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    name: "Arlen Mire",
    system: {
      attributes: { spellcasting: "cha" },
      abilities: { cha: { mod: 3 } },
      spells: {
        spell1: { value: 3, max: 2 },
        spell2: { value: 0, max: 1 },
        pact: { value: 2, max: 2, level: 2 }
      },
      favorites: [],
      addFavorite(item: TestSpellItem) {
        actor.favoriteCalls.push(["add", item.id ?? ""]);
        return Promise.resolve();
      },
      removeFavorite(item: TestSpellItem) {
        actor.favoriteCalls.push(["remove", item.id ?? ""]);
        return Promise.resolve();
      }
    },
    spellcastingClasses: {
      warlock: {
        id: "warlock",
        type: "class",
        name: "Warlock",
        identifier: "warlock",
        system: { levels: 3, spellcasting: { progression: "pact" } },
        spellcasting: { ability: "cha", attack: 5, save: 13, progression: "pact", preparation: { value: 4, max: 5 } }
      }
    },
    items: [] as TestSpellItem[],
    embeddedUpdates: [],
    actorUpdates: [],
    favoriteCalls: [],
    recharged: 0,
    testUserPermission: () => true,
    canUserModify: () => true,
    getUserLevel: () => 3,
    update(data: Record<string, unknown>) {
      actor.actorUpdates.push(data);
      const spells = ((actor.system as { spells: { pact: { value: number } } }).spells);
      if ("system.spells.pact.value" in data) spells.pact.value = data["system.spells.pact.value"] as number;
      return Promise.resolve();
    },
    updateEmbeddedDocuments(embeddedName: "Item", updates: Array<Record<string, unknown>>) {
      actor.embeddedUpdates.push({ embeddedName, updates });
      return Promise.resolve();
    },
    ...overrides
  } satisfies TestSpellActor;

  actor.items = [
    createSpell(actor, {
      id: "eldritch-blast",
      name: "Eldritch Blast",
      img: null,
      system: { method: "spell", level: 0, school: "evo", activation: { type: "action", value: 1 }, range: { value: 120, units: "ft" }, activities: [] },
      labels: { school: "Evocation", components: { vsm: "V,S" }, activation: "A", range: "120 ft", target: "1 creature", modifier: "+5" }
    }),
    createSpell(actor, {
      id: "hex",
      name: "Hex",
      system: {
        method: "spell",
        level: 1,
        school: "enc",
        prepared: true,
        activation: { type: "bonus", value: 1 },
        range: { value: 90, units: "ft" },
        description: { value: "<p>You curse a creature you can see within range.</p>" },
        uses: { max: 3, spent: 1 },
        properties: new Set(["concentration"]),
        activities: [
          {
            id: "hex-save",
            name: "Hex Save",
            canUse: true,
            save: { ability: "wis", dc: 13 },
            use() {
              this.useCalls = (this.useCalls ?? 0) + 1;
              return Promise.resolve();
            }
          } as TestSpellActivity
        ]
      },
      labels: { school: "Enchantment", components: { vsm: "V,S,M" }, activation: "BA", range: "90 ft", target: "1 creature" },
      flags: { dnd5e: { advancementOrigin: "patron.feature" } }
    }),
    createSpell(actor, {
      id: "armor",
      name: "Armor of Agathys",
      system: { method: "spell", level: 1, school: "abj", prepared: "always", activation: { type: "action", value: 1 }, range: { units: "self" }, activities: [] },
      labels: { school: "Abjuration", components: { vsm: "V,S,M" }, activation: "A", range: "Self", target: "Self" }
    }),
    createSpell(actor, {
      id: "misty-step",
      name: "Misty Step",
      system: { method: "spell", level: 2, school: "con", prepared: false, activation: { type: "bonus", value: 1 }, range: { units: "self" }, activities: [] },
      labels: { school: "Conjuration", components: { vsm: "V" }, activation: "BA", range: "Self", target: "30 ft teleport" }
    }),
    createSpell(actor, {
      id: "mirror-image",
      name: "Mirror Image",
      system: { method: "pact", level: 2, school: "ill", activation: { type: "action", value: 1 }, range: { units: "self" }, activities: [] },
      labels: { school: "Illusion", components: { vsm: "V,S" }, activation: "1 hour", range: "Self", target: "Self" }
    }),
    createSpell(actor, {
      id: "hellish-rebuke",
      name: "Hellish Rebuke",
      hasRecharge: true,
      system: {
        method: "unknown",
        level: 1,
        school: "evo",
        activation: { type: "reaction", value: 1 },
        range: { value: 60, units: "ft" },
        uses: {
          max: 1,
          value: 0,
          rollRecharge() {
            actor.recharged += 1;
            return Promise.resolve();
          }
        },
        activities: []
      },
      labels: { school: "Evocation", components: { vsm: "V,S" }, activation: "R", range: "60 ft", target: "1 creature" }
    }),
    createSpell(actor, {
      id: "hidden",
      name: "Hidden Spell",
      system: { method: "spell", level: 1 },
      testUserPermission: () => false,
      getUserLevel: () => 0
    }),
    createSpell(actor, { id: "patron", name: "Fiend Patron", type: "feat", system: {} })
  ];

  return actor;
}

function createSpell(actor: TestSpellActor, data: Partial<TestSpellItem>): TestSpellItem {
  const item: TestSpellItem = {
    id: data.id,
    _id: data.id,
    uuid: `Actor.arlen.Item.${data.id}`,
    name: data.name,
    type: data.type ?? "spell",
    img: data.img ?? null,
    parent: actor,
    system: data.system ?? {},
    labels: data.labels ?? {},
    flags: data.flags,
    hasRecharge: data.hasRecharge,
    hasLimitedUses: data.hasLimitedUses,
    isOwner: true,
    testUserPermission: data.testUserPermission ?? (() => true),
    canUserModify: data.canUserModify ?? (() => true),
    getUserLevel: data.getUserLevel ?? (() => 3),
    getFlag(scope: string, key: string) {
      return (this.flags as Record<string, Record<string, unknown>> | undefined)?.[scope]?.[key];
    },
    use() {
      item.useCalls = (item.useCalls ?? 0) + 1;
      return Promise.resolve();
    },
    update(updateData: Record<string, unknown>) {
      actor.embeddedUpdates.push({ embeddedName: "Item", updates: [{ _id: item.id, ...updateData }] });
      return Promise.resolve();
    },
    ...data
  };
  return item;
}

function getSpell(actor: TestSpellActor, itemId: string): TestSpellItem | undefined {
  return (actor.items as TestSpellItem[]).find((item: TestSpellItem) => item.id === itemId);
}

function getActivity(actor: TestSpellActor, itemId: string, activityId: string): TestSpellActivity | undefined {
  const activities = getSpell(actor, itemId)?.system?.activities as TestSpellActivity[] | undefined;
  return activities?.find(activity => activity.id === activityId);
}

