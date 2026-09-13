import assert from "node:assert/strict";
import { test } from "vitest";
import { RouteView } from "../../../router/routes.ts";
import { describeDnd5ePaneAction } from "../actor-sheet-navigation.ts";
import type { CharacterSheetActionContext } from "../../character-sheet-adapter.ts";
import { runCharacterSheetAction } from "../../../core/mobile-shell/controller-helpers-navigation.ts";
import { createInitialSearchUiState } from "../../../core/mobile-shell/controller-helpers-search.ts";
import { createMobileRouter } from "../../../router/mobile-router.ts";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

function context(action: string, data?: Readonly<Record<string, string>>): CharacterSheetActionContext {
  return {
    actor: null,
    actorUuid: "Actor.hero",
    pane: "Details",
    route: { view: RouteView.Character, actorUuid: "Actor.hero", pane: "Details" },
    user: null,
    action,
    data
  };
}

test("dnd5e descriptors identify writes before dispatch and exclude refreshes and pure rolls", () => {
  assert.ok(describeDnd5ePaneAction(context("details-confirm-hp-delta"))?.label);
  assert.ok(describeDnd5ePaneAction(context("inventory-use"))?.label);
  assert.ok(describeDnd5ePaneAction(context("favorites-use", { favoriteType: "item" }))?.label);
  assert.equal(describeDnd5ePaneAction(context("favorites-use", { favoriteType: "skill" })), null);
  assert.equal(describeDnd5ePaneAction(context("favorites-use", { favoriteType: "tool" })), null);
  assert.equal(describeDnd5ePaneAction(context("inventory-management-refresh")), null);
  assert.equal(describeDnd5ePaneAction(context("unsupported-action")), null);
});

test("rapid resource submissions reach the dnd5e document API only once", async () => {
  let finish: (value: unknown) => void = () => undefined;
  const update = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const actor = {
    uuid: "Actor.hero",
    id: "hero",
    documentName: "Actor",
    type: "character",
    system: { attributes: { hp: { value: 5, max: 10 } } },
    canUserModify: () => true,
    update
  };
  vi.stubGlobal("game", { system: { id: "dnd5e" }, user: { id: "player" }, actors: [actor] });
  vi.stubGlobal("foundry", { utils: { fromUuidSync: () => actor } });
  const root = { querySelector: () => null } as unknown as HTMLElement;
  const router = createMobileRouter({ initialRoute: { view: RouteView.Character, actorUuid: actor.uuid, pane: "Details" } });
  const first = runCharacterSheetAction(root, router, createInitialSearchUiState(), "details-confirm-hp-delta", { data: { delta: "1" } });
  const duplicate = runCharacterSheetAction(root, router, createInitialSearchUiState(), "details-confirm-hp-delta", { data: { delta: "1" } });
  await duplicate;
  assert.equal(update.mock.calls.length, 1);

  await router.push({ view: RouteView.Characters });
  finish(actor);
  await first;
  assert.equal(update.mock.calls.length, 1);
});
