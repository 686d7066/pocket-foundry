import { getFoundryRuntime } from "../core/foundry-globals.ts";
import { createCharacterRoute, RouteView } from "../router/routes.ts";
import type { CharacterSheetActionResult, CharacterSheetAdapter, CharacterSheetPaneTemplatePaths, CharacterSheetVisualMetadata } from "./character-sheet-adapter.ts";
import { BUILT_IN_CHARACTER_SHEET_ADAPTERS } from "./character-sheet-adapters.generated.ts";

const registeredAdapters = new Map<string, CharacterSheetAdapter>();
let builtInAdaptersRegistered = false;

function ensureBuiltInAdaptersRegistered(): void {
  if (builtInAdaptersRegistered) return;
  builtInAdaptersRegistered = true;
  for (const { systemId, adapter } of BUILT_IN_CHARACTER_SHEET_ADAPTERS) {
    registerCharacterSheetAdapter(systemId, adapter);
  }
}

function resolveSystemId(systemId?: string): string | undefined {
  const runtime = getFoundryRuntime();
  return (systemId ?? runtime.game?.system?.id)?.toLowerCase();
}

export function registerCharacterSheetAdapter(systemId: string, adapter: CharacterSheetAdapter): void {
  registeredAdapters.set(systemId.toLowerCase(), adapter);
}

export function hasCharacterSheetAdapterForSystem(systemId?: string): boolean {
  if (builtInAdaptersRegistered === false) {
    ensureBuiltInAdaptersRegistered();
  }
  const resolvedSystemId = resolveSystemId(systemId);
  if (!resolvedSystemId) return false;
  return registeredAdapters.has(resolvedSystemId);
}

const unsupportedTemplatePaths: CharacterSheetPaneTemplatePaths = {
  details: "",
  inventory: "",
  features: "",
  spells: "",
  effects: "",
  biography: ""
};

const unsupportedVisualMetadata: CharacterSheetVisualMetadata = {
  bannerImage: null
};

function buildUnsupportedSystemNavigationModel(): { unavailable: true; title: string; body: string } {
  const runtime = getFoundryRuntime();
  const system = runtime.game?.system;
  const systemName = (system as { title?: string } | undefined)?.title ?? system?.id ?? "this";
  return {
    unavailable: true,
    title: "Character Unavailable",
    body: `${systemName} character sheets are not yet supported in the mobile shell. Journal, Search, and Settings are still available.`
  };
}

const unsupportedCharacterSheetAdapter: CharacterSheetAdapter = {
  buildNavigationViewModel: () => buildUnsupportedSystemNavigationModel(),
  getPaneSpecs: () => [],
  buildPaneViewModel: ({ pane }) => ({ pane, context: pane, data: undefined }),
  onPaneActionResult: () => undefined,
  clearTransientState: () => undefined,
  runPaneAction: () => ({ ok: false, reason: "unsupported" } satisfies CharacterSheetActionResult),
  createPaneRoute: options => createCharacterRoute(options.actorUuid, "Details"),
  createOwnedDocumentRoute: options => ({
    view: RouteView.OwnedDocument,
    actorUuid: options.actorUuid,
    documentUuid: options.documentUuid,
    parentPane: "Details",
    ...(options.scrollTop === undefined ? {} : { scrollTop: options.scrollTop })
  }),
  getPaneTemplatePaths: () => unsupportedTemplatePaths,
  getStylePaths: () => [],
  getPaneContext: pane => pane,
  getPaneSearchDrawerPrefix: () => null,
  getSearchAdapters: (_options) => [],
  getVisualMetadata: () => unsupportedVisualMetadata,
  getTemplatePaths: () => [],
  getDefaultPane: () => "Details",
  getDefaultOwnedItemParentPane: () => "Details",
  getPaneFromSwipe: () => null,
  normalizePane: () => "Details",
  isInteractiveSwipeTarget: () => false,
  isCharacterRoute: route => route.view === RouteView.Character
};

/**
 * Returns the actor sheet adapter for the active Foundry system.
 * Future systems should be selected through generated built-in registrations.
 */
export function getCharacterSheetAdapter(): CharacterSheetAdapter {
  ensureBuiltInAdaptersRegistered();
  const systemId = getFoundryRuntime().game?.system?.id;
  if (systemId) {
    const adapter = registeredAdapters.get(systemId.toLowerCase());
    if (adapter) return adapter;
  }

  return unsupportedCharacterSheetAdapter;
}
