import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createMobileRouter } from "../router/mobile-router.ts";
import { RouteView } from "../router/routes.ts";
import { handleCharacterSheetClickAction } from "../core/mobile-shell/actions-character-sheet.ts";
import { createInitialSearchUiState } from "../core/mobile-shell/controller-helpers-search.ts";
import { buildShellViewModel } from "../core/mobile-shell/controller-helpers-shell.ts";
import { buildCharacterPickerViewModel } from "../services/character-picker.ts";
import { getCharacterSheetAdapter, registerCharacterSheetAdapter } from "../systems/character-sheet-adapter-registry.ts";
import type { CharacterSheetAdapter, CharacterSheetActionContext } from "../systems/character-sheet-adapter.ts";
import { createDocument, createElement, createInput, installShellFixtureRuntime } from "./support/search-ui-fixture.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "renderTemplate");
  Reflect.deleteProperty(globalThis, "foundry");
});

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

  // Use adapter-defined pane ids to prove generic routing never assumes concrete panes.
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
    parentPane: "OverviewX",
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
    templatePath: "mock/pane",
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

test("shared shell rendering and action dispatch use a minimal synthetic adapter end to end", async () => {
  let dispatchedAction: CharacterSheetActionContext | undefined;
  const adapter = createMockAdapter({
    onRunAction: context => {
      dispatchedAction = context;
      return { ok: true };
    }
  });
  registerCharacterSheetAdapter("synthetic-pipeline", adapter);
  const root = createElement();
  const actor = createDocument({ uuid: "Actor.pilot", name: "Kei Voss", documentName: "Actor", type: "pilot" });
  installShellFixtureRuntime({
    root,
    searchInput: createInput(),
    actors: [actor],
    systemId: "synthetic-pipeline",
    renderTemplate: async () => "<main></main>"
  });
  const route = { view: RouteView.Character, actorUuid: actor.uuid, pane: "OverviewX" } as const;
  const router = createMobileRouter({ initialRoute: route });

  const model = await buildShellViewModel(route, false, route);

  assert.equal(model.actorSheet?.unavailable, false);
  assert.equal(model.actorSheet?.summary, "Synthetic");
  assert.equal(model.actorSheet?.activePaneContent?.templatePath, "mock/pane");
  assert.deepEqual(model.actorSheet?.activePaneContent?.data, { renderedBy: "mock-adapter" });
  assert.equal(model.actorSheet?.headerContent, undefined);
  assert.equal(adapter.getFavoritesCapability, undefined);

  let prevented = false;
  const handled = await handleCharacterSheetClickAction(
    { element: root as unknown as HTMLElement, router, searchState: createInitialSearchUiState() },
    { dataset: { action: "synthetic-pulse", channel: "violet" } } as unknown as HTMLElement,
    {
      defaultPrevented: false,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => undefined,
      stopImmediatePropagation: () => undefined
    } as unknown as Event
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(dispatchedAction?.action, "synthetic-pulse");
  assert.deepEqual(dispatchedAction?.data, { action: "synthetic-pulse", channel: "violet" });
});

test("unsupported systems list any permitted actor as identity only and keep shared navigation available", () => {
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: { system: { id: "synthetic-unsupported", title: "Synthetic System" } }
  });
  const adapter = getCharacterSheetAdapter();
  const actor = {
    uuid: "Actor.pilot",
    id: "pilot",
    name: "Kei Voss",
    type: "pilot",
    system: { alienVitals: { resonance: 99 } },
    testUserPermission: (_user: unknown, level: unknown) => level === "OBSERVER",
    getUserLevel: () => 2
  };

  const picker = buildCharacterPickerViewModel({ actors: [actor], user: { id: "player" }, adapter });

  assert.equal(picker.characters[0]?.name, "Kei Voss");
  assert.equal(picker.characters[0]?.summary, "");
  assert.deepEqual(picker.characters[0]?.headerStats, []);
  assert.doesNotMatch(JSON.stringify(picker), /resonance|99/);
  assert.deepEqual(adapter.buildNavigationViewModel({ actor, user: { id: "player" }, activePane: undefined }), {
    unavailable: true,
    title: "Character Unavailable",
    body: "Synthetic System character sheets are not yet supported in the mobile shell. Journal, Search, and Settings are still available."
  });
});

function createMockAdapter(options?: {
  onRunAction?: (context: CharacterSheetActionContext) => { ok: boolean; reason?: string; data?: Record<string, unknown> };
  onActionResult?: () => void;
}): CharacterSheetAdapter {
  return {
    isCharacterPickerActor: actor => actor.type === "pilot",
    buildCharacterPickerPresentation: () => ({
      typeLabel: "Pilot",
      summary: "Synthetic",
      subtitle: "Synthetic",
      headerStats: [],
      chips: []
    }),
    buildNavigationViewModel: ({ activePane }) => ({
      unavailable: false,
      actorUuid: "Actor.mock",
      actorName: "Mock Character",
      portraitInitials: "MC",
      portraitImage: null,
      summary: "Synthetic",
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
      }
    ],
    buildPaneViewModel: ({ pane }) => ({
      pane,
      context: "overviewX",
      templatePath: "mock/pane",
      data: { renderedBy: "mock-adapter" }
    }),
    runPaneAction: context => options?.onRunAction?.(context) ?? { ok: true },
    onPaneActionResult: () => {
      options?.onActionResult?.();
    },
    clearTransientState: () => undefined,
    createPaneRoute: ({ actorUuid, scrollTop }) => ({
      view: RouteView.Character,
      actorUuid,
      pane: "OverviewX",
      ...(scrollTop === undefined ? {} : { scrollTop })
    }),
    createOwnedDocumentRoute: ({ actorUuid, documentUuid, scrollTop }) => ({
      view: RouteView.OwnedDocument,
      actorUuid,
      documentUuid,
      parentPane: "OverviewX",
      ...(scrollTop === undefined ? {} : { scrollTop })
    }),
    getTemplatePaths: () => ["mock/pane"],
    getStylePaths: () => [],
    getPaneContext: () => "overviewX",
    getPaneSearchDrawerPrefix: () => null,
    getSearchAdapters: () => [],
    getVisualMetadata: () => ({ bannerImage: null }),
    getPaneFromSwipe: () => null,
    normalizePane: () => "OverviewX",
    getDefaultPane: () => "OverviewX",
    getDefaultOwnedItemParentPane: () => "OverviewX",
    isInteractiveSwipeTarget: () => false,
    isCharacterRoute: route => route.view === RouteView.Character
  };
}

