import assert from "node:assert/strict";
import { test } from "vitest";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { RouteView } from "../src/router/routes.ts";
import type { CharacterSheetAdapter, CharacterSheetActionContext } from "../src/systems/character-sheet-adapter.ts";

test("negative integration: core-style routing works with a mock adapter and no concrete system module", async () => {
  let lastActionContext: CharacterSheetActionContext | undefined;
  let actionResultObserved = false;
  const mockAdapter = createMockAdapter({
    onRunAction: context => {
      lastActionContext = context;
      return { ok: true, data: { mockHandled: true } };
    },
    onActionResult: () => {
      actionResultObserved = true;
    }
  });

  // Use non-dnd5e pane ids to prove generic routing never assumes concrete panes.
  const initialRoute = mockAdapter.createPaneRoute({
    actorUuid: "Actor.mock",
    pane: undefined,
    scrollTop: 88
  });
  const router = createMobileRouter({ initialRoute });

  assert.deepEqual(router.getCurrentRoute(), {
    view: RouteView.Character,
    actorUuid: "Actor.mock",
    pane: "OverviewX",
    scrollTop: 88
  });

  await router.push(
    mockAdapter.createOwnedDocumentRoute({
      actorUuid: "Actor.mock",
      documentUuid: "Actor.mock.Item.synthetic",
      parentPane: "InventoryX",
      scrollTop: 0
    })
  );
  assert.deepEqual(router.getCurrentRoute(), {
    view: RouteView.OwnedDocument,
    actorUuid: "Actor.mock",
    documentUuid: "Actor.mock.Item.synthetic",
    parentPane: "InventoryX",
    scrollTop: 0
  });

  const restored = await router.back();
  assert.deepEqual(restored, {
    view: RouteView.Character,
    actorUuid: "Actor.mock",
    pane: "OverviewX",
    scrollTop: 88
  });
  assert.equal(mockAdapter.isCharacterRoute(restored), true);

  const paneModel = await mockAdapter.buildPaneViewModel({
    pane: "OverviewX",
    actor: null,
    user: null,
    route: restored
  });
  assert.deepEqual(paneModel, {
    pane: "OverviewX",
    context: "overviewX",
    data: { renderedBy: "mock-adapter" }
  });

  const actionContext: CharacterSheetActionContext = {
    actor: null,
    actorUuid: "Actor.mock",
    pane: "OverviewX",
    route: restored,
    user: null,
    action: "mock-action",
    data: { step: "integration" }
  };
  const actionResult = await mockAdapter.runPaneAction(actionContext);
  mockAdapter.onPaneActionResult?.({ actionContext, result: actionResult });

  assert.equal(actionResult.ok, true);
  assert.equal(actionResultObserved, true);
  assert.equal(lastActionContext?.action, "mock-action");
  assert.equal(lastActionContext?.pane, "OverviewX");
});

function createMockAdapter(options?: {
  onRunAction?: (context: CharacterSheetActionContext) => { ok: boolean; reason?: string; data?: Record<string, unknown> };
  onActionResult?: () => void;
}): CharacterSheetAdapter {
  return {
    buildNavigationViewModel: ({ activePane }) => ({
      unavailable: false,
      actorUuid: "Actor.mock",
      actorName: "Mock Character",
      portraitInitials: "MC",
      portraitImage: null,
      classSummary: "Synthetic",
      activePane: activePane ?? "OverviewX",
      activePaneLabel: activePane ?? "OverviewX",
      panes: [
        {
          id: "OverviewX",
          label: "OverviewX",
          compactLabel: "OVR",
          displayLabel: "OverviewX",
          railClass: "",
          action: "navigate-character-pane",
          active: true
        }
      ],
      headerStats: []
    }),
    getPaneSpecs: () => [
      {
        id: "OverviewX",
        label: "OverviewX",
        compactLabel: "OVR",
        displayLabel: "OverviewX",
        railClass: "",
        context: "overviewX",
        routeKey: "OverviewX",
        legacyRouteKeys: ["OverviewX"]
      },
      {
        id: "InventoryX",
        label: "InventoryX",
        compactLabel: "INV",
        displayLabel: "InventoryX",
        railClass: "",
        context: "inventoryX",
        routeKey: "InventoryX",
        legacyRouteKeys: ["InventoryX"]
      }
    ],
    buildPaneViewModel: ({ pane }) => ({
      pane,
      context: pane === "OverviewX" ? "overviewX" : "inventoryX",
      data: { renderedBy: "mock-adapter" }
    }),
    runPaneAction: context => options?.onRunAction?.(context) ?? { ok: true },
    onPaneActionResult: () => {
      options?.onActionResult?.();
    },
    clearTransientState: () => undefined,
    createPaneRoute: ({ actorUuid, pane, scrollTop }) => ({
      view: RouteView.Character,
      actorUuid,
      pane: pane ? (pane === "InventoryX" ? "InventoryX" : "OverviewX") : "OverviewX",
      ...(scrollTop === undefined ? {} : { scrollTop })
    }),
    createOwnedDocumentRoute: ({ actorUuid, documentUuid, parentPane, scrollTop }) => ({
      view: RouteView.OwnedDocument,
      actorUuid,
      documentUuid,
      parentPane: parentPane === "OverviewX" ? "OverviewX" : "InventoryX",
      ...(scrollTop === undefined ? {} : { scrollTop })
    }),
    getPaneTemplatePaths: () => ({
      details: "mock/details",
      inventory: "mock/inventory",
      features: "mock/features",
      spells: "mock/spells",
      effects: "mock/effects",
      biography: "mock/biography",
      favorites: "mock/favorites"
    }),
    getTemplatePaths: () => ["mock/details"],
    getStylePaths: () => [],
    getPaneContext: pane => (pane === "OverviewX" ? "overviewX" : "inventoryX"),
    getHeaderPaneContext: () => "overviewX",
    getPaneSearchDrawerPrefix: pane => (pane === "InventoryX" ? "inventory:" : "overview:"),
    getSearchAdapters: () => [],
    getVisualMetadata: () => ({ bannerImage: null }),
    getPaneFromSwipe: (_activePane, gesture) => (gesture.endX > gesture.startX ? "InventoryX" : "OverviewX"),
    normalizePane: pane => (pane === "InventoryX" ? "InventoryX" : "OverviewX"),
    getDefaultPane: () => "OverviewX",
    getDefaultOwnedItemParentPane: () => "InventoryX",
    isInteractiveSwipeTarget: () => false,
    isCharacterRoute: route => route.view === RouteView.Character
  };
}

