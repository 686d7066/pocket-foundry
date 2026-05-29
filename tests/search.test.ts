import assert from "node:assert/strict";
import { test } from "vitest";
import { RouteView, type MobileRoute } from "../src/router/routes.ts";
import {
  ALL_SEARCH_RESULT_TYPES,
  createActorSearchAdapter,
  createCompendiumSearchAdapter,
  createItemSearchAdapter,
  createJournalEntrySearchAdapter,
  createJournalPageSearchAdapter,
  createMobileSearchService,
  createOwnedItemSearchAdapter,
  createRouteForSearchResult,
  type CompendiumSearchCustomization,
  type SearchableCollection,
  type SearchableDocumentLike
} from "../src/services/search.ts";

const user = { id: "player" };
const dnd5eCompendiumSearchCustomization: CompendiumSearchCustomization = {
  resultTypes: ["Spell"],
  resolveResultType: context => (context.documentName === "Item" && context.entryType === "spell" ? "Spell" : null)
};

type FixtureDocument = SearchableDocumentLike & {
  uuid: string;
  name: string;
  documentName: string;
  visible?: boolean;
  text?: { content?: string };
};

function createDocument(options: {
  uuid: string;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  visible?: boolean;
  parent?: FixtureDocument | null;
  items?: FixtureDocument[];
  pages?: FixtureDocument[];
  text?: { content?: string };
}): FixtureDocument {
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: options.documentName,
    type: options.type,
    img: options.img,
    visible: options.visible ?? true,
    parent: options.parent ?? null,
    items: options.items,
    pages: options.pages,
    text: options.text,
    testUserPermission: (_user, level) => level === "OBSERVER" && (options.visible ?? true),
    canUserModify: () => false,
    getUserLevel: () => (options.visible === false ? 0 : 2)
  };
}

function createFixtureCollections(): {
  actors: FixtureDocument[];
  worldItems: FixtureDocument[];
  journals: FixtureDocument[];
} {
  const armorSpell = createDocument({
    uuid: "Actor.arlen.Item.armor",
    name: "Armor of Agathys",
    documentName: "Item",
    type: "spell",
    img: "icons/armor.webp"
  });
  const arlen = createDocument({
    uuid: "Actor.arlen",
    name: "Arlen Mire",
    documentName: "Actor",
    type: "character",
    img: "icons/arlen.webp",
    items: [armorSpell]
  });
  const hiddenNpc = createDocument({
    uuid: "Actor.hidden",
    name: "Hidden NPC",
    documentName: "Actor",
    type: "npc",
    visible: false,
    items: [
      createDocument({
        uuid: "Actor.hidden.Item.secret",
        name: "Hidden Dagger",
        documentName: "Item"
      })
    ]
  });
  const arcaneFocus = createDocument({
    uuid: "Item.arcane-focus",
    name: "Arcane Focus: Iron Rod",
    documentName: "Item",
    type: "equipment",
    img: "icons/focus.webp"
  });
  const hiddenItem = createDocument({
    uuid: "Item.hidden",
    name: "Hidden Relic",
    documentName: "Item",
    visible: false
  });
  const glassGate = createDocument({
    uuid: "JournalEntry.glass-gate",
    name: "The Glass Gate",
    documentName: "JournalEntry"
  });
  const npcNotes = createDocument({
    uuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes",
    name: "NPC Notes",
    documentName: "JournalEntryPage",
    parent: glassGate,
    text: { content: "Visible notes about an iron rod and gate contacts." }
  });
  const hiddenPage = createDocument({
    uuid: "JournalEntry.glass-gate.JournalEntryPage.hidden",
    name: "Hidden Page",
    documentName: "JournalEntryPage",
    parent: glassGate,
    visible: false,
    text: { content: "Hidden NPC secrets." }
  });
  glassGate.pages = [npcNotes, hiddenPage];

  return {
    actors: [arlen, hiddenNpc],
    worldItems: [arcaneFocus, hiddenItem],
    journals: [glassGate]
  };
}

function createFixtureSearchService() {
  const fixtures = createFixtureCollections();
  return createMobileSearchService({
    adapters: [
      createActorSearchAdapter({ collection: fixtures.actors, user }),
      createItemSearchAdapter({ collection: fixtures.worldItems, user }),
      createOwnedItemSearchAdapter({ collection: fixtures.actors, user }),
      createJournalEntrySearchAdapter({ collection: fixtures.journals, user }),
      createJournalPageSearchAdapter({ collection: fixtures.journals, user })
    ]
  });
}

test("queries shorter than minimum length return no full search results", async () => {
  const service = createFixtureSearchService();

  assert.deepEqual(await service.search({ query: "", typeFilter: ALL_SEARCH_RESULT_TYPES }), []);
  assert.deepEqual(await service.search({ query: " \n \t " }), []);
});

test("All includes every matching visible result from registered adapters", async () => {
  const service = createFixtureSearchService();

  const results = await service.search({ query: "ar", typeFilter: ALL_SEARCH_RESULT_TYPES });

  assert.deepEqual(
    results.map(result => `${result.type}:${result.name}`),
    ["Character:Arlen Mire", "Item:Arcane Focus: Iron Rod", "Item:Armor of Agathys"]
  );
});

test("type filters narrow result sets without changing adapter registration", async () => {
  const service = createFixtureSearchService();

  assert.deepEqual(service.getResultTypes(), ["Character", "Item", "Journal Entry", "Journal Page"]);

  const results = await service.search({ query: "ar", typeFilter: "Character" });

  assert.deepEqual(
    results.map(result => `${result.type}:${result.name}`),
    ["Character:Arlen Mire"]
  );
  assert.deepEqual(service.getResultTypes(), ["Character", "Item", "Journal Entry", "Journal Page"]);
});

test("adapter errors do not prevent other adapters from returning results", async () => {
  const service = createMobileSearchService({
    adapters: [
      {
        type: "Broken",
        search: () => {
          throw new Error("Broken fixture adapter");
        }
      },
      createActorSearchAdapter({ collection: createFixtureCollections().actors, user })
    ]
  });

  const response = await service.searchWithDiagnostics({ query: "ar" });

  assert.deepEqual(
    response.results.map(result => result.name),
    ["Arlen Mire"]
  );
  assert.deepEqual(response.errors, [{ adapterType: "Broken", message: "Broken fixture adapter" }]);
});

test("duplicate UUIDs are returned only once", async () => {
  const arlen = createDocument({
    uuid: "Actor.arlen",
    name: "Arlen Mire",
    documentName: "Actor"
  });
  const service = createMobileSearchService({
    adapters: [
      createActorSearchAdapter({ collection: [arlen], user }),
      {
        type: "Character",
        search: () => [
          {
            uuid: "Actor.arlen",
            type: "Character",
            name: "Arlen Mire Duplicate"
          }
        ]
      }
    ]
  });

  const results = await service.search({ query: "arlen" });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.name, "Arlen Mire");
});

test("hidden fixtures never appear in result names, snippets, counts, history, or unavailable states", async () => {
  const service = createFixtureSearchService();

  const actorResults = await service.search({ query: "hidden" });
  const pageResults = await service.search({ query: "secrets" });
  const serialized = JSON.stringify({ actorResults, pageResults });

  assert.deepEqual(actorResults, []);
  assert.deepEqual(pageResults, []);
  assert.doesNotMatch(serialized, /Hidden NPC|Hidden Page|secrets|count|history|unavailable/i);
});

test("fixture adapters return expected visible document types and parent context", async () => {
  const service = createFixtureSearchService();

  const spellResults = await service.search({ query: "armor" });
  const itemResults = await service.search({ query: "arcane" });
  const journalResults = await service.search({ query: "glass" });
  const pageResults = await service.search({ query: "npc" });

  assert.deepEqual(spellResults.map(result => pickResult(result)), [
    {
      uuid: "Actor.arlen.Item.armor",
      type: "Item",
      name: "Armor of Agathys",
      source: "Owned by Arlen Mire",
      parentUuid: "Actor.arlen",
      parentName: "Arlen Mire"
    }
  ]);
  assert.deepEqual(itemResults.map(result => pickResult(result)), [
    {
      uuid: "Item.arcane-focus",
      type: "Item",
      name: "Arcane Focus: Iron Rod",
      source: "equipment",
      parentUuid: undefined,
      parentName: undefined
    }
  ]);
  assert.deepEqual(journalResults.map(result => pickResult(result)), [
    {
      uuid: "JournalEntry.glass-gate",
      type: "Journal Entry",
      name: "The Glass Gate",
      source: undefined,
      parentUuid: undefined,
      parentName: undefined
    }
  ]);
  assert.deepEqual(pageResults.map(result => pickResult(result)), [
    {
      uuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes",
      type: "Journal Page",
      name: "NPC Notes",
      source: "The Glass Gate",
      parentUuid: "JournalEntry.glass-gate",
      parentName: "The Glass Gate"
    }
  ]);
});

test("selecting each result creates the expected route object", async () => {
  const service = createFixtureSearchService();

  const routesByName = new Map<string, MobileRoute>();
  for (const query of ["arlen", "armor", "arcane", "glass", "npc"]) {
    for (const result of await service.search({ query })) {
      routesByName.set(result.name, createRouteForSearchResult(result));
    }
  }

  assert.deepEqual(routesByName.get("Arlen Mire"), { view: RouteView.Character, actorUuid: "Actor.arlen" });
  assert.deepEqual(routesByName.get("Armor of Agathys"), {
    view: RouteView.OwnedDocument,
    actorUuid: "Actor.arlen",
    documentUuid: "Actor.arlen.Item.armor",
    parentPane: ""
  });
  assert.deepEqual(routesByName.get("Arcane Focus: Iron Rod"), {
    view: RouteView.DocumentDetail,
    documentUuid: "Item.arcane-focus",
    documentType: "item"
  });
  assert.deepEqual(routesByName.get("The Glass Gate"), { view: RouteView.Journal, entryUuid: "JournalEntry.glass-gate" });
  assert.deepEqual(routesByName.get("NPC Notes"), {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes"
  });
});

test("collection search is preferred before fallback filtering", async () => {
  let calledWith: unknown;
  const collection: SearchableCollection = {
    contents: [],
    search: search => {
      calledWith = search;
      return [
        createDocument({
          uuid: "Item.arcane-focus",
          name: "Arcane Focus: Iron Rod",
          documentName: "Item"
        })
      ];
    }
  };
  const service = createMobileSearchService({
    adapters: [createItemSearchAdapter({ collection, user })]
  });

  const results = await service.search({ query: "arcane" });

  assert.deepEqual(calledWith, { query: "arcane" });
  assert.deepEqual(
    results.map(result => result.name),
    ["Arcane Focus: Iron Rod"]
  );
});

test("owned item and journal page adapters inspect visible parents even when parent collections expose search", async () => {
  const fixtures = createFixtureCollections();
  let actorSearchCalls = 0;
  let journalSearchCalls = 0;
  const actorCollection: SearchableCollection = {
    contents: fixtures.actors,
    search: () => {
      actorSearchCalls += 1;
      return [];
    }
  };
  const journalCollection: SearchableCollection = {
    contents: fixtures.journals,
    search: () => {
      journalSearchCalls += 1;
      return [];
    }
  };
  const service = createMobileSearchService({
    adapters: [
      createOwnedItemSearchAdapter({ collection: actorCollection, user }),
      createJournalPageSearchAdapter({ collection: journalCollection, user })
    ]
  });

  const ownedItemResults = await service.search({ query: "armor" });
  const pageResults = await service.search({ query: "npc" });

  assert.deepEqual(
    ownedItemResults.map(result => result.name),
    ["Armor of Agathys"]
  );
  assert.deepEqual(
    pageResults.map(result => result.name),
    ["NPC Notes"]
  );
  assert.equal(actorSearchCalls, 0);
  assert.equal(journalSearchCalls, 0);
});

test("compendium adapter keeps item subtypes generic without system customization", async () => {
  const service = createMobileSearchService({
    adapters: [
      createCompendiumSearchAdapter({
        packs: [
          {
            collection: "example.spells",
            documentName: "Item",
            metadata: { label: "Spells" },
            getIndex: async () => [{ _id: "bane", name: "Bane", type: "spell" }]
          }
        ]
      })
    ]
  });

  const results = await service.search({ query: "bane" });

  assert.deepEqual(service.getResultTypes(), ["Character", "Item", "Journal Entry"]);
  assert.deepEqual(results.map(result => `${result.type}:${result.name}:${result.documentType}`), ["Item:Bane:item"]);
});

test("compendium adapter accepts system-owned result types for pack context", async () => {
  const service = createMobileSearchService({
    adapters: [
      createCompendiumSearchAdapter({
        ...dnd5eCompendiumSearchCustomization,
        packs: [
          {
            collection: "dnd5e.spells",
            documentName: "Item",
            metadata: { label: "Spells (SRD)" },
            getIndex: async () => [
              { _id: "bane-one", name: "Bane", type: "spell", img: "icons/bane-one.webp" },
              { _id: "bane-two", name: "Bane", type: "spell", img: "icons/bane-two.webp" },
              { _id: "bane-three", name: "Bane", type: "spell" },
              { _id: "bane-four", name: "Bane", type: "spell" },
              { _id: "elemental-bane", name: "Elemental Bane", type: "spell" },
              { _id: "bless", name: "Bless", type: "spell" }
            ]
          }
        ]
      })
    ]
  });

  const results = await service.search({ query: "bane" });
  const spellResults = await service.search({ query: "bane", typeFilter: "Spell" });

  assert.deepEqual(service.getResultTypes(), ["Character", "Item", "Journal Entry", "Spell"]);
  assert.equal(results.length, 5);
  assert.deepEqual(results.map(result => `${result.type}:${result.name}:${result.source}`), [
    "Spell:Bane:Spells (SRD)",
    "Spell:Bane:Spells (SRD)",
    "Spell:Bane:Spells (SRD)",
    "Spell:Bane:Spells (SRD)",
    "Spell:Elemental Bane:Spells (SRD)"
  ]);
  assert.deepEqual(spellResults, results);
  assert.deepEqual(createRouteForSearchResult(results[0]!), {
    view: RouteView.DocumentDetail,
    documentUuid: "Compendium.dnd5e.spells.Item.bane-one",
    documentType: "item",
    source: "Spells (SRD)"
  });
});

test("Back restores exact search route state after selecting a result", async () => {
  const { createMobileRouter } = await import("../src/router/mobile-router.ts");
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Details" }
  });

  await router.openSearch({ query: "npc", typeFilter: "Journal Page", focusedResultId: "JournalEntry.glass-gate.JournalEntryPage.npc-notes", scrollTop: 64 });
  await router.selectSearchRoute({
    view: RouteView.Journal,
    entryUuid: "JournalEntry.glass-gate",
    pageUuid: "JournalEntry.glass-gate.JournalEntryPage.npc-notes"
  });

  assert.deepEqual(await router.back(), {
    view: RouteView.Search,
    query: "npc",
    typeFilter: "Journal Page",
    focusedResultId: "JournalEntry.glass-gate.JournalEntryPage.npc-notes",
    scrollTop: 64
  });
});

function pickResult(result: {
  uuid: string;
  type: string;
  name: string;
  source?: string | null;
  parentUuid?: string | null;
  parentName?: string | null;
}) {
  return {
    uuid: result.uuid,
    type: result.type,
    name: result.name,
    source: result.source ?? undefined,
    parentUuid: result.parentUuid ?? undefined,
    parentName: result.parentName ?? undefined
  };
}

