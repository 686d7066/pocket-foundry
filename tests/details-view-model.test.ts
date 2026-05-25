import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  applyDetailsDeathSavePip,
  applyDetailsExhaustionPip,
  applyDetailsHitDieRoll,
  applyDetailsHpDelta,
  applyDetailsRest,
  applyDetailsTempHpDelta,
  buildDnd5eDetailsViewModel,
  getNextDeathSaveValue,
  getNextExhaustionValue,
  toggleDetailsInspiration,
  type Dnd5eDetailsActor,
  type Dnd5eDetailsConfig
} from "../src/systems/dnd5e/details-view-model.ts";

const user = { id: "player" };

const config: Dnd5eDetailsConfig = {
  abilities: { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" },
  skills: { acr: { label: "Acrobatics" }, arc: "Arcana", prc: "Perception", ste: "Stealth" },
  senses: { darkvision: "Darkvision" },
  actorSizes: { med: "Medium" },
  creatureTypes: { humanoid: "Humanoid" },
  damageTypes: { fire: "Fire", cold: "Cold", radiant: "Radiant" },
  conditionTypes: { poisoned: "Poisoned" },
  armorProficiencies: { lgt: "Light Armor" },
  weaponProficiencies: { sim: "Simple Weapons" },
  languages: { common: "Common", elvish: "Elvish" },
  tools: { thieves: { label: "Thieves' Tools" } }
};

test("details view model maps dnd5e character header, dashboard, abilities, saves, skills, tools, and traits", async () => {
  const model = await buildDnd5eDetailsViewModel({
    actor: createDetailsActor(),
    user,
    config
  });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.header.characterLabel, "Character");
  assert.equal(model.header.name, "Arlen Mire");
  assert.equal(model.header.classSummary, "Warlock 3");
  assert.equal(model.header.level, 3);
  assert.equal(model.header.ac, 14);
  assert.deepEqual(model.header.hp, {
    value: 18,
    max: 24,
    effectiveMax: 24,
    temp: 5,
    tempMax: 0,
    pct: 75,
    pctLabel: "75",
    canUpdateValue: true,
    canUpdateTemp: true
  });
  assert.deepEqual(model.header.inspiration, { active: true, canToggle: true });
  assert.deepEqual(model.header.xp, { value: 900, max: 2700, pct: 33 });
  assert.equal(model.header.epicBoons, 1);
  assert.equal(model.deltaOptions.length, 101);
  assert.deepEqual(model.deltaOptions.slice(0, 3).map(option => option.label), ["+50", "+49", "+48"]);
  assert.deepEqual(model.deltaOptions.slice(-3).map(option => option.label), ["-48", "-49", "-50"]);
  assert.deepEqual(model.deltaOptions.find(option => option.center), { value: 0, label: "0", center: true });
  assert.deepEqual(model.deathSaves.successPips, [
    { value: 1, active: true },
    { value: 2, active: false },
    { value: 3, active: false }
  ]);
  assert.deepEqual(model.exhaustion, {
    value: 0,
    pipGroups: [
      [
        { value: 1, active: false },
        { value: 2, active: false },
        { value: 3, active: false }
      ],
      [
        { value: 4, active: false },
        { value: 5, active: false },
        { value: 6, active: false }
      ]
    ],
    canUpdate: true
  });
  assert.deepEqual(model.restActions, [
    { type: "short", label: "Short Rest", icon: "fa-solid fa-utensils", canRest: false },
    { type: "long", label: "Long Rest", icon: "fa-solid fa-campground", canRest: false }
  ]);
  assert.deepEqual(model.shortRest, {
    hpValue: 18,
    hpMax: 24,
    hpLabel: "18/24",
    hitDice: [
      { denomination: "d8", label: "d8 (1 available)", available: 1, disabled: false },
      { denomination: "d10", label: "d10 (1 available)", available: 1, disabled: false }
    ],
    canRollHitDice: true
  });

  assert.deepEqual(
    model.dashboard.map(stat => [stat.id, stat.value, stat.interactive]),
    [
      ["hp", "18/24", true],
      ["ac", "14", false],
      ["initiative", "+4", true],
      ["speed", "30", false],
      ["proficiency", "+2", false],
      ["temp", "5", true],
      ["hit-dice", "2/3", false],
      ["death-saves", "1S/0F", true]
    ]
  );

  assert.deepEqual(
    model.abilities.map(ability => [ability.id, ability.label, ability.value, ability.modifierLabel, ability.save, ability.proficient]),
    [
      ["str", "Strength", 8, "-1", -1, false],
      ["dex", "Dexterity", 16, "+3", 5, true],
      ["con", "Constitution", 14, "+2", 2, false],
      ["int", "Intelligence", 10, "+0", 0, false],
      ["wis", "Wisdom", 12, "+1", 1, false],
      ["cha", "Charisma", 18, "+4", 6, true]
    ]
  );
  assert.deepEqual(
    model.saves.map(save => [save.id, save.totalLabel, save.concentration]),
    [
      ["str", "-1", false],
      ["dex", "+5", false],
      ["con", "+2", true],
      ["int", "+0", false],
      ["wis", "+1", false],
      ["cha", "+6", false]
    ]
  );

  assert.deepEqual(
    model.skills.map(row => row.label),
    ["Acrobatics", "Arcana", "Perception", "Stealth"]
  );
  assert.deepEqual(
    model.skillGroups.map(group => [group.ability, group.rows.map(row => row.label)]),
    [
      ["dex", ["Acrobatics", "Stealth"]],
      ["int", ["Arcana"]],
      ["wis", ["Perception"]]
    ]
  );
  const perception = model.skillGroups.flatMap(group => group.rows).find(row => row.id === "prc");
  assert.deepEqual(perception, {
    id: "prc",
    label: "Perception",
    ability: "wis",
    abilityLabel: "WIS",
    total: 3,
    totalLabel: "+3",
    passive: 13,
    proficient: true,
    proficiencyIndicator: "full"
  });

  assert.deepEqual(model.tools, [
    {
      id: "thieves",
      label: "Thieves' Tools",
      ability: "dex",
      abilityLabel: "DEX",
      total: 5,
      totalLabel: "+5",
      proficient: true,
      proficiencyIndicator: "full"
    }
  ]);

  assert.deepEqual(
    model.traitGroups.map(group => [group.id, group.label, group.tone, group.pills.map(pill => pill.label)]),
    [
      ["origin", "Origin", "neutral", ["Humanoid elf", "Elf", "Acolyte", "Medium"]],
      ["senses", "Senses", "neutral", ["Darkvision 60", "tremorsense 10"]],
      ["damage-resistances", "Resistances", "neutral", ["Fire", "Cold", "Acid"]],
      ["damage-immunities", "Damage Immunities", "neutral", ["Radiant"]],
      ["condition-immunities", "Condition Immunities", "neutral", ["Poisoned"]],
      ["vulnerabilities", "Vulnerabilities", "warning", ["Cold"]],
      ["armor", "Armor Proficiency", "neutral", ["Light Armor"]],
      ["weapons", "Weapon Proficiency", "neutral", ["Simple Weapons"]],
      ["languages", "Languages", "neutral", ["Common", "Elvish", "Deep Speech"]]
    ]
  );
  assert.equal(model.traitGroups.find(group => group.id === "origin")?.pills.some(pill => Boolean(pill.referenceUuid)), false);
});

test("details trait mapping supports armorProf and weaponProf and deduplicates language labels", async () => {
  const baseActor = createDetailsActor();
  const baseSystem = (baseActor.system ?? {}) as Record<string, unknown>;
  const baseTraits = (baseSystem.traits ?? {}) as Record<string, unknown>;
  const actor = createDetailsActor({
    system: {
      ...baseSystem,
      traits: {
        ...baseTraits,
        armor: undefined,
        weapon: undefined,
        armorProf: { value: ["lgt"] },
        weaponProf: { value: ["sim"], mastery: { value: ["sim"] } },
        languages: {
          value: ["common", "elvish"],
          labels: {
            common: "Common",
            elvish: "Elvish"
          },
          custom: "Deep Speech"
        }
      }
    }
  });

  const model = await buildDnd5eDetailsViewModel({
    actor,
    user,
    config
  });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.traitGroups.find(group => group.id === "armor")?.pills.map(pill => pill.label), ["Light Armor"]);
  assert.deepEqual(model.traitGroups.find(group => group.id === "weapons")?.pills.map(pill => pill.label), ["Simple Weapons Mastery"]);
  assert.deepEqual(model.traitGroups.find(group => group.id === "languages")?.pills.map(pill => pill.label), ["Common", "Elvish", "Deep Speech"]);
});

test("details tool detail text strips Foundry inline UUID tags", async () => {
  const baseActor = createDetailsActor();
  const baseSystem = (baseActor.system ?? {}) as Record<string, unknown>;
  const actor = createDetailsActor({
    system: {
      ...baseSystem,
      tools: {
        herbalism: {
          ability: "int",
          total: 3,
          prof: 1,
          description: "Ability: Intelligence Utilize: Identify a plant (DC 10) Craft: @UUID[Compendium.dnd5e.equipment24.Item.phbtrdHerbalism]{Herbalism Kit}"
        }
      }
    }
  });

  const model = await buildDnd5eDetailsViewModel({ actor, user, config });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const herbalism = model.tools.find(tool => tool.id === "herbalism");
  assert.ok(herbalism?.detailText);
  assert.equal(herbalism?.detailText?.includes("@UUID["), false);
  assert.match(herbalism?.detailText ?? "", /Craft:\s*Herbalism Kit/);
  assert.match(herbalism?.detailText ?? "", /\nUtilize:/);
  assert.match(herbalism?.detailText ?? "", /\nCraft:/);
  assert.deepEqual(herbalism?.detailReferences, [
    {
      uuid: "Compendium.dnd5e.equipment24.Item.phbtrdHerbalism",
      label: "Herbalism Kit"
    }
  ]);
});

test("details view model requires observer permission and does not leak hidden character fields", async () => {
  const hidden = createDetailsActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eDetailsViewModel({ actor: hidden, user, config }), {
    unavailable: true,
    title: "Character Unavailable",
    body: "This character is not available to the current user."
  });
});

test("details view model excludes favorites from Details sections", async () => {
  const model = await buildDnd5eDetailsViewModel({
    actor: createDetailsActor(),
    user,
    config
  });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal("favorites" in model, false);
  assert.equal(model.traitGroups.some(group => group.id.toLowerCase().includes("favorite")), false);
});

test("details skills and tools expose favorite context actions when dnd5e favorites are available", async () => {
  const actor = createDetailsActor({
    system: {
      ...createDetailsActor().system,
      favorites: [{ type: "tool", id: "thieves" }],
      addFavorite: async () => undefined,
      removeFavorite: async () => undefined
    }
  });

  const model = await buildDnd5eDetailsViewModel({ actor, user, config });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const acrobatics = model.skills.find(skill => skill.id === "acr");
  const thievesTools = model.tools.find(tool => tool.id === "thieves");
  assert.equal(acrobatics?.canToggleFavorite, true);
  assert.equal(acrobatics?.favorite, false);
  assert.equal(thievesTools?.canToggleFavorite, true);
  assert.equal(thievesTools?.favorite, true);
});

test("details view model resolves tool labels from dnd5e configured base item indexes", async () => {
  const previousConfig = Object.getOwnPropertyDescriptor(globalThis, "CONFIG");
  const previousGame = Object.getOwnPropertyDescriptor(globalThis, "game");

  Object.defineProperty(globalThis, "CONFIG", {
    configurable: true,
    value: {
      DND5E: {
        tools: {
          drum: { id: "Compendium.dnd5e.equipment24.Item.phbmusDrum000000" }
        }
      }
    }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      packs: new Map([
        [
          "dnd5e.equipment24",
          {
            index: [{ _id: "phbmusDrum000000", name: "Drum" }]
          }
        ]
      ])
    }
  });

  try {
    const actor = createDetailsActor({
      system: {
        ...createDetailsActor().system,
        tools: {
          drum: { ability: "dex", total: 5, prof: 1 }
        }
      }
    });
    const model = await buildDnd5eDetailsViewModel({ actor, user });

    assert.equal(model.unavailable, false);
    if (model.unavailable) return;
    assert.equal(model.tools[0]?.label, "Drum");
  } finally {
    if (previousConfig) Object.defineProperty(globalThis, "CONFIG", previousConfig);
    else delete (globalThis as { CONFIG?: unknown }).CONFIG;
    if (previousGame) Object.defineProperty(globalThis, "game", previousGame);
    else delete (globalThis as { game?: unknown }).game;
  }
});

test("details play controls require update permission and use Actor.update paths", async () => {
  const actor = createDetailsActor();
  const denied = createDetailsActor({
    canUserModify: () => false,
    getUserLevel: () => 2
  });

  assert.deepEqual(await applyDetailsHpDelta(actor, user, -7), { ok: true });
  assert.deepEqual(await applyDetailsTempHpDelta(actor, user, -2), { ok: true });
  assert.deepEqual(await toggleDetailsInspiration(actor, user), { ok: true });
  assert.deepEqual(await applyDetailsDeathSavePip(actor, user, "success", true), { ok: true });
  assert.deepEqual(await applyDetailsDeathSavePip(actor, user, "failure", false, 3, "target"), { ok: true });
  assert.deepEqual(await applyDetailsDeathSavePip(actor, user, "failure", true, 3, "target"), { ok: true });
  assert.deepEqual(await applyDetailsExhaustionPip(actor, user, 2, false), { ok: true });
  assert.deepEqual(actor.updates, [
    { "system.attributes.hp.value": 11 },
    { "system.attributes.hp.temp": 3 },
    { "system.attributes.inspiration": false },
    { "system.attributes.death.success": 0 },
    { "system.attributes.death.failure": 3 },
    { "system.attributes.death.failure": 2 },
    { "system.attributes.exhaustion": 2 }
  ]);
  assert.equal(actor.system?.attributes && typeof actor.system.attributes === "object" && (actor.system.attributes as { hp?: { value?: number } }).hp?.value, 18);

  assert.deepEqual(await applyDetailsHpDelta(denied, user, -7), { ok: false, reason: "forbidden" });
  assert.deepEqual(await applyDetailsTempHpDelta(denied, user, -2), { ok: false, reason: "forbidden" });
  assert.deepEqual(await toggleDetailsInspiration(denied, user), { ok: false, reason: "forbidden" });
  assert.deepEqual(await applyDetailsDeathSavePip(denied, user, "failure", false), { ok: false, reason: "forbidden" });
  assert.deepEqual(await applyDetailsExhaustionPip(denied, user, 2, false), { ok: false, reason: "forbidden" });
  assert.deepEqual(denied.updates, []);
});

test("details rest controls use dnd5e actor rest workflow and default rest permissions", async () => {
  const previousConfig = Object.getOwnPropertyDescriptor(globalThis, "CONFIG");
  const previousGame = Object.getOwnPropertyDescriptor(globalThis, "game");

  Object.defineProperty(globalThis, "CONFIG", {
    configurable: true,
    value: {
      DND5E: {
        restTypes: {
          short: { label: "DND5E.REST.Short.Label", icon: "fa-solid fa-utensils" },
          long: { label: "DND5E.REST.Long.Label", icon: "fa-solid fa-campground" }
        }
      }
    }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { id: "player", isGM: false },
      i18n: {
        localize: (key: string) => (key === "DND5E.REST.Short.Label" ? "Short Rest" : key === "DND5E.REST.Long.Label" ? "Long Rest" : key)
      },
      settings: {
        get: (namespace: string, key: string) => namespace === "dnd5e" && key === "allowRests"
      }
    }
  });

  try {
    const actor = createDetailsActor();
    const model = await buildDnd5eDetailsViewModel({ actor, user, config });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;

    assert.deepEqual(model.restActions, [
      { type: "short", label: "Short Rest", icon: "fa-solid fa-utensils", canRest: true },
      { type: "long", label: "Long Rest", icon: "fa-solid fa-campground", canRest: true }
    ]);

    assert.deepEqual(await applyDetailsRest(actor, user, { type: "short", dialog: false, autoHD: true }), { ok: true });
    assert.deepEqual(await applyDetailsRest(actor, user, { type: "long", dialog: false, newDay: true, recoverTemp: true, recoverTempMax: true }), { ok: true });
    assert.deepEqual(await applyDetailsHitDieRoll(actor, user, "d8"), {
      ok: true,
      roll: { denomination: "d8", total: 7, formula: "1d8 + 2", hpBefore: 18, hpAfter: 24, hpDelta: 6 }
    });
    assert.deepEqual(actor.rests, [
      { type: "short", dialog: false, autoHD: true },
      { type: "long", dialog: false, newDay: true, recoverTemp: true, recoverTempMax: true }
    ]);
    assert.deepEqual(actor.hitDieRolls, [{ config: { denomination: "d8" }, dialog: { configure: false }, message: { create: false } }]);

    Object.defineProperty(globalThis, "game", {
      configurable: true,
      value: {
        user: { id: "player", isGM: false },
        settings: { get: () => false }
      }
    });
    const blocked = createDetailsActor();
    assert.deepEqual(await applyDetailsRest(blocked, user, { type: "short", dialog: false }), { ok: false, reason: "forbidden" });
    assert.deepEqual(await applyDetailsHitDieRoll(blocked, user, "d8"), { ok: false, reason: "forbidden" });
    assert.deepEqual(blocked.rests, []);
    assert.deepEqual(blocked.hitDieRolls, []);
  } finally {
    if (previousConfig) Object.defineProperty(globalThis, "CONFIG", previousConfig);
    else delete (globalThis as { CONFIG?: unknown }).CONFIG;
    if (previousGame) Object.defineProperty(globalThis, "game", previousGame);
    else delete (globalThis as { game?: unknown }).game;
  }
});

test("death save pips follow ordered step behavior", () => {
  assert.equal(getNextDeathSaveValue(0, false), 1);
  assert.equal(getNextDeathSaveValue(1, false), 2);
  assert.equal(getNextDeathSaveValue(2, false), 3);
  assert.equal(getNextDeathSaveValue(3, false), 3);
  assert.equal(getNextDeathSaveValue(3, true), 2);
  assert.equal(getNextDeathSaveValue(2, true), 1);
  assert.equal(getNextDeathSaveValue(1, true), 0);
  assert.equal(getNextDeathSaveValue(0, true), 0);
});

test("death save pips support target fill mode up to the clicked pip", () => {
  assert.equal(getNextDeathSaveValue(0, false, 1, "target"), 1);
  assert.equal(getNextDeathSaveValue(0, false, 3, "target"), 3);
  assert.equal(getNextDeathSaveValue(2, false, 2, "target"), 2);
  assert.equal(getNextDeathSaveValue(3, true, 3, "target"), 2);
  assert.equal(getNextDeathSaveValue(1, true, 1, "target"), 0);
  assert.equal(getNextDeathSaveValue(0, false, 99, "target"), 3);
  assert.equal(getNextDeathSaveValue(0, false, -2, "target"), 0);
});

test("exhaustion pips set and clear compact exhaustion levels", () => {
  assert.equal(getNextExhaustionValue(1, false), 1);
  assert.equal(getNextExhaustionValue(6, false), 6);
  assert.equal(getNextExhaustionValue(6, true), 5);
  assert.equal(getNextExhaustionValue(1, true), 0);
  assert.equal(getNextExhaustionValue(10, false), 6);
});

test("details template and styles preserve required regions without local submenu or Favorites section", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/details.hbs", import.meta.url), "utf8");
  const skillRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/details-skill-row.hbs", import.meta.url), "utf8");
  const toolRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/details-tool-row.hbs", import.meta.url), "utf8");
  const blipPartialTemplate = readFileSync(new URL("../src/templates/partials/fillable-blips.hbs", import.meta.url), "utf8");
  const numberAdjustDialogTemplate = readFileSync(new URL("../src/templates/partials/number-adjust-dialog.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /class="header-stats/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(template, /class="content details-sheet"/);
  assert.match(template, /class="ability-strip"/);
  assert.match(template, /class="details-grid"/);
  assert.match(template, /class="left-stack"/);
  assert.match(template, /class="sheet-panel side-stats"/);
  assert.match(template, /class="[^"]*sheet-panel[^"]*saves-panel"/);
  assert.match(template, /class="[^"]*sheet-panel[^"]*table-panel"/);
  assert.match(template, /class="sheet-panel traits-panel"/);
  assert.match(template, /class="section-heading sheet-group-heading"/);
  assert.match(template, /<h2>Tool Proficiencies<\/h2>/);
  assert.match(template, /class="detail-table skills-table"/);
  assert.match(template, /partials\/details-skill-row\.hbs/);
  assert.match(skillRowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(skillRowTemplate, /summaryClass="detail-table-row skill-row skill-row-summary"/);
  assert.match(skillRowTemplate, /data-action="details-open-reference"/);
  assert.match(toolRowTemplate, /data-action="details-open-reference"/);
  assert.match(template, /class="detail-table tool-table"/);
  assert.match(template, /class="trait-groups"/);
  assert.match(template, /class="trait-group proficiency-group"/);
  assert.match(template, /<h2>Proficiencies<\/h2>/);
  assert.match(actorShellTemplate, /data-action="details-toggle-inspiration"/);
  assert.match(actorShellTemplate, /class="header-inspiration-button .*inspiration-toggle/);
  assert.match(actorShellTemplate, /\{\{#if headerDetails\.header\.inspiration\.active\}\}fa-solid\{\{else\}\}fa-regular\{\{\/if\}\} fa-star/);
  assert.doesNotMatch(actorShellTemplate, /<b>Heroic<\/b><strong>/);
  assert.match(actorShellTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(actorShellTemplate, /selectAction="details-select-delta"/);
  assert.match(actorShellTemplate, /confirmActionMiddle="hp"/);
  assert.match(actorShellTemplate, /confirmActionMiddle="temp-hp"/);
  assert.match(numberAdjustDialogTemplate, /\{\{#if confirmLabel\}\}\{\{confirmLabel\}\}\{\{else\}\}OK\{\{\/if\}\}/);
  assert.match(template, /partials\/fillable-blips\.hbs/);
  assert.match(template, /direction="rtl"/);
  assert.match(template, /direction="ltr"/);
  assert.match(template, /fillMode="step"/);
  assert.match(template, /color="failure"/);
  assert.match(template, /color="success"/);
  assert.match(blipPartialTemplate, /data-blip-count="\{\{count\}\}"/);
  assert.match(blipPartialTemplate, /data-blip-direction="\{\{direction\}\}"/);
  assert.match(blipPartialTemplate, /data-blip-fill-mode="\{\{fillMode\}\}"/);
  assert.match(blipPartialTemplate, /class="fillable-blips/);
  assert.match(blipPartialTemplate, /color-\{\{color\}\}/);
  assert.match(blipPartialTemplate, /data-action="\{\{..\/action\}\}"/);
  assert.match(blipPartialTemplate, /data-pip-value="\{\{value\}\}"/);
  assert.match(template, /class="death-save-title">Death Saves/);
  assert.match(template, /death-save-divider/);
  assert.match(template, /class="death-save-label">Success/);
  assert.match(template, /class="death-save-label">Fail/);
  assert.match(template, /data-action="details-exhaustion-pip"/);
  assert.match(template, /data-action="details-rest"/);
  assert.match(template, /id="details-short-rest-dialog"/);
  assert.match(template, /id="details-long-rest-dialog"/);
  assert.match(template, /data-action="details-confirm-rest"/);
  assert.match(template, /data-action="details-roll-hit-die"/);
  assert.match(template, /{{shortRest\.hpLabel}}/);
  assert.match(template, /{{#each shortRest\.hitDice}}/);
  assert.match(template, /{{#if shortRestLastRoll}}/);
  assert.match(template, /name="newDay"/);
  assert.match(template, /name="recoverTemp"/);
  assert.match(template, /name="recoverTempMax"/);
  assert.match(template, /name="autoHD"/);
  assert.match(template, /class="rest-actions"/);
  assert.match(template, /class="mini-stat exhaustion-stat"/);
  assert.match(template, /class="pip-group"/);
  assert.match(actorShellTemplate, /data-action="details-open-dialog"/);
  assert.match(actorShellTemplate, /closeAction="details-close-dialog"/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(moduleSource, /partials\/fillable-blips\.hbs/);
  assert.match(css, /\.pocket-foundry-root \.details-grid/);
  assert.match(css, /\.pocket-foundry-root \.ability-strip/);
  assert.match(css, /\.pocket-foundry-root \.ability-strip \{ @apply mb-2 grid grid-cols-3/);
  assert.match(css, /@media \(min-width: 620px\)/);
  assert.match(css, /\.pocket-foundry-root \.ability-strip \{ @apply grid-cols-6/);
  assert.match(css, /auto-fit,minmax\(min\(100%,280px\),1fr\)/);
  assert.match(css, /\.pocket-foundry-root \.detail-table-row > \*/);
  assert.match(css, /\.pocket-foundry-root \.death-save-panel/);
  assert.match(css, /\.pocket-foundry-root \.death-save-panel b\.death-save-pips/);
  assert.match(css, /\.pocket-foundry-root \.death-save-title/);
  assert.match(css, /\.pocket-foundry-root \.death-save-divider/);
  assert.match(css, /\.pocket-foundry-root \.death-save-label/);
  assert.match(css, /\.pocket-foundry-root \.mini-grid b\.exhaustion-pips/);
  assert.match(css, /\.pocket-foundry-root \.fillable-blips/);
  assert.match(css, /\.pocket-foundry-root \.fillable-blips\.rtl/);
  assert.match(css, /\.pocket-foundry-root \.fillable-blips\.color-failure/);
  assert.match(css, /\.pocket-foundry-root \.fillable-blips\.color-success/);
  assert.match(css, /\.pocket-foundry-root \.pip-group/);
  assert.match(css, /\.pocket-foundry-root \.rest-actions/);
  assert.match(css, /\.pocket-foundry-root \.rest-dialog-panel/);
  assert.match(css, /\.pocket-foundry-root \.rest-hp-readout/);
  assert.match(css, /\.pocket-foundry-root \.rest-hit-dice-actions/);
  assert.match(css, /\.pocket-foundry-root \.rest-roll-result/);
  assert.match(css, /\.pocket-foundry-root \.rest-option/);
  assert.doesNotMatch(css, /window-app:not\(\.pocket-foundry-root\):not\(\.rest\)|\.rest\.application/);
  assert.match(css, /\.pocket-foundry-root \.trait-groups/);
  assert.doesNotMatch(template, /sub-rail|section-picker|select-character-pane/);
  assert.doesNotMatch(template, /skill-group-heading/);
  assert.doesNotMatch(template, /href="#hp-spinner"|href="#temp-spinner"/);
  assert.doesNotMatch(template, /id="hp-spinner"|id="temp-spinner"/);
  assert.doesNotMatch(template, /<h2>Favorites<\/h2>|data-region="details-favorites"/);
  assert.doesNotMatch(template, /<em>Inspiration<\/em>/);
});

type TestDetailsActor = Dnd5eDetailsActor & {
  updates: Record<string, unknown>[];
  rests: Array<Record<string, unknown> & { type: "short" | "long"; dialog: false }>;
  hitDieRolls: Array<{ config?: { denomination?: string }; dialog?: { configure?: boolean }; message?: { create?: boolean } }>;
};

function createDetailsActor(overrides: Partial<TestDetailsActor> = {}): TestDetailsActor {
  const actor: TestDetailsActor = {
    uuid: "Actor.arlen",
    id: "arlen",
    name: "Arlen Mire",
    type: "character",
    img: "icons/svg/mystery-man.svg",
    isOwner: true,
    system: {
      abilities: {
        str: { value: 8, mod: -1, save: { value: -1, proficient: 0 } },
        dex: { value: 16, mod: 3, save: { value: 5, proficient: 1 } },
        con: { value: 14, mod: 2, save: { value: 2, proficient: 0 } },
        int: { value: 10, mod: 0, save: { value: 0, proficient: 0 } },
        wis: { value: 12, mod: 1, save: { value: 1, proficient: 0 } },
        cha: { value: 18, mod: 4, save: { value: 6, proficient: 1 } }
      },
      attributes: {
        ac: { value: 14 },
        hp: { value: 18, max: 24, effectiveMax: 24, temp: 5, tempmax: 0, pct: 75 },
        inspiration: true,
        init: { total: 4 },
        movement: { walk: 30, fly: 0, swim: 0 },
        prof: 2,
        hd: { value: 2, max: 3, bySize: { d8: 1, d10: 1 } },
        death: { success: 1, failure: 0 },
        exhaustion: 0,
        concentration: { save: { value: 2 } },
        senses: {
          ranges: { darkvision: 60 },
          special: "tremorsense 10"
        }
      },
      details: {
        level: 3,
        type: { value: "humanoid", subtype: "elf" },
        xp: { value: 900, max: 2700, pct: 33, boonsEarned: 1 }
      },
      skills: {
        acr: { ability: "dex", total: 3, passive: 13, prof: 0 },
        ste: { ability: "dex", total: 5, passive: 15, prof: 1 },
        arc: { ability: "int", total: 2, passive: 12, prof: 1 },
        prc: { ability: "wis", total: 3, passive: 13, prof: 1 }
      },
      tools: {
        thieves: { ability: "dex", total: 5, prof: 1 }
      },
      traits: {
        size: "med",
        dr: { value: ["fire", "cold"], custom: "Acid" },
        di: { value: ["radiant"] },
        ci: { value: ["poisoned"] },
        dv: { value: ["cold"] },
        armor: { value: ["lgt"] },
        weapon: { value: ["sim"] },
        languages: { value: ["common", "elvish"], custom: "Deep Speech" }
      }
    },
    items: [
      { name: "Warlock", type: "class", system: { levels: 3 } },
      { name: "Elf", type: "race", system: {} },
      { name: "Acolyte", type: "background", system: {} }
    ],
    testUserPermission: (_user: unknown, level: unknown) => level === "OBSERVER",
    canUserModify: (_user: unknown, action: string) => action === "update",
    getUserLevel: () => 3,
    updates: [],
    rests: [],
    hitDieRolls: [],
    update: async (data: Record<string, unknown>) => {
      actor.updates.push(data);
      return actor;
    },
    initiateRest: async (config: { type: "short" | "long"; dialog: false }) => {
      actor.rests.push(config);
      return actor;
    },
    rollHitDie: async (
      rollConfig: { denomination?: string } | undefined,
      dialog: { configure?: boolean } | undefined,
      message: { create?: boolean } | undefined
    ) => {
      actor.hitDieRolls.push({ config: rollConfig, dialog, message });
      await actor.update?.({ "system.attributes.hp.value": 24 });
      const hp = (actor.system?.attributes as { hp?: { value?: number } } | undefined)?.hp;
      if (hp) hp.value = 24;
      return [{ total: 7, formula: "1d8 + 2" }];
    },
    ...overrides
  };

  return actor;
}

