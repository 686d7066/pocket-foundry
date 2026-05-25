import { SEARCH_MIN_QUERY_LENGTH } from "../core/search-policy.ts";
import { getCollectionContents, getObject, getString } from "../core/utils.ts";
import { RouteView, type ActorSheetPaneId, type MobileRoute } from "../router/routes.ts";
import {
  canViewDocument,
  canViewJournalPage,
  type FoundryUserLike,
  type PermissionCheckedDocument
} from "./permissions.ts";

/**
 * Search result type label produced by registered search adapters.
 */
export type SearchResultType = string;

/**
 * Special type filter value that queries every registered adapter.
 */
export const ALL_SEARCH_RESULT_TYPES = "all";

/**
 * Normalized search query passed from UI state into the search service.
 */
export type MobileSearchQuery = {
  query: string;
  typeFilter?: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES;
};

/**
 * Template-safe search result model returned by adapters and the service.
 */
export type MobileSearchResult = {
  uuid: string;
  type: SearchResultType;
  name: string;
  icon?: string | null;
  source?: string | null;
  snippet?: string | null;
  parentUuid?: string | null;
  parentName?: string | null;
  route?: MobileRoute;
};

/**
 * Adapter-specific search failure retained without blocking other adapters.
 */
export type SearchAdapterError = {
  adapterType: SearchResultType;
  message: string;
};

/**
 * Complete search response including partial adapter failures.
 */
export type MobileSearchResponse = {
  query: string;
  typeFilter: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES;
  results: MobileSearchResult[];
  errors: SearchAdapterError[];
};

export function isUsableSearchQuery(query: string): boolean {
  return query.trim().replace(/\s/g, "").length >= MIN_SEARCH_QUERY_LENGTH;
}

/**
 * Search adapter contract for one searchable collection or document source.
 */
export type SearchAdapter = {
  type: SearchResultType;
  types?: SearchResultType[];
  canSearch?: (query: NormalizedMobileSearchQuery) => boolean;
  search: (query: NormalizedMobileSearchQuery) => Promise<MobileSearchResult[]> | MobileSearchResult[];
};

/**
 * Mobile search service facade used by the future search UI.
 */
export type MobileSearchService = {
  search: (query: MobileSearchQuery) => Promise<MobileSearchResult[]>;
  searchWithDiagnostics: (query: MobileSearchQuery) => Promise<MobileSearchResponse>;
  getResultTypes: () => SearchResultType[];
};

/**
 * Backward-compatible export for migration and legacy callers.
 */
export const MIN_SEARCH_QUERY_LENGTH = SEARCH_MIN_QUERY_LENGTH;

/**
 * Normalized non-empty query object used internally by adapters.
 */
export type NormalizedMobileSearchQuery = {
  query: string;
  normalizedQuery: string;
  typeFilter: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES;
};

/**
 * Minimal Foundry collection shape needed for collection search and fallback iteration.
 */
export type SearchableCollection<TDocument extends SearchableDocumentLike = SearchableDocumentLike> =
  | Iterable<TDocument>
  | {
      contents?: TDocument[];
      search?: (search: { query?: string; filters?: unknown[]; exclude?: string[] }) => TDocument[] | Promise<TDocument[]>;
    };

/**
 * Minimal Foundry document shape used by built-in fixture/live adapters.
 */
export type SearchableDocumentLike = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  name?: string;
  type?: string;
  img?: string | null;
  documentName?: string;
  parent?: SearchableDocumentLike | null;
  items?: SearchableCollection<SearchableDocumentLike> | SearchableDocumentLike[];
  pages?: SearchableCollection<SearchableJournalPageLike> | SearchableJournalPageLike[];
  system?: unknown;
};

/**
 * Minimal journal page shape with common text/source fields used for safe fixture search.
 */
export type SearchableJournalPageLike = SearchableDocumentLike & {
  text?: {
    content?: string;
  };
  src?: string | null;
};

/**
 * Minimal compendium index entry shape used for pack search results.
 */
export type SearchableCompendiumIndexEntry = {
  _id?: string;
  id?: string;
  uuid?: string;
  name?: string;
  type?: string;
  img?: string | null;
  documentName?: string;
};

/**
 * Minimal Foundry compendium pack shape needed for indexed search.
 */
export type SearchableCompendiumPack = {
  collection?: string;
  documentName?: string;
  metadata?: {
    label?: string;
    type?: string;
  };
  index?: Iterable<SearchableCompendiumIndexEntry> | { contents?: SearchableCompendiumIndexEntry[] };
  getIndex?: (options?: { fields?: string[] }) => Promise<Iterable<SearchableCompendiumIndexEntry> | { contents?: SearchableCompendiumIndexEntry[] }>;
  visible?: boolean;
};

/**
 * Runtime options for constructing the search service.
 */
export type MobileSearchServiceOptions = {
  adapters: SearchAdapter[];
};

/**
 * Common adapter options for permission-gated collection adapters.
 */
export type SearchAdapterEnvironment<TDocument extends SearchableDocumentLike = SearchableDocumentLike> = {
  // Foundry collection references can be unavailable during lifecycle edges;
  // tests may also omit them. Accept both null and undefined at this boundary.
  collection: SearchableCollection<TDocument> | undefined | null;
  user: FoundryUserLike;
};

/**
 * Runtime options for searching compendium pack indexes.
 */
export type CompendiumSearchAdapterEnvironment = {
  // Packs are runtime-provided and may be absent as null or undefined depending
  // on Foundry/system state and fixture wiring.
  packs: Iterable<SearchableCompendiumPack> | { contents?: SearchableCompendiumPack[] } | undefined | null;
};

/**
 * Creates the service that normalizes queries, isolates adapter failures, filters
 * by result type, deduplicates UUIDs, and sorts results predictably.
 */
export function createMobileSearchService(options: MobileSearchServiceOptions): MobileSearchService {
  const adapters = [...options.adapters];

  return {
    search: async query => (await runSearch(adapters, query)).results,
    searchWithDiagnostics: query => runSearch(adapters, query),
    getResultTypes: () => getAdapterResultTypes(adapters)
  };
}

/**
 * Creates an adapter for top-level Actor collection search.
 */
export function createActorSearchAdapter(environment: SearchAdapterEnvironment): SearchAdapter {
  return {
    type: "Character",
    search: async query => {
      const documents = await searchCollection(environment.collection, query.query);
      return documents
        .filter(document => canViewDocument(document, environment.user))
        .filter(document => matchesSearchableDocument(document, query.normalizedQuery))
        .map(document => createActorResult(document));
    }
  };
}

/**
 * Creates an adapter for top-level Item collection search.
 */
export function createItemSearchAdapter(environment: SearchAdapterEnvironment): SearchAdapter {
  return {
    type: "Item",
    search: async query => {
      const documents = await searchCollection(environment.collection, query.query);
      return documents
        .filter(document => canViewDocument(document, environment.user))
        .filter(document => matchesSearchableDocument(document, query.normalizedQuery))
        .map(document => createWorldItemResult(document));
    }
  };
}

/**
 * Creates an adapter for actor-owned item search through observable actors.
 */
export function createOwnedItemSearchAdapter(
  environment: SearchAdapterEnvironment & { parentPane?: ActorSheetPaneId }
): SearchAdapter {
  const parentPane = environment.parentPane ?? "";

  return {
    type: "Item",
    search: async query => {
      const actors = await searchCollection(environment.collection, query.query, {
        includeFallbackNonNameMatches: true,
        preferCollectionSearch: false
      });
      const results: MobileSearchResult[] = [];

      for (const actor of actors) {
        if (!canViewDocument(actor, environment.user)) continue;

        for (const item of getCollectionContents(actor.items) as SearchableDocumentLike[]) {
          if (!canViewOwnedItem(item, actor, environment.user)) continue;
          if (!matchesSearchableDocument(item, query.normalizedQuery)) continue;
          results.push(createOwnedItemResult(item, actor, parentPane));
        }
      }

      return results;
    }
  };
}

/**
 * Creates an adapter for JournalEntry collection search.
 */
export function createJournalEntrySearchAdapter(environment: SearchAdapterEnvironment): SearchAdapter {
  return {
    type: "Journal Entry",
    search: async query => {
      const documents = await searchCollection(environment.collection, query.query);
      return documents
        .filter(document => canViewDocument(document, environment.user))
        .filter(document => matchesSearchableDocument(document, query.normalizedQuery))
        .map(document => createJournalEntryResult(document));
    }
  };
}

/**
 * Creates an adapter for visible JournalEntryPage search through visible journals.
 */
export function createJournalPageSearchAdapter(environment: SearchAdapterEnvironment): SearchAdapter {
  return {
    type: "Journal Page",
    search: async query => {
      const entries = await searchCollection(environment.collection, query.query, {
        includeFallbackNonNameMatches: true,
        preferCollectionSearch: false
      });
      const results: MobileSearchResult[] = [];

      for (const entry of entries) {
        if (!canViewDocument(entry, environment.user)) continue;

        for (const page of getCollectionContents(entry.pages) as SearchableJournalPageLike[]) {
          const pageWithParent = page.parent ? page : { ...page, parent: entry };
          if (!canViewJournalPage(pageWithParent, environment.user)) continue;
          if (!matchesJournalPage(pageWithParent, query.normalizedQuery)) continue;
          results.push(createJournalPageResult(pageWithParent, entry, query.normalizedQuery));
        }
      }

      return results;
    }
  };
}

/**
 * Creates an adapter for searchable compendium pack indexes.
 */
export function createCompendiumSearchAdapter(environment: CompendiumSearchAdapterEnvironment): SearchAdapter {
  return {
    type: "Compendium",
    types: ["Character", "Item", "Spell", "Journal Entry"],
    search: async query => {
      const results: MobileSearchResult[] = [];

      for (const pack of getCollectionContents(environment.packs) as SearchableCompendiumPack[]) {
        if (pack.visible === false || !isSupportedCompendiumPack(pack)) continue;

        const entries = await getCompendiumIndexEntries(pack);
        for (const entry of entries) {
          if (!matchesCompendiumIndexEntry(entry, query.normalizedQuery)) continue;
          const result = createCompendiumResult(pack, entry);
          if (result) results.push(result);
        }
      }

      return results;
    }
  };
}

/**
 * Converts a selected normalized search result into the mobile-native route it opens.
 */
export function createRouteForSearchResult(result: MobileSearchResult): MobileRoute {
  if (result.route) return result.route;

  switch (result.type) {
    case "Character":
      return { view: RouteView.Character, actorUuid: result.uuid };
    case "Journal Entry":
      return { view: RouteView.Journal, entryUuid: result.uuid };
    case "Journal Page":
      return result.parentUuid ? { view: RouteView.Journal, entryUuid: result.parentUuid, pageUuid: result.uuid } : createDocumentDetailRoute(result);
    default:
      return createDocumentDetailRoute(result);
  }
}

async function runSearch(adapters: SearchAdapter[], query: MobileSearchQuery): Promise<MobileSearchResponse> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return {
      query: "",
      typeFilter: query.typeFilter ?? ALL_SEARCH_RESULT_TYPES,
      results: [],
      errors: []
    };
  }

  const selectedAdapters = adapters.filter(adapter => shouldRunAdapter(adapter, normalizedQuery));
  const errors: SearchAdapterError[] = [];
  const adapterResults = await Promise.all(
    selectedAdapters.map(async adapter => {
      try {
        return await adapter.search(normalizedQuery);
      } catch (error) {
        errors.push({
          adapterType: adapter.type,
          message: error instanceof Error ? error.message : "Search adapter failed."
        });
        return [];
      }
    })
  );

  const results = sortSearchResults(filterResultsByType(deduplicateSearchResults(adapterResults.flat()), normalizedQuery.typeFilter), normalizedQuery.normalizedQuery);
  return {
    query: normalizedQuery.query,
    typeFilter: normalizedQuery.typeFilter,
    results,
    errors
  };
}

function normalizeSearchQuery(query: MobileSearchQuery): NormalizedMobileSearchQuery | null {
  const trimmedQuery = query.query.trim().replace(/\s+/g, " ");
  if (!isUsableSearchQuery(trimmedQuery)) return null;

  return {
    query: trimmedQuery,
    normalizedQuery: normalizeForSearch(trimmedQuery),
    typeFilter: query.typeFilter || ALL_SEARCH_RESULT_TYPES
  };
}

function shouldRunAdapter(adapter: SearchAdapter, query: NormalizedMobileSearchQuery): boolean {
  const adapterTypes = getAdapterTypes(adapter);
  if (query.typeFilter !== ALL_SEARCH_RESULT_TYPES && !adapterTypes.includes(query.typeFilter)) return false;
  return adapter.canSearch?.(query) ?? true;
}

function getAdapterResultTypes(adapters: SearchAdapter[]): SearchResultType[] {
  return [...new Set(adapters.flatMap(getAdapterTypes).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function getAdapterTypes(adapter: SearchAdapter): SearchResultType[] {
  return adapter.types?.length ? adapter.types : [adapter.type];
}

function filterResultsByType(results: MobileSearchResult[], typeFilter: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES): MobileSearchResult[] {
  return typeFilter === ALL_SEARCH_RESULT_TYPES ? results : results.filter(result => result.type === typeFilter);
}

async function searchCollection<TDocument extends SearchableDocumentLike>(
  collection: SearchableCollection<TDocument> | undefined | null,
  query: string,
  options: { includeFallbackNonNameMatches?: boolean; preferCollectionSearch?: boolean } = {}
): Promise<TDocument[]> {
  const normalizedQuery = normalizeForSearch(query);
  const collectionObject = getObject(collection);
  const search = collectionObject?.search;
  if (options.preferCollectionSearch !== false && typeof search === "function") {
    // Foundry v14 world collections expose search({ query, filters, exclude }).
    // Filters/exclusions are adapter-specific and intentionally omitted here.
    const results = await search.call(collection, { query });
    if (Array.isArray(results)) {
      // Some Foundry collection implementations only return matches once the
      // query reaches a longer internal threshold (commonly 3+ chars). Keep
      // a local fallback for shorter queries so global search stays responsive
      // at the addon policy minimum (1 char).
      if (results.length > 0 || normalizedQuery.length >= 3 || options.includeFallbackNonNameMatches) {
        return results as TDocument[];
      }
    }
  }

  const contents = getCollectionContents(collection) as TDocument[];
  if (options.includeFallbackNonNameMatches) return contents;

  return contents.filter(document => matchesSearchableDocument(document, normalizedQuery));
}

function createActorResult(document: SearchableDocumentLike): MobileSearchResult {
  const uuid = requireUuid(document);
  return {
    uuid,
    type: "Character",
    name: getDocumentName(document, "Character"),
    icon: document.img ?? null,
    source: getSourceLabel(document.type),
    route: { view: RouteView.Character, actorUuid: uuid }
  };
}

function createWorldItemResult(document: SearchableDocumentLike): MobileSearchResult {
  const uuid = requireUuid(document);
  return {
    uuid,
    type: "Item",
    name: getDocumentName(document, "Item"),
    icon: document.img ?? null,
    source: getSourceLabel(document.type),
    route: {
      view: RouteView.DocumentDetail,
      documentUuid: uuid,
      documentType: "item"
    }
  };
}

function createOwnedItemResult(item: SearchableDocumentLike, actor: SearchableDocumentLike, parentPane: ActorSheetPaneId): MobileSearchResult {
  const uuid = requireUuid(item);
  const actorUuid = requireUuid(actor);
  const actorName = getDocumentName(actor, "Character");

  return {
    uuid,
    type: "Item",
    name: getDocumentName(item, "Item"),
    icon: item.img ?? null,
    source: `Owned by ${actorName}`,
    parentUuid: actorUuid,
    parentName: actorName,
    route: {
      view: RouteView.OwnedDocument,
      actorUuid,
      documentUuid: uuid,
      parentPane
    }
  };
}

function createJournalEntryResult(document: SearchableDocumentLike): MobileSearchResult {
  const uuid = requireUuid(document);
  return {
    uuid,
    type: "Journal Entry",
    name: getDocumentName(document, "Journal Entry"),
    icon: document.img ?? null,
    route: {
      view: RouteView.Journal,
      entryUuid: uuid
    }
  };
}

function createJournalPageResult(page: SearchableJournalPageLike, entry: SearchableDocumentLike, normalizedQuery: string): MobileSearchResult {
  const uuid = requireUuid(page);
  const entryUuid = requireUuid(entry);
  const entryName = getDocumentName(entry, "Journal Entry");

  return {
    uuid,
    type: "Journal Page",
    name: getDocumentName(page, "Journal Page"),
    icon: page.img ?? page.src ?? null,
    source: entryName,
    snippet: createSnippet(getJournalPageSearchText(page), normalizedQuery),
    parentUuid: entryUuid,
    parentName: entryName,
    route: {
      view: RouteView.Journal,
      entryUuid,
      pageUuid: uuid
    }
  };
}

function createDocumentDetailRoute(result: MobileSearchResult): MobileRoute {
  return {
    view: RouteView.DocumentDetail,
    documentUuid: result.uuid,
    documentType: getDocumentTypeFromResultType(result.type)
  };
}

function getDocumentTypeFromResultType(type: string): Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"] {
  switch (type) {
    case "Character":
      return "character";
    case "Spell":
    case "Item":
      return "item";
    case "Journal Entry":
      return "journal-entry";
    case "Journal Page":
      return "journal-page";
    default:
      return "unknown";
  }
}

function isSupportedCompendiumPack(pack: SearchableCompendiumPack): boolean {
  const documentName = getCompendiumDocumentName(pack);
  return documentName === "Actor" || documentName === "Item" || documentName === "JournalEntry";
}

async function getCompendiumIndexEntries(pack: SearchableCompendiumPack): Promise<SearchableCompendiumIndexEntry[]> {
  if (pack.getIndex) {
    const index = await pack.getIndex({ fields: ["name", "img", "type", "uuid"] });
    return getCollectionContents(index) as SearchableCompendiumIndexEntry[];
  }

  return getCollectionContents(pack.index) as SearchableCompendiumIndexEntry[];
}

function matchesCompendiumIndexEntry(entry: SearchableCompendiumIndexEntry, normalizedQuery: string): boolean {
  return normalizeForSearch(getString(entry.name)).includes(normalizedQuery);
}

function createCompendiumResult(pack: SearchableCompendiumPack, entry: SearchableCompendiumIndexEntry): MobileSearchResult | null {
  const uuid = getCompendiumEntryUuid(pack, entry);
  if (!uuid) return null;

  const resultType = getCompendiumResultType(pack, entry);
  return {
    uuid,
    type: resultType,
    name: getString(entry.name) || resultType,
    icon: entry.img ?? null,
    source: getCompendiumPackLabel(pack),
    route: {
      view: RouteView.DocumentDetail,
      documentUuid: uuid,
      documentType: getDocumentTypeFromResultType(resultType),
      ...(getCompendiumPackLabel(pack) ? { source: getCompendiumPackLabel(pack) ?? undefined } : {})
    }
  };
}

function getCompendiumResultType(pack: SearchableCompendiumPack, entry: SearchableCompendiumIndexEntry): SearchResultType {
  const documentName = entry.documentName ?? getCompendiumDocumentName(pack);
  if (documentName === "Actor") return "Character";
  if (documentName === "JournalEntry") return "Journal Entry";
  if (documentName === "Item" && entry.type === "spell") return "Spell";
  if (documentName === "Item") return "Item";
  return "Compendium";
}

function getCompendiumEntryUuid(pack: SearchableCompendiumPack, entry: SearchableCompendiumIndexEntry): string {
  const uuid = getString(entry.uuid);
  if (uuid) return uuid;

  const id = getString(entry._id) || getString(entry.id);
  const collection = getString(pack.collection);
  const documentName = getString(entry.documentName) || getCompendiumDocumentName(pack);
  if (!id || !collection || !documentName) return "";

  return `Compendium.${collection}.${documentName}.${id}`;
}

function getCompendiumDocumentName(pack: SearchableCompendiumPack): string {
  return getString(pack.documentName) || getString(pack.metadata?.type);
}

function getCompendiumPackLabel(pack: SearchableCompendiumPack): string | null {
  return getString(pack.metadata?.label) || getString(pack.collection) || null;
}

function canViewOwnedItem(item: SearchableDocumentLike, actor: SearchableDocumentLike, user: FoundryUserLike): boolean {
  // Actor-owned items normally inherit useful visibility from the parent actor.
  // If the embedded item exposes its own permission API, honor that as well.
  return canViewDocument(actor, user) && (!hasPermissionApi(item) || canViewDocument(item, user));
}

function hasPermissionApi(document: SearchableDocumentLike): boolean {
  return typeof document.testUserPermission === "function" || typeof document.getUserLevel === "function";
}

function matchesSearchableDocument(document: SearchableDocumentLike, normalizedQuery: string): boolean {
  return normalizeForSearch(getDocumentName(document, "")).includes(normalizedQuery);
}

function matchesJournalPage(page: SearchableJournalPageLike, normalizedQuery: string): boolean {
  return matchesSearchableDocument(page, normalizedQuery) || normalizeForSearch(getJournalPageSearchText(page)).includes(normalizedQuery);
}

function getJournalPageSearchText(page: SearchableJournalPageLike): string {
  return getString(page.text?.content) || getString(getObject(page.system)?.content);
}

function deduplicateSearchResults(results: MobileSearchResult[]): MobileSearchResult[] {
  const seen = new Set<string>();
  const deduplicated: MobileSearchResult[] = [];

  for (const result of results) {
    if (!result.uuid || seen.has(result.uuid)) continue;
    seen.add(result.uuid);
    deduplicated.push(result);
  }

  return deduplicated;
}

function sortSearchResults(results: MobileSearchResult[], normalizedQuery: string): MobileSearchResult[] {
  return [...results].sort((left, right) => {
    const leftScore = getSortScore(left, normalizedQuery);
    const rightScore = getSortScore(right, normalizedQuery);
    if (leftScore !== rightScore) return leftScore - rightScore;

    const typeComparison = left.type.localeCompare(right.type);
    if (typeComparison !== 0) return typeComparison;

    return left.name.localeCompare(right.name);
  });
}

function getSortScore(result: MobileSearchResult, normalizedQuery: string): number {
  const name = normalizeForSearch(result.name);
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  return 3;
}

function createSnippet(text: string, normalizedQuery: string): string | null {
  if (!text) return null;

  const normalizedText = normalizeForSearch(text);
  const index = normalizedText.indexOf(normalizedQuery);
  if (index < 0) return null;

  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, index + normalizedQuery.length + 48);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD");
}

function getDocumentName(document: SearchableDocumentLike, fallback: string): string {
  return getString(document.name) || fallback;
}

function getSourceLabel(value: string | undefined): string | null {
  const source = getString(value);
  return source ? source : null;
}

function requireUuid(document: SearchableDocumentLike): string {
  const uuid = getString(document.uuid);
  if (uuid) return uuid;

  const id = getString(document.id);
  if (document.documentName && id) return `${document.documentName}.${id}`;
  return id;
}
