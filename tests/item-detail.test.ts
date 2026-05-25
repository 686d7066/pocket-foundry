import assert from "node:assert/strict";
import { test } from "vitest";
import { buildItemDetailViewModel, type ItemDetailDocumentLike } from "../src/services/item-detail.ts";

const user = { id: "player" };

function createItem(options: {
  uuid: string;
  name: string;
  type?: string;
  img?: string | null;
  pack?: string | null;
  visible?: boolean;
  system?: unknown;
}): ItemDetailDocumentLike {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: "Item",
    type: options.type,
    img: options.img,
    pack: options.pack,
    system: options.system,
    testUserPermission: (_user, level) => level === "OBSERVER" && (options.visible ?? true),
    getUserLevel: () => (options.visible === false ? 0 : 2)
  };
}

test("world item detail view is mobile-native, read-only, and permission checked", async () => {
  const item = createItem({
    uuid: "Item.arcane-focus",
    name: "Arcane Focus: Iron Rod",
    type: "equipment",
    img: "icons/focus.webp",
    system: {
      description: { value: "<p>A visible spellcasting focus.</p>" },
      quantity: 1,
      weight: 1,
      price: { value: 10, denomination: "gp" }
    }
  });

  const model = await buildItemDetailViewModel("Item.arcane-focus", {}, {
    user,
    fromUuid: async uuid => (uuid === item.uuid ? item : null),
    enrichHTML: async html => `<article>${html}</article>`
  });

  assert.equal(model.available, true);
  assert.equal(model.name, "Arcane Focus: Iron Rod");
  assert.equal(model.typeLabel, "Equipment");
  assert.equal(model.icon, "icons/focus.webp");
  assert.equal(model.descriptionHtml, "<article><p>A visible spellcasting focus.</p></article>");
  assert.deepEqual(model.chips, [{ id: "type", label: "Type", value: "Equipment" }]);
  assert.deepEqual(model.fields, [
    { label: "Quantity", value: "1" },
    { label: "Weight", value: "1" },
    { label: "Price", value: "10 gp" }
  ]);
  assert.doesNotMatch(JSON.stringify(model), /create|delete|edit|import|Open Sheet/i);
});

test("compendium spell detail includes source pack and spell-specific fields", async () => {
  const bane = createItem({
    uuid: "Compendium.dnd5e.spells.Item.bane",
    name: "Bane",
    type: "spell",
    img: "icons/bane.webp",
    pack: "dnd5e.spells",
    system: {
      level: 1,
      school: "enc",
      activation: { value: 1, units: "action" },
      range: { value: 30, units: "ft" },
      duration: { value: 1, units: "minute" },
      description: { value: "<p>Visible spell rules.</p>" }
    }
  });

  const model = await buildItemDetailViewModel("Compendium.dnd5e.spells.Item.bane", { source: "Spells (SRD)" }, {
    user,
    fromUuid: async uuid => (uuid === bane.uuid ? bane : null),
    enrichHTML: async html => html
  });

  assert.equal(model.available, true);
  assert.equal(model.name, "Bane");
  assert.equal(model.typeLabel, "Spell");
  assert.equal(model.source, "Spells (SRD)");
  assert.deepEqual(model.chips, [
    { id: "type", label: "Type", value: "Spell" },
    { id: "source", label: "Pack", value: "Spells (SRD)" }
  ]);
  assert.deepEqual(model.fields, [
    { label: "Level", value: "1" },
    { label: "School", value: "enc" },
    { label: "Activation", value: "1 action" },
    { label: "Range", value: "30 ft" },
    { label: "Duration", value: "1 minute" }
  ]);
});

test("hidden or missing item detail renders a non-leaking unavailable state", async () => {
  const hidden = createItem({
    uuid: "Item.hidden",
    name: "Hidden Relic",
    visible: false,
    system: { description: { value: "Secret rules" } }
  });

  const hiddenModel = await buildItemDetailViewModel("Item.hidden", {}, {
    user,
    fromUuid: async uuid => (uuid === hidden.uuid ? hidden : null)
  });
  const missingModel = await buildItemDetailViewModel("Item.missing", {}, {
    user,
    fromUuid: async () => null
  });

  assert.deepEqual(hiddenModel, {
    available: false,
    title: "Unavailable document",
    description: "This document is no longer available or you do not have permission to view it."
  });
  assert.deepEqual(missingModel, hiddenModel);
  assert.doesNotMatch(JSON.stringify({ hiddenModel, missingModel }), /Hidden Relic|Secret rules|snippet|count/i);
});

test("item detail description keeps content links but strips roll actions", async () => {
  const item = createItem({
    uuid: "Item.wand",
    name: "Wand",
    type: "equipment",
    system: {
      description: { value: "<p>One creature attempts [[/save ability=wis dc=13 format=long]].</p>" }
    }
  });

  const model = await buildItemDetailViewModel("Item.wand", {}, {
    user,
    fromUuid: async uuid => (uuid === item.uuid ? item : null),
    enrichHTML: async content => content
      .replace("[[/save ability=wis dc=13 format=long]]", "<button class=\"inline-roll\">WIS Save</button>")
      .replace("One creature", "<a class=\"content-link\" data-uuid=\"Compendium.dnd5e.rules.Item.creature\">One creature</a>")
  });

  assert.equal(model.available, true);
  assert.match(model.descriptionHtml, /WIS Save/);
  assert.doesNotMatch(model.descriptionHtml, /<button\b/i);
  assert.match(model.descriptionHtml, /data-uuid="Compendium\.dnd5e\.rules\.Item\.creature"/);
});

