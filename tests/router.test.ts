import assert from "node:assert/strict";
import { test } from "vitest";
import { navigateShellDestination } from "../src/core/shell-navigation.ts";
import {
  createPocketFoundryHistoryState,
  createPocketFoundryHistoryUrl,
  getPocketFoundryRouteFromHash,
  getBrowserHistoryWriteMode,
  isPocketFoundryHistoryState,
  RouteHashKey,
  writePocketFoundryHistoryEntry
} from "../src/router/browser-history.ts";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { resolvePermittedRoute } from "../src/router/route-permissions.ts";
import { getRouteLabel } from "../src/router/route-labels.ts";
import { RouteView, ShellDestination, type MobileRoute } from "../src/router/routes.ts";

test("push, back, and replace preserve exact route objects", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 42 }
  });

  const searchRoute = await router.push({ view: RouteView.Search, query: "fire", typeFilter: "spell", focusedResultId: "spell-1", scrollTop: 80 });
  assert.deepEqual(searchRoute, { view: RouteView.Search, query: "fire", typeFilter: "spell", focusedResultId: "spell-1", scrollTop: 80 });

  const restoredRoute = await router.back();
  assert.deepEqual(restoredRoute, { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 42 });

  const replacedRoute = await router.replace({ view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 12 });
  assert.deepEqual(replacedRoute, { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 12 });
  assert.equal(router.canGoBack(), false);
});

test("opening Search pushes the previous route", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 135 }
  });

  await router.openSearch({ query: "potion", focusedResultId: "item-2" });

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Search, query: "potion", focusedResultId: "item-2" });
  assert.deepEqual(router.getHistory(), [{ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 135 }]);
});

test("updating the current route stores transient scroll before the next push", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 20 }
  });

  router.updateCurrentRoute({ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 244 });
  await router.openSearch({ query: "wand" });

  assert.deepEqual(router.getHistory(), [{ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 244 }]);
});

test("explicit pane navigation pushes target pane at top while Back restores prior pane scroll", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 0 }
  });

  router.updateCurrentRoute({ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 500 });
  await router.push({ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 0 });

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 0 });
  assert.deepEqual(await router.back(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 500 });
});

test("selecting a route from Search preserves the search route for Back", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Biography", scrollTop: 22 }
  });

  await router.openSearch({ query: "abbey", typeFilter: "journal", focusedResultId: "journal-1", scrollTop: 301 });
  await router.selectSearchRoute({ view: RouteView.Journal, entryUuid: "Journal.abbey", pageUuid: "JournalPage.history", scrollTop: 0 });

  assert.deepEqual(await router.back(), { view: RouteView.Search, query: "abbey", typeFilter: "journal", focusedResultId: "journal-1", scrollTop: 301 });
  assert.deepEqual(await router.back(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Biography", scrollTop: 22 });
});

test("restoring a browser history route trims the internal back stack", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 10 }
  });

  await router.openSearch({ query: "torch", scrollTop: 50 });
  await router.selectSearchRoute({ view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 0 });

  const restored = await router.restore({ view: RouteView.Search, query: "torch", scrollTop: 50 });

  assert.deepEqual(restored, { view: RouteView.Search, query: "torch", scrollTop: 50 });
  assert.deepEqual(router.getHistory(), [{ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details", scrollTop: 10 }]);
});

test("bottom navigation preserves unrelated top-level area state", async () => {
  const router = createMobileRouter({ initialRoute: { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 210 } });

  await router.openShellDestination(ShellDestination.Characters);
  await router.replace({ view: RouteView.Character, actorUuid: "Actor.visible", pane: "Spells", scrollTop: 88 });
  await router.openShellDestination(ShellDestination.Journal);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 210 });
});

test("Journal bottom navigation resets to the journal list only when already inside Journal", async () => {
  const router = createMobileRouter({ initialRoute: { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.visible", scrollTop: 210 } });

  await router.openShellDestination(ShellDestination.Journal);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Journal });
  assert.deepEqual(router.getHistory(), []);
});

test("Characters bottom navigation restores the selected character when away from the character area", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 }
  });

  await router.openShellDestination(ShellDestination.Journal);
  await router.openShellDestination(ShellDestination.Characters);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 });
  assert.deepEqual(router.getHistory().at(-1), { view: RouteView.Journal });
});

test("Characters bottom navigation opens the character picker when already on a character sheet", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 }
  });

  await router.openShellDestination(ShellDestination.Characters);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Characters });
  assert.deepEqual(router.getSelectedCharacterRoute(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 });
});

test("Characters bottom navigation returns from the picker to the selected character", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 }
  });

  await router.openShellDestination(ShellDestination.Characters);
  await router.openShellDestination(ShellDestination.Characters);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 88 });
});

test("selected character route can be seeded independently of the initial shell route", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Journal },
    selectedCharacterRoute: { view: RouteView.Character, actorUuid: "Actor.persisted", pane: "Details" }
  });

  await router.openShellDestination(ShellDestination.Characters);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.persisted", pane: "Details" });
});

test("bottom navigation pushes previous top-level routes onto the internal back stack", async () => {
  const router = createMobileRouter({ initialRoute: { view: RouteView.Characters } });

  await router.openShellDestination(ShellDestination.Journal);
  await router.openShellDestination(ShellDestination.Recents);

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Recents });
  assert.deepEqual(await router.back(), { view: RouteView.Journal });
  assert.deepEqual(await router.back(), { view: RouteView.Characters });
});

test("browser history pushes entries for cross-destination route changes", () => {
  assert.equal(getBrowserHistoryWriteMode({ view: RouteView.Characters }, { view: RouteView.Journal }), "push");
  assert.equal(getBrowserHistoryWriteMode({ view: RouteView.Journal, entryUuid: "Journal.visible" }, { view: RouteView.Recents }), "push");
  assert.equal(
    getBrowserHistoryWriteMode(
      { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details" },
      { view: RouteView.Search, query: "" }
    ),
    "push"
  );
});

test("browser history pushes entries for distinct same-destination route changes", () => {
  assert.equal(getBrowserHistoryWriteMode({ view: RouteView.Characters }, { view: RouteView.Characters, selectedActorUuid: "Actor.visible" }), "push");
  assert.equal(
    getBrowserHistoryWriteMode(
      { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.one" },
      { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.two" }
    ),
    "push"
  );
});

test("browser history replaces entries only for exact same route writes", () => {
  assert.equal(
    getBrowserHistoryWriteMode(
      { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.one" },
      { view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.one" }
    ),
    "replace"
  );
});

test("browser history states carry concrete mobile routes", () => {
  const route: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 112 };
  const state = createPocketFoundryHistoryState(route, 7);

  assert.equal(isPocketFoundryHistoryState(state), true);
  assert.deepEqual(state.route, route);
  assert.equal(state.sequence, 7);
  assert.equal(isPocketFoundryHistoryState({ pocketFoundry: false, route }), false);
});

test("browser history urls include route-specific pocket-foundry hashes", () => {
  const journalUrl = createPocketFoundryHistoryUrl("http://10.5.0.2:30000/game", { view: RouteView.Journal }, 1);
  const recentsUrl = createPocketFoundryHistoryUrl("http://10.5.0.2:30000/game", { view: RouteView.Recents }, 2);
  const characterUrl = createPocketFoundryHistoryUrl(
    "http://10.5.0.2:30000/game",
    { view: RouteView.Character, actorUuid: "Actor.abc123", pane: "Inventory" },
    3
  );

  assert.notEqual(journalUrl, recentsUrl);
  assert.equal(journalUrl, `http://10.5.0.2:30000/game#${RouteHashKey.Journal}`);
  assert.equal(recentsUrl, `http://10.5.0.2:30000/game#${RouteHashKey.Recents}`);
  assert.equal(characterUrl, `http://10.5.0.2:30000/game#${RouteHashKey.Character}=Actor.abc123&pane=Inventory`);
  assert.doesNotMatch(journalUrl, /pf=/);
});

test("browser history route can restore shell fallback from hash when popstate state is unavailable", () => {
  const route = getPocketFoundryRouteFromHash(`#${RouteHashKey.Journal}`);

  assert.deepEqual(route, { view: RouteView.Journal });
});

test("browser history route hash restores bookmarkable route params", () => {
  assert.deepEqual(getPocketFoundryRouteFromHash(`#${RouteHashKey.Search}=fire`), { view: RouteView.Search, query: "fire" });
  assert.deepEqual(getPocketFoundryRouteFromHash(`#${RouteHashKey.Character}=Actor.abc123&pane=Inventory`), {
    view: RouteView.Character,
    actorUuid: "Actor.abc123",
    pane: "Inventory"
  });
  assert.deepEqual(getPocketFoundryRouteFromHash(`#${RouteHashKey.Character}=Actor.abc123&pane=${encodeURIComponent("spells")}`), {
    view: RouteView.Character,
    actorUuid: "Actor.abc123",
    pane: "spells"
  });
  assert.deepEqual(getPocketFoundryRouteFromHash(`#${RouteHashKey.Journal}=JournalEntry.xyz&page=JournalEntryPage.abc`), {
    view: RouteView.Journal,
    entryUuid: "JournalEntry.xyz",
    pageUuid: "JournalEntryPage.abc"
  });
});

test("browser history writer can still create the initial guard entry with pushState", () => {
  const calls: Array<{ method: string; state: unknown; url?: string | URL | null }> = [];
  const history = {
    pushState: (state: unknown, _unused: string, url?: string | URL | null) => calls.push({ method: "push", state, url }),
    replaceState: (state: unknown, _unused: string, url?: string | URL | null) => calls.push({ method: "replace", state, url })
  };

  writePocketFoundryHistoryEntry(history, "http://10.5.0.2:30000/game", { view: RouteView.Search, query: "" }, "push", 5);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "push");
  assert.deepEqual(calls[0]?.state, { pocketFoundry: true, route: { view: RouteView.Search, query: "" }, sequence: 5 });
  assert.equal(String(calls[0]?.url), `http://10.5.0.2:30000/game#${RouteHashKey.Search}`);
});

test("shell navigation pushes browser entries when clicking another top-level view", async () => {
  const writes: Array<{ route: MobileRoute; mode: "push" | "replace" }> = [];
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Characters },
    onRouteChange: (_, route, mode) => {
      writes.push({ route, mode });
    }
  });

  await navigateShellDestination(router, ShellDestination.Journal);
  await navigateShellDestination(router, ShellDestination.Recents);

  assert.deepEqual(writes, [
    { route: { view: RouteView.Journal }, mode: "push" },
    { route: { view: RouteView.Recents }, mode: "push" }
  ]);
});

test("back from a journal link returns to the prior character pane route", async () => {
  const router = createMobileRouter({
    initialRoute: { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Biography", scrollTop: 414 }
  });

  await router.push({
    view: RouteView.Journal,
    entryUuid: "Journal.visible",
    pageUuid: "Page.visible",
    scrollTop: 0
  });

  assert.deepEqual(await router.back(), { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Biography", scrollTop: 414 });
});

test("inaccessible route fixtures resolve to nearest permitted parent without leaking hidden names", () => {
  const permissions = {
    canViewActor: (uuid: string) => uuid !== "Actor.hidden",
    canViewDocument: (uuid: string) => uuid !== "Item.hidden",
    canViewJournalEntry: (uuid: string) => uuid !== "Journal.hidden",
    canViewJournalPage: (_entryUuid: string, pageUuid: string) => pageUuid !== "Page.hidden"
  };

  assert.deepEqual(resolvePermittedRoute({ view: RouteView.Character, actorUuid: "Actor.hidden", pane: "Details", scrollTop: 1 }, permissions), {
    view: RouteView.Characters
  });

  assert.deepEqual(
    resolvePermittedRoute(
      { view: RouteView.OwnedDocument, actorUuid: "Actor.visible", documentUuid: "Item.hidden", parentPane: "Inventory", scrollTop: 44 },
      permissions
    ),
    { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Inventory", scrollTop: 44 }
  );

  assert.deepEqual(resolvePermittedRoute({ view: RouteView.Journal, entryUuid: "Journal.hidden", pageUuid: "Page.hidden", scrollTop: 9 }, permissions), {
    view: RouteView.Journal
  });

  assert.deepEqual(resolvePermittedRoute({ view: RouteView.Journal, entryUuid: "Journal.visible", pageUuid: "Page.hidden", scrollTop: 9 }, permissions), {
    view: RouteView.Journal,
    entryUuid: "Journal.visible",
    scrollTop: 9
  });
});

test("route labels use Character terminology instead of Actor terminology", () => {
  const routes: MobileRoute[] = [
    { view: RouteView.Characters },
    { view: RouteView.Character, actorUuid: "Actor.visible", pane: "Details" },
    { view: RouteView.DocumentDetail, documentUuid: "Actor.visible", documentType: "character" }
  ];

  for (const route of routes) {
    const label = getRouteLabel(route);
    assert.match(label, /Character/);
    assert.doesNotMatch(label, /\bActors?\b/);
  }
});

