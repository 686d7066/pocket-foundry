import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { RouteView, type MobileRoute } from "../src/router/routes.ts";
import {
  createReactiveRefreshController,
  createRefreshInvalidation,
  REACTIVE_REFRESH_HOOKS,
  shouldRefreshRoute,
  type ReactiveRefreshHooks
} from "../src/services/reactive-refresh.ts";

test("reactive refresh registers Foundry v14 document lifecycle hooks", () => {
  const hookFixture = createHooksFixture();
  const controller = createReactiveRefreshController({
    hooks: hookFixture.hooks,
    getRoute: () => ({ view: RouteView.Characters }),
    onRefresh: () => undefined
  });

  assert.deepEqual([...hookFixture.callbacks.keys()].sort(), [...REACTIVE_REFRESH_HOOKS].sort());
  controller.dispose();
  assert.equal(hookFixture.callbacks.size, 0);
});

test("actor, owned item, and active effect hooks target only the affected character store", () => {
  const characterRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Inventory", drawer: "inventory:cards", scrollTop: 240 };
  const otherCharacterRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.bryn", pane: "Inventory" };

  const actorUpdate = createRefreshInvalidation("updateActor", [document("Actor.arlen"), { system: { attributes: { hp: { value: 7 } } } }]);
  const ownedItemUpdate = createRefreshInvalidation("updateItem", [document("Item.sword", { parent: document("Actor.arlen") }), { system: { quantity: 2 } }]);
  const effectDelete = createRefreshInvalidation("deleteActiveEffect", [document("ActiveEffect.bless", { parent: document("Actor.arlen") })]);

  assert.ok(actorUpdate);
  assert.ok(ownedItemUpdate);
  assert.ok(effectDelete);
  assert.equal(shouldRefreshRoute(characterRoute, actorUpdate), true);
  assert.equal(shouldRefreshRoute(characterRoute, ownedItemUpdate), true);
  assert.equal(shouldRefreshRoute(characterRoute, effectDelete), true);
  assert.equal(shouldRefreshRoute(otherCharacterRoute, ownedItemUpdate), false);
  assert.equal(shouldRefreshRoute(otherCharacterRoute, effectDelete), false);
});

test("journal hooks target the journal list, matching entry, and matching page routes", () => {
  const listRoute: MobileRoute = { view: RouteView.Journal };
  const entryRoute: MobileRoute = { view: RouteView.Journal, entryUuid: "JournalEntry.quest" };
  const pageRoute: MobileRoute = { view: RouteView.Journal, entryUuid: "JournalEntry.quest", pageUuid: "JournalEntryPage.scene" };
  const otherEntryRoute: MobileRoute = { view: RouteView.Journal, entryUuid: "JournalEntry.secret" };
  const pageUpdate = createRefreshInvalidation("updateJournalEntryPage", [
    document("JournalEntryPage.scene", { parent: document("JournalEntry.quest") }),
    { text: { content: "New clue" } }
  ]);

  assert.ok(pageUpdate);
  assert.equal(shouldRefreshRoute(listRoute, pageUpdate), true);
  assert.equal(shouldRefreshRoute(entryRoute, pageUpdate), true);
  assert.equal(shouldRefreshRoute(pageRoute, pageUpdate), true);
  assert.equal(shouldRefreshRoute(otherEntryRoute, pageUpdate), false);
});

test("ownership and user updates refresh permission-sensitive routes", () => {
  const settingsRoute: MobileRoute = { view: RouteView.Settings };
  const otherCharacterRoute: MobileRoute = { view: RouteView.Character, actorUuid: "Actor.bryn", pane: "Details" };
  const ownershipUpdate = createRefreshInvalidation("updateActor", [document("Actor.arlen"), { ownership: { default: 0 } }]);
  const userUpdate = createRefreshInvalidation("updateUser", [document("User.player"), { role: 1 }]);

  assert.ok(ownershipUpdate);
  assert.ok(userUpdate);
  assert.equal(ownershipUpdate.permissionRelated, true);
  assert.equal(userUpdate.permissionRelated, true);
  assert.equal(shouldRefreshRoute(otherCharacterRoute, ownershipUpdate), true);
  assert.equal(shouldRefreshRoute(otherCharacterRoute, userUpdate), true);
  assert.equal(shouldRefreshRoute(settingsRoute, userUpdate), false);
});

test("controller coalesces hook bursts, preserves transient route state, and reruns open search", async () => {
  const hookFixture = createHooksFixture();
  const route: MobileRoute = { view: RouteView.Search, query: "bane", typeFilter: "Spell", scrollTop: 330, focusedResultId: "Item.bane" };
  const calls: string[] = [];

  createReactiveRefreshController({
    hooks: hookFixture.hooks,
    getRoute: () => route,
    preserveTransientState: () => {
      calls.push(`preserve:${route.scrollTop}:${route.typeFilter}:${route.focusedResultId}`);
    },
    onRefresh: () => {
      calls.push("refresh");
    },
    onSearchInvalidated: () => {
      calls.push(`search:${route.query}:${route.typeFilter}:${route.focusedResultId}`);
    }
  });

  hookFixture.emit("updateItem", document("Item.bane"), { name: "Bane" });
  hookFixture.emit("updateJournalEntryPage", document("JournalEntryPage.bane", { parent: document("JournalEntry.rules") }), { name: "Bane" });
  await settle();

  assert.deepEqual(calls, ["preserve:330:Spell:Item.bane", "search:bane:Spell:Item.bane"]);
});

test("invalidations during an active refresh coalesce into one trailing refresh", async () => {
  const hooks = createHooksFixture();
  let complete: () => void = () => undefined;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  let calls = 0;
  const controller = createReactiveRefreshController({
    hooks: hooks.hooks,
    getRoute: () => ({ view: RouteView.Characters }),
    onRefresh: async () => { calls += 1; if (calls === 1) await pending; }
  });
  hooks.emit("updateActor", document("Actor.one"));
  await settle();
  hooks.emit("updateActor", document("Actor.one"));
  hooks.emit("updateActor", document("Actor.two"));
  await settle();
  assert.equal(calls, 1);
  complete();
  await settle();
  assert.equal(calls, 2);
  controller.dispose();
});

test("a rejected refresh is handled and does not strand pending or future invalidations", async () => {
  const hooks = createHooksFixture();
  let fail: (error: Error) => void = () => undefined;
  const pending = new Promise<void>((_resolve, reject) => { fail = reject; });
  let calls = 0;
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const controller = createReactiveRefreshController({
    hooks: hooks.hooks,
    getRoute: () => ({ view: RouteView.Characters }),
    onRefresh: async () => { calls += 1; if (calls === 1) await pending; }
  });
  try {
    hooks.emit("updateActor", document("Actor.one"));
    await settle();
    hooks.emit("updateActor", document("Actor.one"));
    fail(new Error("refresh failed"));
    await settle();
    assert.equal(log.mock.calls.length, 1);
    assert.equal(calls, 2);
    hooks.emit("updateActor", document("Actor.one"));
    await settle();
    assert.equal(calls, 3);
  } finally {
    controller.dispose();
    log.mockRestore();
  }
});

test("disposal drops trailing refreshes while the active callback settles", async () => {
  const hooks = createHooksFixture();
  let complete: () => void = () => undefined;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  let calls = 0;
  const controller = createReactiveRefreshController({
    hooks: hooks.hooks,
    getRoute: () => ({ view: RouteView.Characters }),
    onRefresh: async () => { calls += 1; await pending; }
  });
  hooks.emit("updateActor", document("Actor.one"));
  await settle();
  hooks.emit("updateActor", document("Actor.one"));
  controller.dispose();
  complete();
  await settle();
  assert.equal(calls, 1);
  assert.equal(hooks.callbacks.size, 0);
});

test("a queued search refresh follows the current route after navigation", async () => {
  const hooks = createHooksFixture();
  let route: MobileRoute = { view: RouteView.Search, query: "query" };
  const refresh = vi.fn();
  const search = vi.fn();
  const controller = createReactiveRefreshController({ hooks: hooks.hooks, getRoute: () => route, onRefresh: refresh, onSearchInvalidated: search });
  hooks.emit("updateActor", document("Actor.one"));
  route = { view: RouteView.Characters };
  await settle();
  assert.equal(refresh.mock.calls.length, 1);
  assert.equal(search.mock.calls.length, 0);
  controller.dispose();
});

function document(uuid: string, options: { parent?: Record<string, unknown> } = {}): Record<string, unknown> {
  const [documentName, id] = uuid.split(".");
  return {
    uuid,
    documentName,
    id,
    ...(options.parent ? { parent: options.parent } : {})
  };
}

function createHooksFixture(): { hooks: ReactiveRefreshHooks; callbacks: Map<string, (...args: unknown[]) => void>; emit: (hook: string, ...args: unknown[]) => void } {
  const callbacks = new Map<string, (...args: unknown[]) => void>();
  return {
    callbacks,
    hooks: {
      on: (hook, callback) => {
        callbacks.set(hook, callback);
        return undefined;
      },
      off: (_hook, hookOrId) => {
        if (typeof hookOrId === "number") return;

        for (const [key, callback] of callbacks) {
          if (callback === hookOrId) callbacks.delete(key);
        }
      }
    },
    emit: (hook, ...args) => {
      callbacks.get(hook)?.(...args);
    }
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

