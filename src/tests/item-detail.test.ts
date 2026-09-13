import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildItemDetailViewModel, type ItemDetailDocumentLike } from "../services/item-detail.ts";
import type { CharacterSheetItemDetailCapability } from "../systems/character-sheet-adapter.ts";

const user = { id: "player" };

/** Creates an opaque item presenter for shared service tests. */
function createPresentation(options: {
  description?: string;
  typeLabel?: string;
  source?: string | null;
  chips?: Array<{ id: string; label: string; value: string }>;
  fields?: Array<{ label: string; value: string }>;
} = {}): CharacterSheetItemDetailCapability {
  return {
    buildPresentation: () => ({
      description: options.description ?? "",
      typeLabel: options.typeLabel ?? "Artifact",
      source: options.source ?? null,
      chips: options.chips ?? [],
      fields: options.fields ?? []
    })
  };
}

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

test("world item detail enriches an opaque adapter presentation after permission checks", async () => {
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

  const model = await buildItemDetailViewModel("Item.arcane-focus", {
    presentation: createPresentation({
      description: "<p>A visible artifact.</p>",
      typeLabel: "Signal Relic",
      chips: [{ id: "origin", label: "Origin", value: "Outer Rim" }],
      fields: [{ label: "Resonance", value: "7" }]
    })
  }, {
    user,
    fromUuid: async uuid => (uuid === item.uuid ? item : null),
    enrichHTML: async html => `<article>${html}</article>`
  });

  assert.equal(model.available, true);
  assert.equal(model.name, "Arcane Focus: Iron Rod");
  assert.equal(model.typeLabel, "Signal Relic");
  assert.equal(model.icon, "icons/focus.webp");
  assert.equal(model.descriptionHtml, "<article><p>A visible artifact.</p></article>");
  assert.deepEqual(model.chips, [{ id: "origin", label: "Origin", value: "Outer Rim" }]);
  assert.deepEqual(model.fields, [{ label: "Resonance", value: "7" }]);
  assert.doesNotMatch(JSON.stringify(model), /create|delete|edit|import|Open Sheet/i);
});

test("item detail forwards a route source to the adapter presenter", async () => {
  const bane = createItem({
    uuid: "Compendium.fixtureSystem.spells.Item.bane",
    name: "Bane",
    type: "spell",
    img: "icons/bane.webp",
    pack: "fixtureSystem.spells",
    system: {
      level: 1,
      school: "enc",
      activation: { value: 1, units: "action" },
      range: { value: 30, units: "ft" },
      duration: { value: 1, units: "minute" },
      description: { value: "<p>Visible spell rules.</p>" }
    }
  });

  let receivedSource: string | undefined;
  const presentation: CharacterSheetItemDetailCapability = {
    buildPresentation: ({ source }) => {
      receivedSource = source;
      return {
        description: "<p>Visible rules.</p>",
        typeLabel: "Protocol",
        source: source ?? null,
        chips: source ? [{ id: "archive", label: "Archive", value: source }] : [],
        fields: [{ label: "Tier", value: "1" }]
      };
    }
  };
  const model = await buildItemDetailViewModel("Compendium.fixtureSystem.spells.Item.bane", { source: "Spells (SRD)", presentation }, {
    user,
    fromUuid: async uuid => (uuid === bane.uuid ? bane : null),
    enrichHTML: async html => html
  });

  assert.equal(model.available, true);
  assert.equal(model.name, "Bane");
  assert.equal(receivedSource, "Spells (SRD)");
  assert.equal(model.typeLabel, "Protocol");
  assert.equal(model.source, "Spells (SRD)");
  assert.deepEqual(model.chips, [
    { id: "archive", label: "Archive", value: "Spells (SRD)" }
  ]);
  assert.deepEqual(model.fields, [
    { label: "Tier", value: "1" }
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

  const model = await buildItemDetailViewModel("Item.wand", {
    presentation: createPresentation({
      description: "<p>One creature attempts [[/save ability=wis dc=13 format=long]].</p>"
    })
  }, {
    user,
    fromUuid: async uuid => (uuid === item.uuid ? item : null),
    enrichHTML: async content => content
      .replace("[[/save ability=wis dc=13 format=long]]", "<button class=\"inline-roll\">WIS Save</button>")
      .replace("One creature", "<a class=\"content-link\" data-uuid=\"Compendium.fixtureSystem.rules.Item.creature\">One creature</a>")
  });

  assert.equal(model.available, true);
  assert.match(model.descriptionHtml, /WIS Save/);
  assert.doesNotMatch(model.descriptionHtml, /<button\b/i);
  assert.match(model.descriptionHtml, /data-uuid="Compendium\.fixtureSystem\.rules\.Item\.creature"/);
});

test("item detail marks enriched content as a generic document-link reader", () => {
  const template = readFileSync(new URL("../templates/item-detail.hbs", import.meta.url), "utf8");
  assert.match(template, /item-detail-description[^>]*data-document-links/);
});

