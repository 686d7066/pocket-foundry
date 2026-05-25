import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { RouteView, type MobileRoute } from "../src/router/routes.ts";
import { createRecentRoutesStorageKey, createMobileRecentsService, getRecentRouteId } from "../src/services/recents.ts";
import type { FoundryDocumentLike } from "../src/services/document-lookup.ts";

const user = { id: "player" };

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("recent actor pane route restores the exact actor UUID and pane", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "Actor.arlen", name: "Arlen Mire", documentName: "Actor", img: "icons/arlen.webp" })
  ]);
  const route: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Spells", scrollTop: 88 };

  service.recordRoute(route, Date.UTC(2026, 4, 21, 10, 30));

  const rows = await service.listRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "Arlen Mire");
  assert.equal(rows[0]?.subtitle, "Character");
  assert.doesNotMatch(`${rows[0]?.title} ${rows[0]?.subtitle}`, /\bActors?\b/);
  assert.deepEqual(await service.getRouteById(getRecentRouteId(route)), route);
});

test("character recents dedupe by character instead of pane", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "Actor.mira", name: "Mira Valen", documentName: "Actor", img: "icons/mira.webp" })
  ]);
  const detailsRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.mira", pane: "Details", scrollTop: 10 };
  const inventoryRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.mira", pane: "Inventory", scrollTop: 20 };
  const featuresRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.mira", pane: "Features", scrollTop: 30 };

  service.recordRoute(detailsRoute, 1);
  service.recordRoute(inventoryRoute, 2);
  service.recordRoute(featuresRoute, 3);

  const rows = await service.listRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "Mira Valen");
  assert.equal(rows[0]?.subtitle, "Character");
  assert.deepEqual(await service.getRouteById(getRecentRouteId(detailsRoute)), featuresRoute);
  assert.deepEqual(await service.getRouteById(getRecentRouteId(inventoryRoute)), featuresRoute);
  assert.deepEqual(await service.getRouteById(getRecentRouteId(featuresRoute)), featuresRoute);
});

test("recent journal page route restores entry UUID, page UUID, and scroll state", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "JournalEntry.gate", name: "The Glass Gate", documentName: "JournalEntry" }),
    createDocument({ uuid: "JournalEntry.gate.JournalEntryPage.overview", name: "Overview", documentName: "JournalEntryPage", parentUuid: "JournalEntry.gate" })
  ]);
  const route: MobileRoute = {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.gate",
    pageUuid: "JournalEntry.gate.JournalEntryPage.overview",
    scrollTop: 320
  };

  service.recordRoute(route, Date.UTC(2026, 4, 21, 11, 15));

  const rows = await service.listRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "Overview");
  assert.equal(rows[0]?.subtitle, "Journal Page - The Glass Gate");
  assert.equal(rows[0]?.actionLabel, "Read");
  assert.deepEqual(await service.getRouteById(getRecentRouteId(route)), route);
});

test("search routes are not recorded or rendered in Recents", async () => {
  const service = createFixtureRecentsService([]);
  const route: MobileRoute = { view: RouteView.Search, query: "bane", typeFilter: "Spell", focusedResultId: "spell-bane", scrollTop: 12 };

  service.recordRoute(route, Date.UTC(2026, 4, 21, 12, 45));

  const rows = await service.listRows();
  assert.equal(rows.length, 0);
  assert.equal(await service.getRouteById(getRecentRouteId(route)), null);
});

test("recents can be cleared from local client storage", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "Item.bane", name: "Bane", documentName: "Item" })
  ]);
  const route: MobileRoute = { view: RouteView.DocumentDetail, documentUuid: "Item.bane", documentType: "item" };

  service.recordRoute(route, Date.UTC(2026, 4, 21, 12, 45));
  assert.equal((await service.listRows()).length, 1);

  service.clearRoutes();

  assert.equal((await service.listRows()).length, 0);
  assert.equal(await service.getRouteById(getRecentRouteId(route)), null);
});

test("item-like recents use recents row style class", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "Actor.rider", name: "Rider", documentName: "Actor" }),
    createDocument({ uuid: "Item.bane", name: "Bane", documentName: "Item" })
  ]);

  service.recordRoute(
    {
      view: RouteView.OwnedDocument,
      actorUuid: "Actor.rider",
      documentUuid: "Item.bane",
      parentPane: "Inventory"
    },
    Date.UTC(2026, 4, 21, 12, 45)
  );

  const rows = await service.listRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "item");
  assert.equal(rows[0]?.rowClass, "recent-item-row");
});

test("deleted or inaccessible recent route targets do not render", async () => {
  const service = createFixtureRecentsService([
    createDocument({ uuid: "Actor.visible", name: "Visible Hero", documentName: "Actor" }),
    createDocument({ uuid: "Actor.hidden", name: "Hidden Hero", documentName: "Actor", visible: false }),
    createDocument({ uuid: "JournalEntry.gate", name: "The Glass Gate", documentName: "JournalEntry" }),
    createDocument({ uuid: "JournalEntry.gate.JournalEntryPage.hidden", name: "Secret Page", documentName: "JournalEntryPage", parentUuid: "JournalEntry.gate", visible: false })
  ]);

  service.recordRoute({ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details" }, 4);
  service.recordRoute({ view: RouteView.Character, actorUuid: "Actor.hidden", pane: "Details" }, 3);
  service.recordRoute({ view: RouteView.Character, actorUuid: "Actor.deleted", pane: "Details" }, 2);
  service.recordRoute({ view: RouteView.Journal, entryUuid: "JournalEntry.gate", pageUuid: "JournalEntry.gate.JournalEntryPage.hidden" }, 1);

  const rows = await service.listRows();
  assert.deepEqual(rows.map(row => row.title), ["Visible Hero"]);
  assert.doesNotMatch(JSON.stringify(rows), /Hidden Hero|Secret Page|deleted/i);
});

test("opening a recent entry goes through the internal mobile router", async () => {
  const router = createMobileRouter({ initialRoute: { view: RouteView.Recents } });
  const route: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Inventory", scrollTop: 10 };

  await router.push(route);

  assert.deepEqual(router.getCurrentRoute(), route);
  assert.deepEqual(router.getHistory(), [{ view: RouteView.Recents }]);
});

test("recents template preserves required regions", async () => {
  const { readFileSync } = await import("node:fs");
  const recentsTemplate = readFileSync(new URL("../src/templates/recents.hbs", import.meta.url), "utf8");
  const contentListRowTemplate = readFileSync(new URL("../src/templates/partials/content-list-row.hbs", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const shellHelperSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-shell.ts", import.meta.url), "utf8");
  const shellActionSource = readFileSync(new URL("../src/core/mobile-shell/actions-shell.ts", import.meta.url), "utf8");

  assert.match(shellTemplate, /templates\/recents\.hbs/);
  assert.match(moduleSource, /`\$\{TEMPLATE_ROOT\}\/recents\.hbs`/);
  assert.match(recentsTemplate, /class="content pf-view recents-view"/);
  assert.match(recentsTemplate, /class="section content-group pf-view-section recent-list"/);
  assert.match(recentsTemplate, /partials\/content-list-row\.hbs/);
  assert.match(contentListRowTemplate, /class="row content-list-row/);
  assert.match(contentListRowTemplate, /class="item-icon"/);
  assert.match(contentListRowTemplate, /class="row-title content-row-title"/);
  assert.match(contentListRowTemplate, /class="row-action content-list-action"/);
  assert.match(shellHelperSource, /createMobileRecentsService/);
  assert.match(shellActionSource, /target\.dataset\.action === "open-recent"/);
  assert.match(shellActionSource, /target\.dataset\.action === "clear-recents"/);
  assert.doesNotMatch(recentsTemplate, /Open Sheet|data-action="create"|data-action="delete"|data-action="edit"/);
});

function createFixtureRecentsService(documents: FoundryDocumentLike[]) {
  const values = new Map<string, string>();
  const documentMap = new Map(documents.map(document => [document.uuid, document]));

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      }
    }
  });

  return createMobileRecentsService({
    storageKey: createRecentRoutesStorageKey(["World1", "User1"]),
    lookupEnvironment: {
      user,
      fromUuid: async uuid => documentMap.get(uuid) ?? null
    }
  });
}

function createDocument(options: {
  uuid: string;
  name: string;
  documentName: "Actor" | "Item" | "JournalEntry" | "JournalEntryPage";
  img?: string | null;
  visible?: boolean;
  parentUuid?: string;
}): FoundryDocumentLike {
  const visible = options.visible ?? true;
  return {
    uuid: options.uuid,
    id: options.uuid.split(".").at(-1),
    name: options.name,
    documentName: options.documentName,
    img: options.img ?? null,
    parent: options.parentUuid ? { uuid: options.parentUuid, name: "The Glass Gate", documentName: "JournalEntry", testUserPermission: () => true } : null,
    testUserPermission: (_user, level) => level === "OBSERVER" && visible,
    getUserLevel: () => (visible ? 2 : 0)
  };
}

