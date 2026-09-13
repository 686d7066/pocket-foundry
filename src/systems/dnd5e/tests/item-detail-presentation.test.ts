import assert from "node:assert/strict";
import { test } from "vitest";
import type { CharacterSheetItemDetailDocument } from "../../character-sheet-adapter.ts";
import { buildDnd5eItemDetailPresentation } from "../item-detail-presentation.ts";

/** Creates a visible dnd5e item document for presentation tests. */
function createItem(options: {
  uuid: string;
  name: string;
  type: string;
  pack?: string;
  system: Record<string, unknown>;
}): CharacterSheetItemDetailDocument {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: "Item",
    type: options.type,
    pack: options.pack,
    system: options.system,
    testUserPermission: () => true,
    getUserLevel: () => 2
  };
}

test("dnd5e item presentation preserves equipment description, metadata, and facts", () => {
  const item = createItem({
    uuid: "Item.arcane-focus",
    name: "Arcane Focus",
    type: "equipment",
    system: {
      description: { value: "<p>A visible spellcasting focus.</p>" },
      quantity: 1,
      weight: 1,
      price: { value: 10, denomination: "gp" }
    }
  });

  const presentation = buildDnd5eItemDetailPresentation({ document: item });

  assert.equal(presentation.description, "<p>A visible spellcasting focus.</p>");
  assert.equal(presentation.typeLabel, "Equipment");
  assert.deepEqual(presentation.chips, [{ id: "type", label: "Type", value: "Equipment" }]);
  assert.deepEqual(presentation.fields, [
    { label: "Quantity", value: "1" },
    { label: "Weight", value: "1" },
    { label: "Price", value: "10 gp" }
  ]);
});

test("dnd5e item presentation preserves spell and compendium source fields", () => {
  const spell = createItem({
    uuid: "Compendium.dnd5e.spells.Item.bane",
    name: "Bane",
    type: "spell",
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

  const presentation = buildDnd5eItemDetailPresentation({ document: spell, source: "Spells (SRD)" });

  assert.equal(presentation.source, "Spells (SRD)");
  assert.deepEqual(presentation.chips, [
    { id: "type", label: "Type", value: "Spell" },
    { id: "source", label: "Pack", value: "Spells (SRD)" }
  ]);
  assert.deepEqual(presentation.fields, [
    { label: "Level", value: "1" },
    { label: "School", value: "enc" },
    { label: "Activation", value: "1 action" },
    { label: "Range", value: "30 ft" },
    { label: "Duration", value: "1 minute" }
  ]);
});
