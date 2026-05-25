import { RouteView, type MobileRoute } from "./routes.ts";

/**
 * Bookmarkable URL hash route keys.
 *
 * Top-level keys mirror shell destinations. Character is separate because it
 * opens a concrete character sheet under the Characters shell destination.
 */
export enum RouteHashKey {
  Characters = "characters",
  Combat = "combat",
  Character = "character",
  Document = "document",
  Journal = "journal",
  Search = "search",
  Recents = "recents",
  Settings = "settings"
}

/**
 * Query parameter names used inside Pocket Foundry route hashes.
 */
enum RouteHashParam {
  DocumentType = "type",
  Source = "source",
  Page = "page",
  Pane = "pane",
  Item = "item"
}

/**
 * Browser history write operation used when mirroring mobile routes.
 */
export type BrowserHistoryWriteMode = "push" | "replace";

/**
 * History state marker that lets Pocket Foundry distinguish its own entries.
 */
export type PocketFoundryHistoryState = {
  pocketFoundry: true;
  route: MobileRoute;
  sequence: number;
};

/**
 * Minimal browser History API surface needed by the router history bridge.
 */
export type BrowserHistoryLike = {
  pushState(state: PocketFoundryHistoryState, unused: string, url?: string | URL | null): void;
  replaceState(state: PocketFoundryHistoryState, unused: string, url?: string | URL | null): void;
};

/**
 * Chooses whether a route write should create a new browser entry or replace the current one.
 */
export function getBrowserHistoryWriteMode(previousRoute: MobileRoute, nextRoute: MobileRoute): BrowserHistoryWriteMode {
  return JSON.stringify(previousRoute) === JSON.stringify(nextRoute) ? "replace" : "push";
}

/**
 * Builds the state object stored alongside Pocket Foundry browser history entries.
 */
export function createPocketFoundryHistoryState(route: MobileRoute, sequence = 0): PocketFoundryHistoryState {
  return {
    pocketFoundry: true,
    route,
    sequence
  };
}

/**
 * Creates the bookmarkable URL for a concrete mobile route.
 */
export function createPocketFoundryHistoryUrl(currentHref: string, route: MobileRoute, sequence = 0): string {
  const url = new URL(currentHref);
  void sequence;
  url.hash = serializeRouteHash(route);
  return url.href;
}

/**
 * Writes a Pocket Foundry route into browser history.
 */
export function writePocketFoundryHistoryEntry(
  history: BrowserHistoryLike,
  currentHref: string,
  route: MobileRoute,
  mode: BrowserHistoryWriteMode,
  sequence: number
): void {
  const state = createPocketFoundryHistoryState(route, sequence);
  const url = createPocketFoundryHistoryUrl(currentHref, route, sequence);

  if (mode === "push") {
    history.pushState(state, "", url);
    return;
  }

  history.replaceState(state, "", url);
}

/**
 * Detects history states written by Pocket Foundry.
 */
export function isPocketFoundryHistoryState(state: unknown): state is PocketFoundryHistoryState {
  if (!state || typeof state !== "object") return false;

  const candidate = state as { pocketFoundry?: unknown; route?: unknown };
  return candidate.pocketFoundry === true && Boolean(candidate.route);
}

/**
 * Parses a Pocket Foundry route from the URL hash for reload and Back fallback.
 */
export function getPocketFoundryRouteFromHash(hash: string): MobileRoute | undefined {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) return undefined;

  const [firstPart = "", ...restParts] = normalizedHash.split("&");
  const [routeKey = "", firstValue = ""] = firstPart.split("=");
  const params = new URLSearchParams(restParts.join("&"));

  switch (routeKey) {
    case RouteHashKey.Characters:
      return { view: RouteView.Characters };
    case RouteHashKey.Combat:
      return { view: RouteView.Combat };
    case RouteHashKey.Journal:
      return {
        view: RouteView.Journal,
        ...(firstValue ? { entryUuid: decodeURIComponent(firstValue) } : {}),
        ...optionalParam(params, RouteHashParam.Page, "pageUuid")
      };
    case RouteHashKey.Search:
      return { view: RouteView.Search, query: firstValue ? decodeURIComponent(firstValue) : "" };
    case RouteHashKey.Recents:
      return { view: RouteView.Recents };
    case RouteHashKey.Settings:
      return { view: RouteView.Settings };
    case RouteHashKey.Character:
      if (!firstValue) return undefined;
      if (params.has(RouteHashParam.Item)) {
        const parentPane = optionalDecodedParam(params, RouteHashParam.Pane, "parentPane");
        const documentUuid = optionalParam(params, RouteHashParam.Item, "documentUuid");
        if (documentUuid.documentUuid) {
          return {
            view: RouteView.OwnedDocument,
            actorUuid: decodeURIComponent(firstValue),
            parentPane: parentPane.parentPane ?? "",
            documentUuid: decodeURIComponent(documentUuid.documentUuid)
          };
        }
      }

      return {
        view: RouteView.Character,
        actorUuid: decodeURIComponent(firstValue),
        ...optionalDecodedParam(params, RouteHashParam.Pane, "pane")
      };
    case RouteHashKey.Document:
      if (!firstValue) return undefined;
      return {
        view: RouteView.DocumentDetail,
        documentUuid: decodeURIComponent(firstValue),
        documentType: getDocumentTypeFromHashValue(params.get(RouteHashParam.DocumentType)),
        ...optionalDecodedParam(params, RouteHashParam.Source, "source")
      };
    default:
      return undefined;
  }
}

function serializeRouteHash(route: MobileRoute): string {
  switch (route.view) {
    case RouteView.Characters:
      return RouteHashKey.Characters;
    case RouteView.Combat:
      return RouteHashKey.Combat;
    case RouteView.Character:
      return `${RouteHashKey.Character}=${encodeURIComponent(route.actorUuid)}${route.pane ? `&${RouteHashParam.Pane}=${encodeURIComponent(route.pane)}` : ""}`;
    case RouteView.OwnedDocument:
      return `${RouteHashKey.Character}=${encodeURIComponent(route.actorUuid)}&${RouteHashParam.Pane}=${encodeURIComponent(route.parentPane)}&${RouteHashParam.Item}=${encodeURIComponent(route.documentUuid)}`;
    case RouteView.Journal:
      return route.entryUuid
        ? `${RouteHashKey.Journal}=${encodeURIComponent(route.entryUuid)}${route.pageUuid ? `&${RouteHashParam.Page}=${encodeURIComponent(route.pageUuid)}` : ""}`
        : RouteHashKey.Journal;
    case RouteView.Search:
      return route.query ? `${RouteHashKey.Search}=${encodeURIComponent(route.query)}` : RouteHashKey.Search;
    case RouteView.Recents:
      return RouteHashKey.Recents;
    case RouteView.Settings:
      return RouteHashKey.Settings;
    case RouteView.DocumentDetail:
      return `${RouteHashKey.Document}=${encodeURIComponent(route.documentUuid)}&${RouteHashParam.DocumentType}=${encodeURIComponent(route.documentType)}${route.source ? `&${RouteHashParam.Source}=${encodeURIComponent(route.source)}` : ""}`;
  }
}

function getDocumentTypeFromHashValue(value: string | null): "character" | "item" | "journal-entry" | "journal-page" | "unknown" {
  if (value === "character" || value === "item" || value === "journal-entry" || value === "journal-page") return value;
  return "unknown";
}

function optionalParam(params: URLSearchParams, sourceKey: string, targetKey: string): Record<string, string> {
  const value = params.get(sourceKey);
  return value ? { [targetKey]: value } : {};
}

function optionalDecodedParam(params: URLSearchParams, sourceKey: string, targetKey: string): Record<string, string> {
  const value = params.get(sourceKey);
  return value ? { [targetKey]: decodeURIComponent(value) } : {};
}
