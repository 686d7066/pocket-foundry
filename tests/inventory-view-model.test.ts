import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  adjustInventoryRemainingUses,
  adjustInventoryQuantity,
  buildDnd5eInventoryViewModel,
  moveInventoryItemToContainer,
  removeInventoryItemFromContainer,
  setInventoryRemainingUses,
  toggleInventoryAttuned,
  toggleInventoryEquipped,
  toggleInventoryPrepared,
  type Dnd5eInventoryActor,
  type Dnd5eInventoryItem
} from "../src/systems/dnd5e/inventory-view-model.ts";

const user = { id: "player" };

test("inventory view model groups visible dnd5e items by semantic sections", async () => {
  const actor = createInventoryActor();
  const model = await buildDnd5eInventoryViewModel({ actor, user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal("viewMode" in model, false);
  assert.deepEqual(
    model.sections.map(section => [section.id, section.label, section.items.length]),
    [
      ["weapon", "Weapons", 2],
      ["equipment", "Equipment", 3],
      ["container", "Containers", 2]
    ]
  );
  assert.equal(model.sections.some(section => section.empty), false);

  const weapon = model.sections.find(section => section.id === "weapon")?.items[0];
  assert.equal(weapon?.name, "Dagger");
  assert.equal(weapon?.primary, "+5");
  assert.equal(weapon?.primaryLabel, "Roll");
  assert.equal(weapon?.roll, "+5");
  assert.equal(weapon?.damage, "1d4+2 piercing");
  assert.equal(weapon?.listFormula, "1d4+2 piercing");
  assert.equal(weapon?.usesLabel, "-");
  assert.equal(weapon?.chargesAdjustment, null);
  assert.deepEqual(weapon?.facts, [
    { label: "Range", value: "20/60 ft." },
    { label: "Quantity", value: "2" },
    { label: "Weight", value: "2" },
    { label: "Value", value: "2 gp" }
  ]);
  assert.deepEqual(weapon?.chips.includes("1d4+2 piercing"), false);
  assert.deepEqual(weapon?.actions.canToggleEquipped, true);
  assert.equal(weapon?.actions.canRecharge, false);

  const backpack = model.sections.find(section => section.id === "container")?.items[0];
  assert.deepEqual(model.sections.find(section => section.id === "weapon")?.listColumns.map(column => column.label), ["Roll", "Formula", "Charges"]);
  assert.deepEqual(model.sections.find(section => section.id === "equipment")?.listColumns.map(column => column.label), ["Weight", "Quantity", "Charges"]);
  assert.deepEqual(model.sections.find(section => section.id === "container")?.listColumns.map(column => column.label), ["Capacity", "Contents", "Quantity"]);
  assert.equal(backpack?.primaryLabel, "Capacity");
  assert.equal(backpack?.primary, "28/30");
  assert.deepEqual(backpack?.listCells.map(cell => [cell.id, cell.value]), [
    ["capacity", "28/30"],
    ["contents", "1"],
    ["quantity", "1"]
  ]);
  assert.equal(backpack?.listCells.some(cell => cell.id === "roll" || cell.id === "formula"), false);
  assert.equal(backpack?.facts.some(fact => fact.label === "Armor Class"), false);
});

test("inventory view model excludes non-inventory dnd5e document types from Loot", async () => {
  const model = await buildDnd5eInventoryViewModel({ actor: createInventoryActor(), user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const itemNames = model.sections.flatMap(section => section.items.map(item => item.name));
  assert.equal(itemNames.includes("Bard"), false);
  assert.equal(itemNames.includes("Human"), false);
  assert.equal(itemNames.includes("Spellcasting"), false);
  assert.equal(itemNames.includes("Bardic Inspiration"), false);
  assert.equal(itemNames.includes("Unarmed Strike"), true);
  const unarmedStrike = model.sections.find(section => section.id === "weapon")?.items.find(item => item.name === "Unarmed Strike");
  assert.equal(unarmedStrike?.listFormula, "-");
  assert.equal(model.sections.some(section => section.id === "loot"), false);
});

test("inventory view model keeps armor-like equipment entries in Equipment by default", async () => {
  const actor = createInventoryActor();
  actor.items.push(
    createItem(actor, {
      id: "shield",
      name: "Shield",
      type: "equipment",
      system: {
        inventorySection: "equipment",
        quantity: 1,
        weight: 6,
        armor: { value: 2 },
        type: { label: "Shield", value: "shield" }
      }
    }),
    createItem(actor, {
      id: "chain-mail",
      name: "Chain Mail",
      type: "equipment",
      system: {
        inventorySection: "equipment",
        quantity: 1,
        weight: 55,
        armor: { value: 16 },
        type: { label: "Heavy Armor", value: "heavy" }
      }
    })
  );

  const model = await buildDnd5eInventoryViewModel({ actor, user });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const equipmentSection = model.sections.find(section => section.id === "equipment");
  assert.ok(equipmentSection);
  assert.equal(equipmentSection.items.some(item => item.name === "Shield"), true);
  assert.equal(equipmentSection.items.some(item => item.name === "Chain Mail"), true);
  assert.equal(model.sections.some(section => section.id === "armor"), false);
});

test("inventory view model preserves container parent and child context", async () => {
  const model = await buildDnd5eInventoryViewModel({ actor: createInventoryActor(), user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.equal(model.status.encumbrance.label, "46 / 210");
  assert.equal(model.status.currency.total, "18 gp");
  assert.equal(model.status.attunement.label, "1/3");
  assert.deepEqual(model.status.containers.find(container => container.name === "Backpack"), {
    id: "backpack",
    uuid: "Actor.arlen.Item.backpack",
    name: "Backpack",
    iconText: "B",
    capacityLabel: "28 / 30 lb.",
    pct: 93,
    contents: "Rations"
  });

  const backpack = model.sections.find(section => section.id === "container")?.items[0];
  assert.equal(backpack?.contents, "Rations");
  assert.deepEqual(backpack?.children.map(child => child.name), ["Rations"]);
  assert.equal(backpack?.children[0]?.id, "rations");
  assert.equal(backpack?.children[0]?.uuid, "Actor.arlen.Item.rations");
  assert.match(backpack?.children[0]?.subtitle ?? "", /Food/);
});

test("inventory view model hides attunement toggles for non-attunable items and avoids open capacity labels", async () => {
  const actor = createInventoryActor();
  const model = await buildDnd5eInventoryViewModel({ actor, user });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  const dagger = model.sections.flatMap(section => section.items).find(item => item.name === "Dagger");
  const wand = model.sections.flatMap(section => section.items).find(item => item.name === "Wand of Sparks");
  const cloak = model.sections.flatMap(section => section.items).find(item => item.name === "Cloak of Quiet Stars");
  const pouch = model.sections.flatMap(section => section.items).find(item => item.name === "Pouch");
  const pouchStatus = model.status.containers.find(container => container.name === "Pouch");

  assert.equal(dagger?.actions.canToggleAttuned, false);
  assert.equal(wand?.actions.canToggleAttuned, true);
  assert.equal(wand?.usesLabel, "4/5");
  assert.equal(wand?.chargesAdjustment?.max, 5);
  assert.equal(wand?.chargesAdjustment?.current, 4);
  assert.deepEqual(wand?.chargesAdjustment?.options.map(option => option.value), [1, 0, -1, -2, -3, -4]);
  assert.equal(cloak?.actions.canToggleAttuned, true);
  assert.equal(cloak?.states.attuned, false);
  assert.equal(pouch?.primaryLabel, "Container");
  assert.equal(pouch?.primary, "");
  assert.equal(pouchStatus?.capacityLabel, "Empty container");
});

test("inventory view model gates actor and item visibility without leaking hidden item names", async () => {
  const hiddenActor = createInventoryActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });
  assert.deepEqual(await buildDnd5eInventoryViewModel({ actor: hiddenActor, user }), {
    unavailable: true,
    title: "Inventory Unavailable",
    body: "This inventory is not available to the current user."
  });

  const model = await buildDnd5eInventoryViewModel({ actor: createInventoryActor(), user });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;
  assert.equal(JSON.stringify(model).includes("Secret Gem"), false);
});

test("inventory model has no view-mode state", async () => {
  const actor = createInventoryActor();
  const model = await buildDnd5eInventoryViewModel({ actor, user });
  assert.equal(model.unavailable, false);
  if (model.unavailable) return;
  assert.equal("viewMode" in model, false);
  assert.deepEqual(actor.updates, []);
  assert.deepEqual(actor.embeddedUpdates, []);
});

test("inventory descriptions keep content links but strip roll actions after enrichment", async () => {
  const previousTextEditor = Object.getOwnPropertyDescriptor(globalThis, "TextEditor");
  const actor = createInventoryActor();
  const wand = getItem(actor, "wand");
  if (!wand) throw new Error("Missing wand fixture.");
  wand.system = {
    ...(wand.system ?? {}),
    description: {
      value: "<p>You can force a creature to attempt [[/save ability=wis dc=13 format=long]].</p>"
    }
  };

  Object.defineProperty(globalThis, "TextEditor", {
    configurable: true,
    value: {
      enrichHTML: async (content: string) => content
        .replace("[[/save ability=wis dc=13 format=long]]", "<a class=\"inline-roll\" data-action=\"roll\">WIS Save</a>")
        .replace("a creature", "<a class=\"content-link\" data-uuid=\"Compendium.dnd5e.rules.Item.creature\">a creature</a>")
    }
  });

  try {
    const model = await buildDnd5eInventoryViewModel({ actor, user });
    assert.equal(model.unavailable, false);
    if (model.unavailable) return;
    const row = model.sections.flatMap(section => section.items).find(item => item.id === "wand");
    assert.match(row?.description ?? "", /WIS Save/);
    assert.doesNotMatch(row?.description ?? "", /data-action="roll"/);
    assert.match(row?.description ?? "", /data-uuid="Compendium\.dnd5e\.rules\.Item\.creature"/);
  } finally {
    if (previousTextEditor) Object.defineProperty(globalThis, "TextEditor", previousTextEditor);
    else Reflect.deleteProperty(globalThis, "TextEditor");
  }
});

test("inventory controls require update permission and use embedded document update APIs", async () => {
  const actor = createInventoryActor();
  const denied = createInventoryActor({
    canUserModify: () => false,
    getUserLevel: () => 2
  });

  assert.deepEqual(await adjustInventoryQuantity(actor, user, "dagger", 1), { ok: true });
  assert.deepEqual(await adjustInventoryRemainingUses(actor, user, "wand", 1), { ok: true });
  assert.deepEqual(await setInventoryRemainingUses(actor, user, "wand", 3), { ok: true });
  assert.deepEqual(await toggleInventoryEquipped(actor, user, "dagger"), { ok: true });
  assert.deepEqual(await toggleInventoryAttuned(actor, user, "wand"), { ok: true });
  assert.deepEqual(await toggleInventoryAttuned(actor, user, "cloak"), { ok: true });
  assert.deepEqual(await toggleInventoryPrepared(actor, user, "focus"), { ok: true });
  assert.deepEqual(await moveInventoryItemToContainer(actor, user, "dagger", "backpack"), { ok: true });
  assert.deepEqual(await removeInventoryItemFromContainer(actor, user, "rations"), { ok: true });

  assert.deepEqual(actor.embeddedUpdates, [
    { embeddedName: "Item", updates: [{ _id: "dagger", "system.quantity": 3 }] },
    { embeddedName: "Item", updates: [{ _id: "wand", "system.uses.spent": 0 }] },
    { embeddedName: "Item", updates: [{ _id: "wand", "system.uses.spent": 2 }] },
    { embeddedName: "Item", updates: [{ _id: "dagger", "system.equipped": false }] },
    { embeddedName: "Item", updates: [{ _id: "wand", "system.attuned": false }] },
    { embeddedName: "Item", updates: [{ _id: "cloak", "system.attuned": true }] },
    { embeddedName: "Item", updates: [{ _id: "focus", "system.prepared": false }] },
    { embeddedName: "Item", updates: [{ _id: "dagger", "system.container": "backpack" }] },
    { embeddedName: "Item", updates: [{ _id: "rations", "system.container": "" }] }
  ]);
  assert.equal(getItem(actor, "dagger")?.system?.quantity, 2);

  assert.deepEqual(await adjustInventoryQuantity(denied, user, "dagger", 1), { ok: false, reason: "forbidden" });
  assert.deepEqual(await toggleInventoryEquipped(denied, user, "dagger"), { ok: false, reason: "forbidden" });
  assert.deepEqual(denied.embeddedUpdates, []);
});

test("inventory template and styles preserve required regions without a local category rail", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/inventory.hbs", import.meta.url), "utf8");
  const rowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/inventory-list-row.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../src/systems/dnd5e/actor-sheet-navigation.ts", import.meta.url), "utf8");
  const buildSource = readFileSync(new URL("../scripts/build.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(template, /class="content sheet-dense inventory-pane"/);
  assert.match(template, /class="sheet-status"/);
  assert.match(template, /class="inventory-list-view compact-panels"/);
  assert.match(template, /class="section-heading sheet-group-heading inventory-section-heading"/);
  assert.match(template, /class="chip inventory-section-summary"/);
  assert.match(template, /<span>Weight<\/span><strong>\{\{weight\}\}<\/strong>/);
  assert.doesNotMatch(template, /\{\{count\}\}|>items</);
  assert.match(template, /sheet-table/);
  assert.match(template, /class="sheet-table sheet-list inventory-list"/);
  assert.match(template, /class="sheet-list-head inventory-list-head inventory-list-head-\{\{id\}\}[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-3meta-actions/);
  assert.match(template, /partials\/inventory-list-row\.hbs/);
  assert.match(rowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(rowTemplate, /class="row inventory-list-row inventory-list-row-\{\{sectionId\}\} inventory-list-row-\{\{type\}\}"/);
  assert.match(rowTemplate, /drawerClass="inventory-detail-drawer"/);
  assert.match(rowTemplate, /summaryClass="inventory-list-row-summary[^"]*pf-list-schema[^"]*pf-list-schema--icon-title-3meta-actions"/);
  assert.match(rowTemplate, /bodyClass="pf-expandable-detail-body"/);
  assert.match(rowTemplate, /class="inventory-detail-actions[^"]*pf-detail-actions"/);
  assert.match(rowTemplate, /class="inventory-children"/);
  assert.match(rowTemplate, /data-action="inventory-open-item"/);
  assert.match(rowTemplate, /class="inventory-icon-toggle inventory-summary-equip equipped/);
  assert.match(rowTemplate, /class="inventory-icon-toggle inventory-summary-attuned attuned/);
  assert.doesNotMatch(rowTemplate, /inventory-expand-indicator/);
  assert.match(template, /\{\{#each listColumns\}\}<span class="inventory-list-head-cell inventory-list-head-cell-\{\{id\}\}">\{\{label\}\}<\/span>\{\{\/each\}\}/);
  assert.match(rowTemplate, /\{\{#each adjustments\}\}/);
  assert.match(rowTemplate, /data-action="inventory-open-number-dialog"/);
  assert.match(rowTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(rowTemplate, /confirmActionPrefix="inventory-confirm"/);
  assert.match(rowTemplate, /confirmActionMiddle=id/);
  assert.match(adapterSource, /inventory-confirm-quantity-delta/);
  assert.match(adapterSource, /inventory-confirm-charges-delta/);
  assert.match(rowTemplate, /class="sheet-list-value inventory-list-value inventory-list-cell inventory-list-cell-\{\{id\}\}/);
  assert.match(rowTemplate, /class="inventory-icon-toggle inventory-summary-equip equipped/);
  assert.match(rowTemplate, /class="inventory-icon-toggle inventory-summary-attuned attuned/);
  assert.match(rowTemplate, /fa-solid fa-shield-halved/);
  assert.match(rowTemplate, /fa-solid fa-sun/);
  assert.match(rowTemplate, /fa-solid fa-bolt/);
  assert.doesNotMatch(template, /data-action="inventory-quantity"/);
  assert.doesNotMatch(moduleSource, /`\$\{TEMPLATE_ROOT\}\/inventory\.hbs`/);
  assert.match(buildSource, /@tailwindcss\/cli/);
  assert.match(buildSource, /compileStyles/);
  assert.match(css, /\.pocket-foundry-root \.sheet-status/);
  assert.match(css, /\.pocket-foundry-root \.sheet-table/);
  assert.match(css, /\.pocket-foundry-root \.sheet-group-heading/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list\.sheet-table/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list-row/);
  assert.match(css, /\.pocket-foundry-root \.inventory-section-summary/);
  assert.match(css, /\.pocket-foundry-root \.inventory-list-row/);
  assert.match(css, /\.pocket-foundry-root \.pf-list-schema--icon-title-3meta-actions/);
  assert.match(css, /\.pocket-foundry-root \.inventory-detail-drawer/);
  assert.match(css, /\.pocket-foundry-root \.pf-expandable-detail-body/);
  assert.match(css, /\.pocket-foundry-root \.pf-detail-actions/);
  assert.match(css, /\.pocket-foundry-root \.inventory-children/);
  assert.match(css, /\.pocket-foundry-root \.pf-list-schema--icon-title-3meta-actions/);
  assert.match(css, /\.pocket-foundry-root \.inventory-list-value/);
  assert.match(css, /\.pocket-foundry-root \.inventory-list-summary-actions \.inventory-summary-equip/);
  assert.match(css, /\.pocket-foundry-root \.inventory-list-summary-actions \.inventory-summary-attuned/);
  assert.match(css, /\.pocket-foundry-root \.inventory-number-button/);
  assert.doesNotMatch(css, /\.pocket-foundry-root \.inventory-list-head-equipment/);
  assert.doesNotMatch(css, /\.pocket-foundry-root \.inventory-list-row-container/);
  assert.match(css, /\.pocket-foundry-root \.sheet-list-row > \.sheet-row-title \{/);
  assert.match(css, /@import "tailwindcss\/theme"/);
  assert.match(css, /@import "tailwindcss\/utilities"/);
  assert.match(css, /grid-rows-\[16px_12px\]/);
  assert.match(css, /text-left/);
  assert.match(css, /sheet-list\.sheet-table \{ @apply grid max-w-full overflow-hidden border-separate gap-0 px-2 pb-1; \}/);
  assert.match(css, /min-h-\[42px\]/);
  assert.match(css, /inline-flex/);
  assert.match(css, /\.pocket-foundry-root \.inventory-icon-toggle i/);
  assert.match(css, /pointer-events-none/);
  assert.match(css, /\.pocket-foundry-root \.inventory-toggle\.active/);
  assert.doesNotMatch(template, /sub-rail|inventory-category-rail|data-action="create"|data-action="delete"|data-action="inventory-use-item"|Open Sheet|>Recharge<|<dt>State<\/dt>|Visible inventory entries|\binert\b/);
});

type TestInventoryActor = Dnd5eInventoryActor & {
  items: TestInventoryItem[];
  updates: Record<string, unknown>[];
  embeddedUpdates: Array<{ embeddedName: "Item"; updates: Array<Record<string, unknown>> }>;
};

type TestInventoryItem = Dnd5eInventoryItem & {
  system: Record<string, unknown>;
};

function createInventoryActor(overrides: Partial<TestInventoryActor> = {}): TestInventoryActor {
  const actor: TestInventoryActor = {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    system: {
      attributes: {
        encumbrance: { value: 46, max: 210, pct: 22, units: "lb." },
        attunement: { value: 1, max: 3 }
      },
      currency: { gp: 18, sp: 54, cp: 37 }
    },
    items: [],
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    updates: [],
    embeddedUpdates: [],
    update: async data => {
      actor.updates.push(data);
      return actor;
    },
    updateEmbeddedDocuments: async (embeddedName, updates) => {
      actor.embeddedUpdates.push({ embeddedName, updates });
      return updates;
    },
    ...overrides
  };

  actor.items = [
    createItem(actor, {
      id: "dagger",
      name: "Dagger",
      type: "weapon",
      system: { inventorySection: "weapon", quantity: 2, weight: 1, totalWeight: 2, equipped: true, attuned: false, price: { value: 2, denomination: "gp" }, type: { label: "Simple melee" } },
      labels: { modifier: "5", damages: ["1d4+2 piercing"], range: "20/60 ft." },
      hasAttack: true
    }),
    createItem(actor, {
      id: "unarmed-strike",
      name: "Unarmed Strike",
      type: "weapon",
      system: { inventorySection: "weapon", quantity: 1, weight: 0, totalWeight: 0, equipped: true, type: { label: "Natural", value: "natural" } },
      labels: { modifier: "+4" }
    }),
    createItem(actor, {
      id: "focus",
      name: "Arcane Focus",
      type: "equipment",
      system: { inventorySection: "equipment", quantity: 1, weight: 2, prepared: true, type: { label: "Spellcasting focus" } }
    }),
    createItem(actor, {
      id: "backpack",
      name: "Backpack",
      type: "container",
      system: { inventorySection: "container", quantity: 1, capacity: { value: 28, max: 30, units: "lb." } }
    }),
    createItem(actor, {
      id: "pouch",
      name: "Pouch",
      type: "container",
      system: { inventorySection: "container", quantity: 1 }
    }),
    createItem(actor, {
      id: "rations",
      name: "Rations",
      type: "consumable",
      system: { inventorySection: "consumable", quantity: 5, weight: 2, totalWeight: 10, container: "backpack", type: { label: "Food" } }
    }),
    createItem(actor, {
      id: "wand",
      name: "Wand of Sparks",
      type: "equipment",
      system: { inventorySection: "equipment", quantity: 1, attunement: 1, attuned: true, uses: { spent: 1, max: 5 }, type: { label: "Wand" } }
    }),
    createItem(actor, {
      id: "cloak",
      name: "Cloak of Quiet Stars",
      type: "equipment",
      system: { inventorySection: "equipment", quantity: 1, attunement: "required", type: { label: "Wondrous Item" } }
    }),
    createItem(actor, {
      id: "secret",
      name: "Secret Gem",
      type: "loot",
      system: { inventorySection: "loot", quantity: 1 },
      testUserPermission: () => false,
      getUserLevel: () => 0
    }),
    createItem(actor, {
      id: "bard",
      name: "Bard",
      type: "class",
      system: { levels: 3 }
    }),
    createItem(actor, {
      id: "human",
      name: "Human",
      type: "species",
      system: {}
    }),
    createItem(actor, {
      id: "spellcasting",
      name: "Spellcasting",
      type: "feat",
      system: {}
    }),
    createItem(actor, {
      id: "bardic-inspiration",
      name: "Bardic Inspiration",
      type: "feat",
      system: { uses: { value: 0, max: 4 } }
    })
  ];

  return actor;
}

function createItem(actor: TestInventoryActor, item: Partial<TestInventoryItem> & Pick<TestInventoryItem, "id" | "name" | "type" | "system">): TestInventoryItem {
  return {
    uuid: `Actor.arlen.Item.${item.id}`,
    parent: actor,
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    ...item
  };
}

function getItem(actor: TestInventoryActor, itemId: string): TestInventoryItem | undefined {
  return actor.items.find(item => item.id === itemId);
}

