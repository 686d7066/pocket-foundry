import { type MobileRouter } from "../../router/mobile-router.ts";
import { RouteView, type ActorSheetPaneId, type MobileRoute } from "../../router/routes.ts";
import { createDocumentLookupService, type FoundryDocumentLike } from "../../services/document-lookup.ts";
import {
    ALL_SEARCH_RESULT_TYPES,
    type CompendiumSearchCustomization,
    createActorSearchAdapter,
    createCompendiumSearchAdapter,
    createItemSearchAdapter,
    createJournalEntrySearchAdapter,
    createJournalPageSearchAdapter,
    createMobileSearchService,
    createOwnedItemSearchAdapter,
    createRouteForSearchResult,
    type MobileSearchResult,
    type MobileSearchService,
    type SearchableCollection,
    type SearchableCompendiumPack,
    type SearchAdapter
} from "../../services/search.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { buildSearchTypeFilters, createFoundryRecentsService, createSearchResultViewModel, getSearchRequestKey, hasUsableSearchQuery, normalizeSearchTypeFilter, rememberCurrentRouteScroll } from "./controller-helpers-navigation.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { consumeShellActionEvent } from "./controller-helpers-ui.ts";
import type { SearchUiState, SearchViewModel } from "./types.ts";

const SEARCH_DEBOUNCE_MS = 250;


export function createInitialSearchUiState(): SearchUiState {
  return {
    query: "",
    typeFilter: ALL_SEARCH_RESULT_TYPES,
    loading: false,
    results: [],
    errors: [],
    completedKey: "",
    sequence: 0
  };
}

/**
 * Synchronizes search state from the active route and runs an immediate search
 * for restored routes so Back can return to a populated search overlay.
 */
export async function prepareSearchForRender(route: MobileRoute, searchState: SearchUiState): Promise<void> {
  if (route.view !== RouteView.Search) return;

  const query = route.query ?? "";
  const typeFilter = normalizeSearchTypeFilter(route.typeFilter);
  const nextKey = getSearchRequestKey(query, typeFilter);
  const stateChanged = searchState.query !== query || searchState.typeFilter !== typeFilter;

  if (stateChanged) {
    searchState.query = query;
    searchState.typeFilter = typeFilter;
    searchState.errors = [];
    if (!hasUsableSearchQuery(query)) {
      searchState.results = [];
      searchState.completedKey = nextKey;
    }
  }

  if (hasUsableSearchQuery(query) && searchState.completedKey !== nextKey && !searchState.loading) {
    await executeSearch(
      searchState,
      createFoundrySearchService({
        parentPaneForOwnedItems: getCharacterSheetAdapter().getDefaultOwnedItemParentPane(),
        additionalAdapters: getCharacterSheetSearchAdapters(),
        compendiumSearch: getCharacterSheetAdapter().getCompendiumSearchCustomization?.()
      })
    );
  }
}

/**
 * Builds a template-safe search view model from route state and cached results.
 */
export function buildSearchViewModel(activeRoute: MobileRoute, searchState: SearchUiState | undefined): SearchViewModel {
  const route: Extract<MobileRoute, { view: RouteView.Search }> = activeRoute.view === RouteView.Search ? activeRoute : { view: RouteView.Search, query: "" };
  const typeFilter = normalizeSearchTypeFilter(route.typeFilter ?? searchState?.typeFilter);
  const query = route.query ?? searchState?.query ?? "";
  const characterSheetAdapter = getCharacterSheetAdapter();
  const service = createFoundrySearchService({
    parentPaneForOwnedItems: characterSheetAdapter.getDefaultOwnedItemParentPane(),
    additionalAdapters: getCharacterSheetSearchAdapters(),
    compendiumSearch: characterSheetAdapter.getCompendiumSearchCustomization?.()
  });
  const resultTypes = service.getResultTypes();

  return {
    query,
    typeFilter,
    typeFilters: buildSearchTypeFilters(resultTypes, typeFilter),
    results: (searchState?.results ?? []).map(result => createSearchResultViewModel(result, route.focusedResultId)),
    errors: searchState?.errors ?? [],
    loading: searchState?.loading ?? false,
    hasUsableQuery: hasUsableSearchQuery(query)
  };
}

export function getPaneSearchQuery(route: MobileRoute, pane: ActorSheetPaneId): string {
  const prefix = getCharacterSheetAdapter().getPaneSearchDrawerPrefix(pane);
  if (route.view !== RouteView.Character || !prefix || !route.drawer?.startsWith(prefix)) return "";
  return decodeURIComponent(route.drawer.slice(prefix.length));
}

export function createPaneSearchDrawer(pane: ActorSheetPaneId, query: string): string | undefined {
  const prefix = getCharacterSheetAdapter().getPaneSearchDrawerPrefix(pane);
  const normalized = query.trim().replace(/\s+/g, " ");
  return prefix && normalized ? `${prefix}${encodeURIComponent(normalized)}` : undefined;
}

/**
 * Creates the live Foundry-backed search service for the current runtime.
 */
export function createFoundrySearchService(options: {
  parentPaneForOwnedItems: ActorSheetPaneId;
  additionalAdapters?: SearchAdapter[];
  compendiumSearch?: CompendiumSearchCustomization;
}): MobileSearchService {
  const runtime = getFoundryRuntime();
  const user = runtime.game?.user ?? null;
  const parentPaneForOwnedItems = options.parentPaneForOwnedItems;
  const additionalAdapters = options.additionalAdapters ?? [];

  return createMobileSearchService({
    adapters: [
      createActorSearchAdapter({ collection: runtime.game?.actors as SearchableCollection | undefined, user }),
      createItemSearchAdapter({ collection: runtime.game?.items as SearchableCollection | undefined, user }),
      createOwnedItemSearchAdapter({ collection: runtime.game?.actors as SearchableCollection | undefined, user, parentPane: parentPaneForOwnedItems }),
      createJournalEntrySearchAdapter({ collection: runtime.game?.journal as SearchableCollection | undefined, user }),
      createJournalPageSearchAdapter({ collection: runtime.game?.journal as SearchableCollection | undefined, user }),
      createCompendiumSearchAdapter({
        packs: runtime.game?.packs as (Iterable<SearchableCompendiumPack> & { contents?: SearchableCompendiumPack[] }) | undefined,
        ...options.compendiumSearch
      }),
      ...additionalAdapters
    ]
  });
}

export function getCharacterSheetSearchAdapters(): SearchAdapter[] {
  const user = getFoundryRuntime().game?.user;
  if (!user) return [];
  return getCharacterSheetAdapter().getSearchAdapters({ user });
}

/**
 * Debounces live search input while preserving the last completed result list.
 */
export function scheduleSearch(element: HTMLElement, router: MobileRouter, searchState: SearchUiState): void {
  clearSearchDebounce(searchState);
  syncSearchStateFromRoute(router.getCurrentRoute(), searchState);

  if (!hasUsableSearchQuery(searchState.query)) {
    searchState.results = [];
    searchState.errors = [];
    searchState.loading = false;
    searchState.completedKey = getSearchRequestKey(searchState.query, searchState.typeFilter);
    void renderShell(element, router, searchState);
    return;
  }

  searchState.loading = true;
  void renderShell(element, router, searchState);
  searchState.debounceTimer = globalThis.setTimeout(() => {
    void runSearchImmediately(element, router, searchState);
  }, SEARCH_DEBOUNCE_MS);
}

/**
 * Runs the current route's search query immediately and redraws the shell.
 */
export async function runSearchImmediately(element: HTMLElement, router: MobileRouter, searchState: SearchUiState): Promise<void> {
  clearSearchDebounce(searchState);
  syncSearchStateFromRoute(router.getCurrentRoute(), searchState);

  if (!hasUsableSearchQuery(searchState.query)) {
    searchState.results = [];
    searchState.errors = [];
    searchState.loading = false;
    searchState.completedKey = getSearchRequestKey(searchState.query, searchState.typeFilter);
    await renderShell(element, router, searchState);
    return;
  }

  await executeSearch(
    searchState,
    createFoundrySearchService({
      parentPaneForOwnedItems: getCharacterSheetAdapter().getDefaultOwnedItemParentPane(),
      additionalAdapters: getCharacterSheetSearchAdapters(),
      compendiumSearch: getCharacterSheetAdapter().getCompendiumSearchCustomization?.()
    })
  );
  await renderShell(element, router, searchState);
}

/**
 * Executes a search with sequence-based stale result protection.
 */
export async function executeSearch(searchState: SearchUiState, service: MobileSearchService): Promise<void> {
  const sequence = searchState.sequence + 1;
  searchState.sequence = sequence;
  searchState.loading = true;
  const query = searchState.query;
  const typeFilter = searchState.typeFilter;
  const requestKey = getSearchRequestKey(query, typeFilter);

  const response = await service.searchWithDiagnostics({ query, typeFilter });
  if (sequence !== searchState.sequence || requestKey !== getSearchRequestKey(searchState.query, searchState.typeFilter)) return;

  searchState.results = response.results;
  searchState.errors = response.errors;
  searchState.loading = false;
  searchState.completedKey = requestKey;
}

/**
 * Opens a selected result through the internal mobile router.
 */
export async function openSearchResult(element: HTMLElement, router: MobileRouter, searchState: SearchUiState, resultId: string): Promise<void> {
  const result = searchState.results.find(candidate => candidate.uuid === resultId);
  if (!result) return;

  const currentRoute = router.getCurrentRoute();
  if (currentRoute.view === RouteView.Search) {
    router.updateCurrentRoute({
      ...currentRoute,
      focusedResultId: result.uuid,
      scrollTop: element.scrollTop
    });
  }

  await router.selectSearchRoute(await resolveSearchResultRoute(result));
  await renderShell(element, router, searchState);
}

/**
 * Opens a recent route through the internal router after rebuilding its
 * permission-checked row from current Foundry documents.
 */
export async function openRecentRoute(element: HTMLElement, router: MobileRouter, searchState: SearchUiState, recentId: string): Promise<void> {
  const route = await createFoundryRecentsService()?.getRouteById(recentId);
  if (!route) {
    notifyDocumentLinkUnavailable();
    await renderShell(element, router, searchState);
    return;
  }

  rememberCurrentRouteScroll(element, router);
  await router.push(route);
  await renderShell(element, router, searchState);
}

/**
 * Intercepts Foundry-enriched document links inside mobile readers and routes them
 * through Pocket Foundry instead of allowing a default desktop sheet open.
 */
export async function handleEnrichedDocumentLinkClick(
  event: MouseEvent,
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState
): Promise<void> {
  const link = event.target instanceof Element
    ? event.target.closest<HTMLAnchorElement>(".biography-pane a[data-uuid], .biography-pane a.content-link, .biography-pane a.inline-roll, .journal-reader a[data-uuid], .journal-reader a.content-link")
    : null;
  const uuid = getEnrichedLinkUuid(link);
  if (!link || !uuid) return;

  consumeShellActionEvent(event);
  rememberCurrentRouteScroll(element, router);
  const previousRoute = router.getCurrentRoute();
  const nextRoute = await resolveDocumentLinkRoute(uuid, previousRoute);
  if (!nextRoute) {
    notifyDocumentLinkUnavailable();
    return;
  }

  void router.push(nextRoute).then(() => renderShell(element, router, searchState));
}

export async function handleBiographyDocumentLinkClick(
  event: MouseEvent,
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState
): Promise<void> {
  return handleEnrichedDocumentLinkClick(event, element, router, searchState);
}

export function getEnrichedLinkUuid(link: HTMLAnchorElement | null): string {
  if (!link) return "";
  const dataset = link.dataset as DOMStringMap & { documentUuid?: string; uuid?: string; entity?: string; id?: string };
  const uuid = dataset.uuid || dataset.documentUuid || dataset.entity || "";
  if (uuid) return uuid;

  const href = link.getAttribute("href") ?? "";
  const uuidMatch = href.match(/@UUID\[([^\]]+)\]/);
  return uuidMatch?.[1] ?? "";
}

export async function resolveDocumentLinkRoute(uuid: string, previousRoute: MobileRoute): Promise<MobileRoute | null> {
  const runtime = getFoundryRuntime();
  const user = runtime.game?.user;
  const fromUuid = runtime.foundry?.utils?.fromUuid;
  if (!fromUuid || !user) {
    return {
      view: RouteView.DocumentDetail,
      documentUuid: uuid,
      documentType: "unknown",
      parentRoute: previousRoute
    };
  }

  const lookupService = createDocumentLookupService({
    user,
    fromUuid: async linkUuid => (await fromUuid(linkUuid)) as FoundryDocumentLike | null | undefined
  });
  const lookup = await lookupService.lookupByUuid(uuid);
  if (!lookup.available) return null;

  switch (lookup.documentType) {
    case "character":
      return { view: RouteView.Character, actorUuid: lookup.uuid };
    case "item":
      if (lookup.parent?.documentType === "character") {
        return {
          view: RouteView.OwnedDocument,
          actorUuid: lookup.parent.uuid,
          documentUuid: lookup.uuid,
          parentPane: getCharacterSheetAdapter().normalizePane(previousRoute.view === RouteView.Character ? previousRoute.pane : getCharacterSheetAdapter().getDefaultOwnedItemParentPane())
        };
      }
      return { view: RouteView.DocumentDetail, documentUuid: lookup.uuid, documentType: "item", parentRoute: previousRoute };
    case "journal-entry":
      return { view: RouteView.Journal, entryUuid: lookup.uuid };
    case "journal-page":
      return lookup.parent?.documentType === "journal-entry"
        ? { view: RouteView.Journal, entryUuid: lookup.parent.uuid, pageUuid: lookup.uuid }
        : null;
    case "unknown":
      return { view: RouteView.DocumentDetail, documentUuid: lookup.uuid, documentType: "unknown", parentRoute: previousRoute };
  }
}

export function notifyDocumentLinkUnavailable(): void {
  const notifications = (globalThis as { ui?: { notifications?: { warn?: (message: string) => void } } }).ui?.notifications;
  notifications?.warn?.("This document is no longer available or you do not have permission to view it.");
}

/**
 * Re-checks a selected search result through Foundry UUID lookup and maps the
 * resolved document type to the matching mobile-native route.
 */
export async function resolveSearchResultRoute(result: MobileSearchResult): Promise<MobileRoute> {
  const fallbackRoute = createRouteForSearchResult(result);
  const runtime = getFoundryRuntime();
  const user = runtime.game?.user;
  const fromUuid = runtime.foundry?.utils?.fromUuid;
  if (!fromUuid || !user) return fallbackRoute;

  const lookupService = createDocumentLookupService({
    user,
    fromUuid: async uuid => (await fromUuid(uuid)) as FoundryDocumentLike | null | undefined
  });
  const lookup = await lookupService.lookupByUuid(result.uuid);

  if (!lookup.available) {
    return {
      view: RouteView.DocumentDetail,
      documentUuid: result.uuid,
      documentType: getDocumentDetailTypeFromSearchResult(result),
      ...(result.source ? { source: result.source } : {})
    };
  }

  switch (lookup.documentType) {
    case "character":
      return { view: RouteView.Character, actorUuid: lookup.uuid };
    case "item":
      if (result.parentUuid || lookup.parent?.documentType === "character") {
        const actorUuid = result.parentUuid ?? lookup.parent?.uuid;
        if (!actorUuid) return createUnavailableSearchDetailRoute(result, "item");

        const parentLookup = await lookupService.lookupByUuid(actorUuid);
        if (!parentLookup.available || parentLookup.documentType !== "character") return createUnavailableSearchDetailRoute(result, "item");

      return {
          view: RouteView.OwnedDocument,
          actorUuid: parentLookup.uuid,
          documentUuid: lookup.uuid,
          parentPane: getCharacterSheetAdapter().normalizePane(
            fallbackRoute.view === RouteView.OwnedDocument ? fallbackRoute.parentPane : getCharacterSheetAdapter().getDefaultOwnedItemParentPane()
          )
        };
      }

      return {
        view: RouteView.DocumentDetail,
        documentUuid: lookup.uuid,
        documentType: "item",
        ...(result.source ? { source: result.source } : {})
      };
    case "journal-entry":
      return { view: RouteView.Journal, entryUuid: lookup.uuid };
    case "journal-page": {
      const entryUuid = result.parentUuid ?? lookup.parent?.uuid;
      if (!entryUuid) return createUnavailableSearchDetailRoute(result, "journal-page");

      const parentLookup = await lookupService.lookupByUuid(entryUuid);
      if (!parentLookup.available || parentLookup.documentType !== "journal-entry") return createUnavailableSearchDetailRoute(result, "journal-page");

      return { view: RouteView.Journal, entryUuid: parentLookup.uuid, pageUuid: lookup.uuid };
    }
    case "unknown":
      return createUnavailableSearchDetailRoute(result, "unknown");
  }
}

export function createUnavailableSearchDetailRoute(
  result: MobileSearchResult,
  documentType: Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"]
): MobileRoute {
  return {
    view: RouteView.DocumentDetail,
    documentUuid: result.uuid,
    documentType,
    ...(result.source ? { source: result.source } : {})
  };
}

export function getDocumentDetailTypeFromSearchResult(result: MobileSearchResult): Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"] {
  if (result.documentType) return result.documentType;
  if (result.type === "Character") return "character";
  if (result.type === "Item") return "item";
  if (result.type === "Journal Entry") return "journal-entry";
  if (result.type === "Journal Page") return "journal-page";
  return "unknown";
}

export function syncSearchStateFromRoute(route: MobileRoute, searchState: SearchUiState): void {
  if (route.view !== RouteView.Search) return;

  searchState.query = route.query;
  searchState.typeFilter = normalizeSearchTypeFilter(route.typeFilter);
}

export function clearSearchDebounce(searchState: SearchUiState): void {
  if (!searchState.debounceTimer) return;

  globalThis.clearTimeout(searchState.debounceTimer);
  searchState.debounceTimer = undefined;
}

