import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { type ActorSheetPaneId, RouteView, type MobileRoute } from "../src/router/routes.ts";
import type {
  CharacterSheetActionContext,
  CharacterSheetActionResult,
  CharacterSheetAdapter
} from "../src/systems/character-sheet-adapter.ts";

type RegisteredAdapterEntry = {
  systemId: string;
  importPath: string;
};

const GENERATED_ADAPTERS_SOURCE = new URL("../src/systems/character-sheet-adapters.generated.ts", import.meta.url);

test("each registered built-in system adapter loads and satisfies the runtime adapter contract", async () => {
  const entries = readRegisteredAdapterEntries();
  assert.ok(entries.length > 0, "No registered adapters were discovered in character-sheet-adapters.generated.ts.");

  for (const entry of entries) {
    const moduleUrl = new URL(entry.importPath, GENERATED_ADAPTERS_SOURCE);
    const loaded = await import(moduleUrl.href) as { characterSheetAdapter?: CharacterSheetAdapter };
    const adapter = loaded.characterSheetAdapter;
    assert.ok(adapter, `System '${entry.systemId}' did not export 'characterSheetAdapter' from ${entry.importPath}.`);
    await assertAdapterContract(`${entry.systemId} (${entry.importPath})`, adapter);
  }
});

async function assertAdapterContract(label: string, adapter: CharacterSheetAdapter): Promise<void> {
  const defaultPane = adapter.getDefaultPane();
  assert.equal(typeof defaultPane, "string", `${label}: getDefaultPane() must return a string pane id.`);

  const normalizedPane = adapter.normalizePane(defaultPane);
  assert.equal(typeof normalizedPane, "string", `${label}: normalizePane() must return a string pane id.`);

  const characterRoute = adapter.createPaneRoute({ actorUuid: "Actor.contract", pane: undefined, scrollTop: 12 });
  assert.equal(characterRoute.view, RouteView.Character, `${label}: createPaneRoute() must return a character route.`);
  assert.equal(characterRoute.actorUuid, "Actor.contract", `${label}: createPaneRoute() must preserve actorUuid.`);

  const ownedDocumentRoute = adapter.createOwnedDocumentRoute({
    actorUuid: "Actor.contract",
    documentUuid: "Actor.contract.Item.contract-item",
    parentPane: normalizedPane,
    scrollTop: 0
  });
  assert.equal(ownedDocumentRoute.view, RouteView.OwnedDocument, `${label}: createOwnedDocumentRoute() must return an owned-document route.`);
  assert.equal(ownedDocumentRoute.actorUuid, "Actor.contract", `${label}: createOwnedDocumentRoute() must preserve actorUuid.`);
  assert.equal(ownedDocumentRoute.parentPane, normalizedPane, `${label}: createOwnedDocumentRoute() must preserve normalized parent pane.`);

  const paneTemplatePaths = adapter.getPaneTemplatePaths();
  assert.ok(paneTemplatePaths.details !== undefined, `${label}: getPaneTemplatePaths().details is required.`);
  assert.ok(paneTemplatePaths.inventory !== undefined, `${label}: getPaneTemplatePaths().inventory is required.`);
  assert.ok(paneTemplatePaths.features !== undefined, `${label}: getPaneTemplatePaths().features is required.`);
  assert.ok(paneTemplatePaths.spells !== undefined, `${label}: getPaneTemplatePaths().spells is required.`);
  assert.ok(paneTemplatePaths.effects !== undefined, `${label}: getPaneTemplatePaths().effects is required.`);
  assert.ok(paneTemplatePaths.biography !== undefined, `${label}: getPaneTemplatePaths().biography is required.`);

  const templatePaths = adapter.getTemplatePaths();
  assert.ok(Array.isArray(templatePaths), `${label}: getTemplatePaths() must return an array.`);
  assert.equal(templatePaths.includes(undefined as unknown as string), false, `${label}: getTemplatePaths() must not include undefined optional templates.`);

  const paneSpecs = adapter.getPaneSpecs({ actor: null, user: null });
  assert.ok(Array.isArray(paneSpecs), `${label}: getPaneSpecs() must return an array.`);
  for (const pane of paneSpecs) {
    assert.equal(typeof pane.id, "string", `${label}: pane spec id must be a string.`);
    assert.equal(typeof pane.label, "string", `${label}: pane spec label must be a string.`);
    assert.equal(typeof pane.context, "string", `${label}: pane spec context must be a string.`);
  }

  const navigation = adapter.buildNavigationViewModel({
    actor: null,
    user: null,
    activePane: normalizedPane
  });
  assert.equal(typeof navigation.unavailable, "boolean", `${label}: buildNavigationViewModel() must return a navigation model.`);

  const paneViewModel = await adapter.buildPaneViewModel({
    pane: normalizedPane,
    actor: null,
    user: null,
    route: characterRoute
  });
  assert.equal(typeof paneViewModel.context, "string", `${label}: buildPaneViewModel() must return a context key.`);
  assert.equal(typeof paneViewModel.pane, "string", `${label}: buildPaneViewModel() must return a pane id.`);

  const actionContext: CharacterSheetActionContext = {
    actor: null,
    actorUuid: "Actor.contract",
    pane: normalizedPane,
    route: characterRoute,
    user: null,
    action: "__contract-noop__",
    data: { payload: "noop" }
  };
  const actionResult = await adapter.runPaneAction(actionContext);
  assertCharacterSheetActionResult(`${label}: runPaneAction()`, actionResult);
  adapter.onPaneActionResult?.({ actionContext, result: actionResult });

  adapter.clearTransientState(characterRoute);
  const searchAdapters = adapter.getSearchAdapters({ user: null });
  assert.ok(Array.isArray(searchAdapters), `${label}: getSearchAdapters() must return an array.`);

  const favoritesCapability = adapter.getFavoritesCapability?.() ?? null;
  if (label.startsWith("dnd5e ")) {
    assert.ok(favoritesCapability, `${label}: dnd5e must opt into the generic favorites capability.`);
  }
  if (favoritesCapability) {
    assert.equal(favoritesCapability.context, "favorites", `${label}: favorites capability must use the generic favorites context.`);
    assert.ok(Array.isArray(favoritesCapability.groupPartials), `${label}: favorites groupPartials must be an array.`);
    assert.equal(typeof favoritesCapability.buildViewModel, "function", `${label}: favorites capability must expose a buildViewModel function.`);
  }

  const paneContext = adapter.getPaneContext(normalizedPane as ActorSheetPaneId);
  assert.equal(typeof paneContext, "string", `${label}: getPaneContext() must return a string context key.`);

  const searchDrawerPrefix = adapter.getPaneSearchDrawerPrefix(normalizedPane);
  assert.ok(
    searchDrawerPrefix === null || typeof searchDrawerPrefix === "string",
    `${label}: getPaneSearchDrawerPrefix() must return string or null.`
  );

  const swipePane = adapter.getPaneFromSwipe(normalizedPane, {
    startX: 20,
    startY: 10,
    endX: 80,
    endY: 10
  });
  assert.ok(swipePane === null || typeof swipePane === "string", `${label}: getPaneFromSwipe() must return string or null.`);

  assert.equal(typeof adapter.isInteractiveSwipeTarget(null), "boolean", `${label}: isInteractiveSwipeTarget() must return boolean.`);
  assert.equal(adapter.isCharacterRoute(characterRoute as MobileRoute), true, `${label}: isCharacterRoute() must recognize character routes.`);

  const visualMetadata = adapter.getVisualMetadata();
  assert.equal(typeof visualMetadata, "object", `${label}: getVisualMetadata() must return metadata object.`);
  assert.ok(
    visualMetadata.bannerImage === null || typeof visualMetadata.bannerImage === "string",
    `${label}: getVisualMetadata().bannerImage must be string or null.`
  );
}

function readRegisteredAdapterEntries(): RegisteredAdapterEntry[] {
  const source = readFileSync(GENERATED_ADAPTERS_SOURCE, "utf8");
  const aliasByImport = new Map<string, string>();
  const importPattern = /import\s+\{\s*characterSheetAdapter\s+as\s+([A-Za-z0-9_]+)\s*\}\s+from\s+"([^"]+)"/g;
  const entryPattern = /\{\s*systemId:\s*"([^"]+)"\s*,\s*adapter:\s*([A-Za-z0-9_]+)\s*\}/g;

  for (const match of source.matchAll(importPattern)) {
    const alias = match[1];
    const importPath = match[2];
    if (!alias || !importPath) continue;
    aliasByImport.set(alias, importPath);
  }

  const entries: RegisteredAdapterEntry[] = [];
  for (const match of source.matchAll(entryPattern)) {
    const systemId = match[1];
    const alias = match[2];
    if (!systemId || !alias) continue;
    const importPath = aliasByImport.get(alias);
    if (!importPath) continue;
    entries.push({ systemId, importPath });
  }

  return entries;
}

function assertCharacterSheetActionResult(label: string, result: CharacterSheetActionResult): void {
  assert.equal(typeof result.ok, "boolean", `${label} must return { ok: boolean }.`);
  if (result.reason !== undefined) {
    assert.equal(typeof result.reason, "string", `${label} reason must be a string when provided.`);
  }
}

