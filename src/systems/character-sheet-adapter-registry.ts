import { getFoundryRuntime } from "../core/foundry-globals.ts";
import { localize, type LocalizationData } from "../core/localization.ts";
import { createCharacterRoute, RouteView } from "../router/routes.ts";
import type {
  CharacterSheetActionResult,
  CharacterSheetAdapter,
  CharacterSheetVisualMetadata,
  SystemTermId
} from "./character-sheet-adapter.ts";
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

const unsupportedVisualMetadata: CharacterSheetVisualMetadata = {
  bannerImage: null
};
const UNSUPPORTED_PANE_ID = "Unavailable";

/**
 * Builds the safe unavailable state shown when no adapter supports the active
 * system's character sheets.
 */
function buildUnsupportedSystemNavigationModel(): { unavailable: true; title: string; body: string } {
  const runtime = getFoundryRuntime();
  const system = runtime.game?.system;
  const systemName = (system as { title?: string } | undefined)?.title ?? system?.id ?? "this";
  return {
    unavailable: true,
    title: localize("POCKETFOUNDRY.Character.Unavailable.Title", "Character Unavailable"),
    body: localize("POCKETFOUNDRY.Character.UnsupportedSystem.Body", "{systemName} character sheets are not yet supported in the mobile shell. Journal, Search, and Settings are still available.", { systemName })
  };
}

const unsupportedCharacterSheetAdapter: CharacterSheetAdapter = {
  isCharacterPickerActor: () => true,
  buildCharacterPickerPresentation: () => ({
    typeLabel: localize("POCKETFOUNDRY.Document.Character", "Character"),
    summary: "",
    subtitle: "",
    headerStats: [],
    chips: []
  }),
  buildNavigationViewModel: () => buildUnsupportedSystemNavigationModel(),
  getPaneSpecs: () => [],
  buildPaneViewModel: ({ pane }) => ({ pane, context: pane, templatePath: "", data: undefined }),
  onPaneActionResult: () => undefined,
  clearTransientState: () => undefined,
  runPaneAction: () => ({ ok: false, reason: "unsupported" } satisfies CharacterSheetActionResult),
  createPaneRoute: options => createCharacterRoute(options.actorUuid, UNSUPPORTED_PANE_ID),
  createOwnedDocumentRoute: options => ({
    view: RouteView.OwnedDocument,
    actorUuid: options.actorUuid,
    documentUuid: options.documentUuid,
    parentPane: UNSUPPORTED_PANE_ID,
    ...(options.scrollTop === undefined ? {} : { scrollTop: options.scrollTop })
  }),
  getStylePaths: () => [],
  getPaneContext: pane => pane,
  getPaneSearchDrawerPrefix: () => null,
  getSearchAdapters: (_options) => [],
  getVisualMetadata: () => unsupportedVisualMetadata,
  getSystemTermLabel: (term, data) => getFallbackSystemTermLabel(term, data),
  getTemplatePaths: () => [],
  getDefaultPane: () => UNSUPPORTED_PANE_ID,
  getDefaultOwnedItemParentPane: () => UNSUPPORTED_PANE_ID,
  getPaneFromSwipe: () => null,
  normalizePane: () => UNSUPPORTED_PANE_ID,
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

/**
 * Resolves a generic system-owned term through the active adapter, falling back
 * to English when the adapter does not provide a system-specific label.
 */
export function getSystemTermLabel(term: SystemTermId, data: LocalizationData = {}): string {
  return getCharacterSheetAdapter().getSystemTermLabel?.(term, data) ?? getFallbackSystemTermLabel(term, data);
}

/**
 * Returns English fallback text for system-owned terms without assuming a
 * concrete Foundry system is active.
 */
function getFallbackSystemTermLabel(term: SystemTermId, _data: LocalizationData = {}): string {
  switch (term) {
    case "enemy":
      return "Enemy";
    case "initiative":
      return "Initiative";
    default:
      return humanizeTermId(term);
  }
}

/**
 * Converts camel-case term ids into title-cased fallback labels.
 */
function humanizeTermId(term: string): string {
  const words = term.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return `${words[0]?.toLocaleUpperCase() ?? ""}${words.slice(1)}`;
}
