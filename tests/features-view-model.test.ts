import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  adjustFeatureRemainingUses,
  buildDnd5eFeaturesViewModel,
  endFeatureConcentration,
  rechargeFeature,
  setFeatureFavorite,
  useFeatureActivity,
  useFeatureItem,
  type Dnd5eFeatureActivity,
  type Dnd5eFeaturesActor,
  type Dnd5eFeaturesItem
} from "../src/systems/dnd5e/features-view-model.ts";

const user = { id: "player" };

test("features view model groups visible dnd5e features by dnd5e origin sections", async () => {
  const actor = createFeaturesActor();
  const model = await buildDnd5eFeaturesViewModel({ actor, user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(
    model.sections.map(section => [section.id, section.label, section.count]),
    [
      ["class:paladin", "Paladin Features", 4],
      ["species", "Species Features", 1],
      ["background", "Background Features", 1],
      ["other", "Other Features", 1]
    ]
  );

  const classRows = model.sections.find(section => section.id === "class:paladin")?.items;
  assert.deepEqual(classRows?.map(item => item.name), ["Oath of Devotion", "Lay on Hands", "Divine Sense", "Channel Divinity"]);
  assert.equal(classRows?.find(item => item.name === "Lay on Hands")?.activation, "Action");
  assert.equal(classRows?.find(item => item.name === "Lay on Hands")?.usesLabel, "3/5");
  assert.equal(classRows?.find(item => item.name === "Lay on Hands")?.recovery, "Long Rest");
  assert.equal(classRows?.find(item => item.name === "Lay on Hands")?.source, "Paladin");
  assert.equal(classRows?.find(item => item.name === "Lay on Hands")?.actions.canUse, true);
  assert.equal(classRows?.find(item => item.name === "Channel Divinity")?.actions.canUse, false);
  assert.equal(classRows?.find(item => item.name === "Channel Divinity")?.activities.length, 2);
  assert.equal(classRows?.find(item => item.name === "Divine Sense")?.state, "Passive");

  assert.deepEqual(model.sections.find(section => section.id === "species")?.items.map(item => item.name), ["Fey Ancestry"]);
  assert.deepEqual(model.sections.find(section => section.id === "background")?.items.map(item => item.name), ["Researcher"]);
  assert.deepEqual(model.sections.find(section => section.id === "other")?.items.map(item => item.name), ["Mystic Step"]);
  assert.equal(JSON.stringify(model).includes("Hidden Smite"), false);
});

test("features progression header maps class, subclass, species, and background", async () => {
  const model = await buildDnd5eFeaturesViewModel({ actor: createFeaturesActor(), user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(
    model.status.map(card => [card.primary, card.secondary]),
    [
      ["Paladin 5", "Oath of Devotion"],
      ["Elf", "Species"],
      ["Sage", "Background"]
    ]
  );
});

test("features view model requires observer permission before rendering", async () => {
  const hiddenActor = createFeaturesActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eFeaturesViewModel({ actor: hiddenActor, user }), {
    unavailable: true,
    title: "Features Unavailable",
    body: "These features are not available to the current user."
  });
});

test("features search filters rows through the shared pane search model", async () => {
  const model = await buildDnd5eFeaturesViewModel({ actor: createFeaturesActor(), user, searchQuery: "mystic" });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.searchQuery, "mystic");
  assert.equal(model.canClearSearch, true);
  assert.deepEqual(model.sections.map(section => [section.id, section.items.map(item => item.name)]), [["other", ["Mystic Step"]]]);
});

test("features descriptions keep content links but strip roll actions after enrichment", async () => {
  const previousTextEditor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const actor = createFeaturesActor();
  const layOnHands = getItem(actor, "lay-on-hands");
  if (!layOnHands) throw new Error("Missing lay-on-hands fixture.");
  layOnHands.system = {
    ...(layOnHands.system ?? {}),
    description: {
      value: "<p>One creature makes a [[/save ability=wis dc=@attributes.spelldc format=long]].</p>"
    }
  };

  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    value: {
      enrichHTML: async (content: string) => content
        .replace(
          "[[/save ability=wis dc=@attributes.spelldc format=long]]",
          "<a class=\"inline-roll\" data-action=\"roll\">WIS Save</a>"
        )
        .replace("One creature", "<a class=\"content-link\" data-uuid=\"Compendium.dnd5e.rules.Item.creature\">One creature</a>")
    }
  });

  try {
    const model = await buildDnd5eFeaturesViewModel({ actor, user });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;

    const row = model.sections.flatMap(section => section.items).find(item => item.id === "lay-on-hands");
    assert.match(row?.description ?? "", /WIS Save/);
    assert.doesNotMatch(row?.description ?? "", /data-action="roll"/);
    assert.match(row?.description ?? "", /data-uuid="Compendium\.dnd5e\.rules\.Item\.creature"/);
  } finally {
    if (previousTextEditor) Object.defineProperty(globalThis, "TextEditor", previousTextEditor);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});

test("feature controls require update permission and call dnd5e document APIs", async () => {
  const actor = createFeaturesActor();
  const denied = createFeaturesActor({
    canUserModify: () => false,
    getUserLevel: () => 2
  });

  assert.deepEqual(await useFeatureItem(actor, user, "lay-on-hands"), { ok: true });
  assert.deepEqual(await useFeatureActivity(actor, user, "channel-divinity", "turn-undead"), { ok: true });
  assert.deepEqual(await adjustFeatureRemainingUses(actor, user, "lay-on-hands", -1), { ok: true });
  assert.deepEqual(await rechargeFeature(actor, user, "mystic-step"), { ok: true });
  assert.deepEqual(await setFeatureFavorite(actor, user, "lay-on-hands", true), { ok: true });
  assert.deepEqual(await setFeatureFavorite(actor, user, "lay-on-hands", false), { ok: true });
  assert.deepEqual(await endFeatureConcentration(actor, user, "mystic-step"), { ok: true });

  assert.equal(getItem(actor, "lay-on-hands")?.uses, 1);
  assert.equal(getActivity(actor, "channel-divinity", "turn-undead")?.useCalls, 1);
  assert.deepEqual(actor.embeddedUpdates, [{ embeddedName: "Item", updates: [{ _id: "lay-on-hands", "system.uses.spent": 3 }] }]);
  assert.equal(actor.recharged, 1);
  assert.deepEqual(actor.favoriteCalls, [
    ["add", "lay-on-hands"],
    ["remove", "lay-on-hands"]
  ]);
  assert.deepEqual(actor.concentrationEnded, ["mystic-step"]);

  assert.deepEqual(await useFeatureItem(denied, user, "lay-on-hands"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await adjustFeatureRemainingUses(denied, user, "lay-on-hands", 1), { ok: false, reason: "forbidden" });
  assert.deepEqual(await rechargeFeature(denied, user, "mystic-step"), { ok: false, reason: "forbidden" });
  assert.deepEqual(await setFeatureFavorite(denied, user, "lay-on-hands", true), { ok: false, reason: "forbidden" });
  assert.deepEqual(await endFeatureConcentration(denied, user, "mystic-step"), { ok: false, reason: "forbidden" });
  assert.deepEqual(denied.embeddedUpdates, []);
});

test("features template and styles preserve required regions without create or delete controls", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/features.hbs", import.meta.url), "utf8");
  const rowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/feature-row.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const actorSheetNavigationSource = readFileSync(new URL("../src/systems/dnd5e/actor-sheet-navigation.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(template, /class="content sheet-dense features-pane"/);
  assert.match(template, /partials\/pane-search-toolbar\.hbs/);
  assert.match(template, /toolbarClass="features-toolbar"/);
  assert.match(template, /placeholder="Search features"/);
  assert.match(template, /pane="Features"/);
  assert.match(template, /value=searchQuery/);
  assert.match(template, /canClear=canClearSearch/);
  assert.match(template, /class="sheet-status features-status"/);
  assert.match(template, /class="features-sections"/);
  assert.match(template, /class="section sheet-group features-section features-section-\{\{id\}\}"/);
  assert.match(template, /class="section-heading sheet-group-heading features-section-heading"/);
  assert.match(template, /class="sheet-list-head features-list-head[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-2meta-actions/);
  assert.match(template, /partials\/feature-row\.hbs/);
  assert.match(rowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(rowTemplate, /class="row sheet-list-row features-list-row feature-row"/);
  assert.match(rowTemplate, /drawerClass="feature-detail-drawer"/);
  assert.match(rowTemplate, /summaryClass="feature-row-summary[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-2meta-actions"/);
  assert.match(rowTemplate, /bodyClass="pf-expandable-detail-body"/);
  assert.match(rowTemplate, /data-action="features-recharge"/);
  assert.doesNotMatch(rowTemplate, /data-action="features-use-item"/);
  assert.doesNotMatch(rowTemplate, /data-action="features-use-activity"/);
  assert.doesNotMatch(rowTemplate, /data-action="features-open-number-dialog"/);
  assert.doesNotMatch(rowTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.doesNotMatch(rowTemplate, />Use<\/button>/);
  assert.match(template, /<h2>\{\{label\}\}<\/h2>/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(actorSheetNavigationSource, /buildDnd5eFeaturesViewModel/);
  assert.match(actorSheetNavigationSource, /case "Features":/);
  assert.match(actorSheetNavigationSource, /getCharacterPaneSearchQuery/);
  assert.match(actorSheetNavigationSource, /features-confirm-uses-delta/);
  assert.match(css, /\.pocket-foundry-root \.features-status/);
  assert.match(css, /\.pocket-foundry-root \.features-toolbar/);
  assert.match(css, /\.pocket-foundry-root \.features-sections/);
  assert.match(css, /\.pocket-foundry-root \.sheet-group-heading/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list\.sheet-table/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list-row/);
  assert.match(css, /\.pocket-foundry-root \.pf-list-schema--icon-title-2meta-actions/);
  assert.match(css, /\.pocket-foundry-root \.features-list-row/);
  assert.match(css, /sheet-list\.sheet-table \{ @apply grid max-w-full overflow-hidden border-separate gap-0 px-2 pb-1; \}/);
  assert.doesNotMatch(template, /Ready Actions|>Details<|sub-rail|feature-mode-rail|data-action="create"|data-action="delete"|Open Sheet|level-selector|Filter features|Sort features|Group features|fa-filter|fa-arrow-down-short-wide|fa-layer-group/);
  assert.doesNotMatch(rowTemplate, /fa-expand/);
  assert.match(css, /\.pocket-foundry-root \.feature-detail-drawer/);
  assert.match(css, /\.pocket-foundry-root \.feature-activity-row/);
});

type TestFeaturesActor = Dnd5eFeaturesActor & {
  items: TestFeaturesItem[];
  embeddedUpdates: Array<{ embeddedName: "Item"; updates: Array<Record<string, unknown>> }>;
  favoriteCalls: Array<[string, string]>;
  concentrationEnded: string[];
  recharged: number;
};

type TestFeaturesItem = Dnd5eFeaturesItem & {
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  uses?: number;
};

type TestActivity = Dnd5eFeatureActivity & {
  id: string;
  name: string;
  useCalls?: number;
};

function createFeaturesActor(overrides: Partial<TestFeaturesActor> = {}): TestFeaturesActor {
  const actor: TestFeaturesActor = {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    name: "Arlen Mire",
    system: {
      favorites: ["Actor.arlen.Item.mystic-step"],
      concentration: { itemId: "mystic-step" },
      addFavorite: async (item: TestFeaturesItem) => {
        actor.favoriteCalls.push(["add", item.id]);
      },
      removeFavorite: async (item: TestFeaturesItem) => {
        actor.favoriteCalls.push(["remove", item.id]);
      },
      details: {}
    },
    items: [],
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    embeddedUpdates: [],
    favoriteCalls: [],
    concentrationEnded: [],
    recharged: 0,
    updateEmbeddedDocuments: async (embeddedName, updates) => {
      actor.embeddedUpdates.push({ embeddedName, updates });
      return updates;
    },
    endConcentration: async item => {
      actor.concentrationEnded.push(item.id ?? "");
    },
    ...overrides
  };

  const paladin = createItem(actor, { id: "paladin", name: "Paladin", type: "class", identifier: "paladin", system: { levels: 5 } });
  const devotion = createItem(actor, { id: "devotion", name: "Oath of Devotion", type: "subclass", system: { classIdentifier: "paladin", type: { label: "Sacred Oath" } }, flags: { dnd5e: { advancementRoot: "paladin.subclass" } } });
  const elf = createItem(actor, { id: "elf", name: "Elf", type: "race", system: {} });
  const sage = createItem(actor, { id: "sage", name: "Sage", type: "background", system: {} });

  actor.system = {
    ...actor.system,
    details: { race: elf, background: sage }
  };

  actor.items = [
    paladin,
    devotion,
    elf,
    sage,
    createItem(actor, {
      id: "lay-on-hands",
      name: "Lay on Hands",
      type: "feat",
      flags: { dnd5e: { advancementRoot: "paladin.1" } },
      system: {
        type: { label: "Class Feature", value: "class" },
        uses: { value: 3, max: 5, recovery: [{ period: "Long Rest" }] },
        activities: [
          createActivity("healing-pool", "Healing Pool", { activation: "Action", uses: { value: 3, max: 5 }, range: "Touch" })
        ]
      },
      labels: { activation: "Action", recovery: "Long Rest" },
      use: async () => {
        const item = getItem(actor, "lay-on-hands");
        if (item) item.uses = (item.uses ?? 0) + 1;
      }
    }),
    createItem(actor, {
      id: "divine-sense",
      name: "Divine Sense",
      type: "feat",
      flags: { dnd5e: { advancementRoot: "paladin.1" } },
      system: { type: { label: "Class Feature", value: "class" }, properties: new Set(["trait"]) },
      labels: { recovery: "Long Rest" }
    }),
    createItem(actor, {
      id: "channel-divinity",
      name: "Channel Divinity",
      type: "feat",
      flags: { dnd5e: { advancementRoot: "devotion.3" } },
      system: {
        type: { label: "Class Feature", value: "subclass" },
        activities: [
          createActivity("turn-undead", "Turn Undead", { activation: "Action", save: "WIS 15" }),
          createActivity("sacred-weapon", "Sacred Weapon", { activation: "Action" })
        ]
      },
      labels: { activation: "Action" },
      use: async () => undefined
    }),
    createItem(actor, {
      id: "fey-ancestry",
      name: "Fey Ancestry",
      type: "feat",
      flags: { dnd5e: { advancementRoot: "elf.1" } },
      system: { type: { label: "Species Feature", value: "species" }, properties: new Set(["trait"]) }
    }),
    createItem(actor, {
      id: "researcher",
      name: "Researcher",
      type: "feat",
      flags: { dnd5e: { advancementRoot: "sage.1" } },
      system: { type: { label: "Background Feature", value: "background" } }
    }),
    createItem(actor, {
      id: "mystic-step",
      name: "Mystic Step",
      type: "feat",
      system: {
        type: { label: "Feature", value: "other" },
        uses: {
          value: 0,
          max: 1,
          rollRecharge: async () => {
            actor.recharged += 1;
          }
        },
        activities: [createActivity("teleport", "Teleport", { activation: "Bonus Action" })]
      },
      labels: { activation: "Bonus Action", recovery: "Recharge" },
      hasRecharge: true,
      isOnCooldown: true,
      use: async () => undefined
    }),
    createItem(actor, {
      id: "hidden-smite",
      name: "Hidden Smite",
      type: "feat",
      system: { activities: [createActivity("smite", "Smite", { activation: "Action" })] },
      testUserPermission: () => false,
      getUserLevel: () => 0
    })
  ];

  return actor;
}

function createItem(actor: TestFeaturesActor, item: Partial<TestFeaturesItem> & Pick<TestFeaturesItem, "id" | "name" | "type" | "system">): TestFeaturesItem {
  return {
    uuid: `Actor.arlen.Item.${item.id}`,
    parent: actor,
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    isActive: true,
    isOwner: true,
    ...item
  };
}

function createActivity(id: string, name: string, options: { activation?: string; range?: string; save?: string; uses?: Record<string, unknown> } = {}): TestActivity {
  const activity: TestActivity = {
    id,
    _id: id,
    name,
    canUse: true,
    use: async () => {
      activity.useCalls = (activity.useCalls ?? 0) + 1;
    },
    prepareSheetContext: () => ({
      _id: id,
      name,
      labels: {
        activation: options.activation ?? "",
        range: options.range ?? "",
        save: options.save ?? ""
      },
      uses: options.uses
    })
  };
  return activity;
}

function getItem(actor: TestFeaturesActor, itemId: string): TestFeaturesItem | undefined {
  return actor.items.find(item => item.id === itemId);
}

function getActivity(actor: TestFeaturesActor, itemId: string, activityId: string): TestActivity | undefined {
  return ((getItem(actor, itemId)?.system.activities as TestActivity[] | undefined) ?? []).find(activity => activity.id === activityId);
}

