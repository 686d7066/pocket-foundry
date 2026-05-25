import assert from "node:assert/strict";
import { test } from "vitest";
import { afterEach } from "vitest";
import {
  createDocumentLookupService,
  createUnavailableDocumentState,
  getDocumentDisplayType,
  getMobileDocumentType,
  type FoundryDocumentLike
} from "../src/services/document-lookup.ts";
import { canUpdateDocument, canViewDocument, canViewJournalPage } from "../src/services/permissions.ts";

type FixtureDocument = Omit<FoundryDocumentLike, "uuid" | "name" | "documentName"> & {
  uuid: string;
  name: string;
  documentName: string;
  visible?: boolean;
  updateable?: boolean;
  userLevel?: number;
};

const user = { id: "player" };

afterEach(() => {
  Reflect.deleteProperty(globalThis, "foundry");
});

function createFixtureDocument(options: {
  uuid: string;
  id?: string;
  name: string;
  documentName: string;
  type?: string;
  img?: string | null;
  parent?: FixtureDocument | null;
  visible?: boolean;
  updateable?: boolean;
  userLevel?: number;
}): FixtureDocument {
  return {
    id: options.id ?? options.uuid.split(".").at(-1),
    uuid: options.uuid,
    name: options.name,
    documentName: options.documentName,
    type: options.type,
    img: options.img,
    parent: options.parent ?? null,
    visible: options.visible ?? true,
    updateable: options.updateable ?? false,
    userLevel: options.userLevel ?? (options.visible === false ? 0 : 2),
    testUserPermission: (_user, level) => {
      if (level !== "OBSERVER") return false;
      return options.visible ?? true;
    },
    canUserModify: (_user, action) => {
      if (action !== "update") return false;
      return options.updateable ?? false;
    },
    getUserLevel: () => options.userLevel ?? (options.visible === false ? 0 : 2)
  };
}

test("document lookup returns normalized visible documents without exposing raw Foundry documents", async () => {
  const actor = createFixtureDocument({
    uuid: "Actor.visible",
    name: "Arlen Mire",
    documentName: "Actor",
    type: "character",
    img: "icons/arlen.webp",
    updateable: true,
    userLevel: 3
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async uuid => (uuid === actor.uuid ? actor : null)
  });

  const result = await service.lookupByUuid("Actor.visible");

  assert.deepEqual(result, {
    available: true,
    uuid: "Actor.visible",
    id: "visible",
    name: "Arlen Mire",
    documentType: "character",
    displayType: "Character",
    foundryDocumentName: "Actor",
    foundryType: "character",
    icon: "icons/arlen.webp",
    parent: null,
    permissions: {
      canView: true,
      canUpdate: true,
      userLevel: 3
    }
  });
  assert.equal("testUserPermission" in result, false);
  assert.equal("canUserModify" in result, false);
});

test("document lookup returns non-leaking hidden and missing states", async () => {
  const hidden = createFixtureDocument({
    uuid: "JournalEntry.hidden",
    name: "Hidden Plans",
    documentName: "JournalEntry",
    visible: false,
    updateable: false,
    userLevel: 0
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async uuid => (uuid === hidden.uuid ? hidden : null)
  });

  const hiddenResult = await service.lookupByUuid("JournalEntry.hidden");
  const missingResult = await service.lookupByUuid("JournalEntry.missing");
  const hiddenJson = JSON.stringify(hiddenResult);
  const missingJson = JSON.stringify(missingResult);

  assert.deepEqual(hiddenResult, {
    available: false,
    uuid: "JournalEntry.hidden",
    reason: "hidden",
    documentType: "unknown",
    displayType: "Document",
    permissions: {
      canView: false,
      canUpdate: false,
      userLevel: null
    }
  });
  assert.deepEqual(missingResult, {
    available: false,
    uuid: "JournalEntry.missing",
    reason: "missing",
    documentType: "unknown",
    displayType: "Document",
    permissions: {
      canView: false,
      canUpdate: false,
      userLevel: null
    }
  });
  assert.doesNotMatch(hiddenJson, /Hidden Plans|page|count|snippet|label/i);
  assert.doesNotMatch(missingJson, /Hidden Plans|page|count|snippet|label/i);
});

test("unavailable state does not expose names, snippets, page counts, or history labels", async () => {
  const hidden = createFixtureDocument({
    uuid: "JournalEntryPage.secret",
    name: "GM Secrets",
    documentName: "JournalEntryPage",
    visible: false
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async uuid => (uuid === hidden.uuid ? hidden : null)
  });

  const result = await service.lookupByUuid("JournalEntryPage.secret");
  assert.equal(result.available, false);

  const state = createUnavailableDocumentState(result);
  const stateJson = JSON.stringify(state);

  assert.deepEqual(state, {
    available: false,
    uuid: "JournalEntryPage.secret",
    reason: "hidden",
    title: "Unavailable document",
    description: "This document is no longer available or you do not have permission to view it."
  });
  assert.doesNotMatch(stateJson, /GM Secrets|snippet|pageCount|historyLabel/i);
});

test("update permission checks are separate from view permission checks", () => {
  const visibleReadOnly = createFixtureDocument({
    uuid: "Item.readonly",
    name: "Arcane Focus",
    documentName: "Item",
    visible: true,
    updateable: false,
    userLevel: 2
  });
  const hiddenOwnerLevel = createFixtureDocument({
    uuid: "Item.hidden",
    name: "Hidden Item",
    documentName: "Item",
    visible: false,
    updateable: true,
    userLevel: 3
  });

  assert.equal(canViewDocument(visibleReadOnly, user), true);
  assert.equal(canUpdateDocument(visibleReadOnly, user), false);
  assert.equal(canViewDocument(hiddenOwnerLevel, user), false);
  assert.equal(canUpdateDocument(hiddenOwnerLevel, user), true);
});

test("journal page view permission requires both parent entry and page visibility", async () => {
  const hiddenEntry = createFixtureDocument({
    uuid: "JournalEntry.hidden",
    name: "Hidden Entry",
    documentName: "JournalEntry",
    visible: false
  });
  const visiblePage = createFixtureDocument({
    uuid: "JournalEntry.hidden.JournalEntryPage.visible",
    name: "Visible Page Under Hidden Entry",
    documentName: "JournalEntryPage",
    parent: hiddenEntry,
    visible: true
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async uuid => (uuid === visiblePage.uuid ? visiblePage : null)
  });

  assert.equal(canViewJournalPage(visiblePage, user), false);

  const result = await service.lookupByUuid(visiblePage.uuid);
  assert.equal(result.available, false);
  assert.equal(result.reason, "hidden");
  assert.doesNotMatch(JSON.stringify(result), /Visible Page Under Hidden Entry|Hidden Entry/);
});

test("visible journal page lookup includes only visible parent context", async () => {
  const entry = createFixtureDocument({
    uuid: "JournalEntry.visible",
    name: "The Glass Gate",
    documentName: "JournalEntry",
    visible: true
  });
  const page = createFixtureDocument({
    uuid: "JournalEntry.visible.JournalEntryPage.notes",
    name: "NPC Notes",
    documentName: "JournalEntryPage",
    type: "text",
    parent: entry,
    visible: true,
    updateable: false
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async uuid => (uuid === page.uuid ? page : null)
  });

  const result = await service.lookupByUuid(page.uuid);

  assert.equal(result.available, true);
  assert.equal(result.documentType, "journal-page");
  assert.equal(result.name, "NPC Notes");
  assert.deepEqual(result.parent, {
    uuid: "JournalEntry.visible",
    id: "visible",
    name: "The Glass Gate",
    documentType: "journal-entry",
    displayType: "Journal Entry"
  });
});

test("sync lookup supports router permission adapters without async Foundry access", () => {
  const item = createFixtureDocument({
    uuid: "Item.visible",
    name: "Arcane Focus: Iron Rod",
    documentName: "Item",
    visible: true,
    updateable: false
  });
  const service = createDocumentLookupService({
    user,
    fromUuid: async () => null,
    fromUuidSync: uuid => (uuid === item.uuid ? item : null)
  });

  const result = service.lookupByUuidSync("Item.visible");

  assert.equal(result.available, true);
  assert.equal(result.documentType, "item");
  assert.equal(result.permissions.canView, true);
  assert.equal(result.permissions.canUpdate, false);
});

test("document type normalization uses Foundry document names and UUID fallback", () => {
  assert.equal(getMobileDocumentType({ documentName: "Actor", uuid: "Actor.abc" }), "character");
  assert.equal(getMobileDocumentType({ documentName: "Item", uuid: "Item.abc" }), "item");
  assert.equal(getMobileDocumentType({ documentName: "JournalEntry", uuid: "JournalEntry.abc" }), "journal-entry");
  assert.equal(getMobileDocumentType({ documentName: "JournalEntryPage", uuid: "JournalEntry.abc.JournalEntryPage.def" }), "journal-page");
  assert.equal(getMobileDocumentType({ uuid: "JournalEntry.abc.JournalEntryPage.def" }), "journal-page");
  assert.equal(getMobileDocumentType({ uuid: "Actor.abc" }), "character");
  assert.equal(getDocumentDisplayType("character"), "Character");
  assert.equal(getDocumentDisplayType("journal-page"), "Journal Page");
});

test("document type UUID fallback uses Foundry parseUuid when available", () => {
  Object.defineProperty(globalThis, "foundry", {
    configurable: true,
    value: {
      utils: {
        parseUuid: () => ({ uuid: "Compendium.world.lore.JournalEntryPage.page", type: "JournalEntryPage" })
      }
    }
  });

  assert.equal(getMobileDocumentType({ uuid: "Compendium.world.lore.JournalEntryPage.page" }), "journal-page");
});

test("compendium index entries are viewable when Foundry resolves their UUID", () => {
  const service = createDocumentLookupService({
    user,
    fromUuid: async () => null,
    fromUuidSync: uuid =>
      uuid === "Compendium.dnd5e.spells.Item.bane"
        ? {
            uuid,
            _id: "bane",
            name: "Bane"
          }
        : null
  });

  const result = service.lookupByUuidSync("Compendium.dnd5e.spells.Item.bane");

  assert.equal(result.available, true);
  assert.equal(result.documentType, "item");
  assert.equal(result.name, "Bane");
  assert.deepEqual(result.permissions, {
    canView: true,
    canUpdate: false,
    userLevel: null
  });
});

