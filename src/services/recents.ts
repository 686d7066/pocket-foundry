import { getInitials } from "../core/utils.ts";
import { cloneRoute, RouteView, type MobileRoute } from "../router/routes.ts";
import { createDocumentLookupService, type DocumentLookupEnvironment, type DocumentLookupService } from "./document-lookup.ts";
import { RECENT_ROUTES_SETTING } from "../core/settings.ts";
import { createFoundrySystemUserSettingStorage, type FoundryScopedSettingStorage } from "./foundry-settings-storage.ts";
import { createLocalStorageKey, readLocalStorage, writeLocalStorage, type LocalStorageCodec, type LocalStorageKey } from "./local-storage.ts";

const MAX_RECENT_ROUTES = 20;

export type RecentRouteRecord = {
  route: MobileRoute;
  lastOpened: number;
};

export type RecentRouteRowViewModel = {
  id: string;
  kind: "character" | "item" | "journal-entry" | "journal-page" | "document";
  rowClass: string;
  title: string;
  subtitle: string;
  icon: string | null;
  iconText: string;
  actionLabel: "Open" | "Read" | "Search";
  lastOpenedLabel: string;
  route: MobileRoute;
};

export type RecentsViewModel = {
  rows: RecentRouteRowViewModel[];
  hasRows: boolean;
};

export type MobileRecentsService = {
  recordRoute: (route: MobileRoute, openedAt?: number) => Promise<void>;
  clearRoutes: () => Promise<void>;
  listRows: () => Promise<RecentRouteRowViewModel[]>;
  getRouteById: (id: string) => Promise<MobileRoute | null>;
};

export type RecentRouteRecordStorage = FoundryScopedSettingStorage<RecentRouteRecord[]>;

export const recentRouteRecordsCodec: LocalStorageCodec<RecentRouteRecord[]> = {
  parse: value => {
    try {
      return parseRecentRouteRecords(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  },
  serialize: value => JSON.stringify(normalizeRecentRouteRecords(value))
};

export const recentRouteRecordsSettingCodec = {
  parse: parseRecentRouteRecords,
  sanitize: normalizeRecentRouteRecords
};

/**
 * Creates a localStorage key for legacy tests and browser-local fallbacks.
 */
export function createRecentRoutesStorageKey(scope: Array<string | undefined> = []): LocalStorageKey<RecentRouteRecord[]> {
  return createLocalStorageKey({
    namespace: "recentRoutes",
    scope,
    codec: recentRouteRecordsCodec
  });
}

/**
 * Creates Foundry world-setting backed recent route storage for the current system and user.
 */
export function createFoundryRecentRouteRecordStorage(): RecentRouteRecordStorage {
  return createFoundrySystemUserSettingStorage({
    settingKey: RECENT_ROUTES_SETTING,
    codec: recentRouteRecordsSettingCodec,
    defaultValue: () => []
  });
}

/**
 * Creates a recents service backed by either Foundry settings or a local fallback key.
 */
export function createMobileRecentsService(options: {
  storage?: RecentRouteRecordStorage;
  storageKey?: LocalStorageKey<RecentRouteRecord[]>;
  lookupEnvironment?: DocumentLookupEnvironment;
  now?: () => number;
}): MobileRecentsService {
  const now = options.now ?? Date.now;
  const storage = options.storage ?? createLocalRecentRouteRecordStorage(options.storageKey);

  return {
    recordRoute: async (route, openedAt = now()) => {
      if (!isRecentableRoute(route)) return;

      const records = dedupeRecentRouteRecords(storage.read());
      const identity = getRecentRouteIdentity(route);
      const nextRecords = [
        {
          route: cloneRoute(route),
          lastOpened: openedAt
        },
        ...records.filter(record => getRecentRouteIdentity(record.route) !== identity)
      ].slice(0, MAX_RECENT_ROUTES);

      await storage.write(nextRecords);
    },
    clearRoutes: async () => {
      await storage.write([]);
    },
    listRows: async () => {
      const records = dedupeRecentRouteRecords(storage.read());
      const lookup = createLookupService(options.lookupEnvironment);
      const rows = await Promise.all(records.map(record => buildRecentRouteRow(record, lookup)));
      return rows.filter((row): row is RecentRouteRowViewModel => Boolean(row));
    },
    getRouteById: async id => {
      const records = dedupeRecentRouteRecords(storage.read());
      const record = records.find(candidate => getRecentRouteId(candidate.route) === id);
      if (!record) return null;

      const lookup = createLookupService(options.lookupEnvironment);
      const row = await buildRecentRouteRow(record, lookup);
      return row ? cloneRoute(row.route) : null;
    }
  };
}

export async function buildRecentsViewModel(service: MobileRecentsService): Promise<RecentsViewModel> {
  const rows = await service.listRows();
  return {
    rows,
    hasRows: rows.length > 0
  };
}

export function getRecentRouteId(route: MobileRoute): string {
  return encodeURIComponent(JSON.stringify(getRecentRouteIdentitySnapshot(route)));
}

function createLocalRecentRouteRecordStorage(storageKey: LocalStorageKey<RecentRouteRecord[]> | undefined): RecentRouteRecordStorage {
  return {
    read: () => storageKey ? readLocalStorage(storageKey) ?? [] : [],
    write: async value => {
      if (storageKey) writeLocalStorage(storageKey, value);
      return normalizeRecentRouteRecords(value);
    }
  };
}

function dedupeRecentRouteRecords(records: RecentRouteRecord[]): RecentRouteRecord[] {
  const seen = new Set<string>();
  const deduped: RecentRouteRecord[] = [];

  for (const record of records) {
    const identity = getRecentRouteIdentity(record.route);
    if (seen.has(identity)) continue;

    seen.add(identity);
    deduped.push(record);
  }

  return deduped;
}

async function buildRecentRouteRow(record: RecentRouteRecord, lookup: DocumentLookupService | null): Promise<RecentRouteRowViewModel | null> {
  if (!isRecentableRoute(record.route)) return null;

  switch (record.route.view) {
    case RouteView.Character:
      return buildDocumentBackedRow({
        route: record.route,
        lastOpened: record.lastOpened,
        lookup,
        documentUuid: record.route.actorUuid,
        expectedType: "character",
        kind: "character",
        subtitle: "Character",
        actionLabel: "Open"
      });
    case RouteView.OwnedDocument:
      return buildOwnedDocumentRow(record.route, record.lastOpened, lookup);
    case RouteView.Journal:
      return buildJournalRow(record.route, record.lastOpened, lookup);
    case RouteView.DocumentDetail:
      return buildDocumentBackedRow({
        route: record.route,
        lastOpened: record.lastOpened,
        lookup,
        documentUuid: record.route.documentUuid,
        expectedType: record.route.documentType === "unknown" ? undefined : record.route.documentType,
        kind: getRecentKindForDocumentType(record.route.documentType),
        subtitle: record.route.source ? `${getDocumentTypeLabel(record.route.documentType)} - ${record.route.source}` : getDocumentTypeLabel(record.route.documentType),
        actionLabel: record.route.documentType === "journal-page" ? "Read" : "Open"
      });
    default:
      return null;
  }
}

async function buildOwnedDocumentRow(route: Extract<MobileRoute, { view: RouteView.OwnedDocument }>, lastOpened: number, lookup: DocumentLookupService | null): Promise<RecentRouteRowViewModel | null> {
  if (!lookup) return createFallbackRow(route, lastOpened, "Character Item", "Character Item", "Open");

  const [actor, document] = await Promise.all([
    lookup.lookupByUuid(route.actorUuid),
    lookup.lookupByUuid(route.documentUuid)
  ]);
  if (!actor.available || actor.documentType !== "character" || !document.available) return null;

  return {
    id: getRecentRouteId(route),
    kind: "item",
    rowClass: getRecentRowClass("item"),
    title: document.name,
    subtitle: `${document.displayType} - ${actor.name}`,
    icon: document.icon,
    iconText: getInitials(document.name, "I"),
    actionLabel: "Open",
    lastOpenedLabel: formatLastOpened(lastOpened),
    route: cloneRoute(route)
  };
}

async function buildJournalRow(route: Extract<MobileRoute, { view: RouteView.Journal }>, lastOpened: number, lookup: DocumentLookupService | null): Promise<RecentRouteRowViewModel | null> {
  if (!route.entryUuid) return null;
  if (!lookup) return createFallbackRow(route, lastOpened, route.pageUuid ? "Journal Page" : "Journal Entry", route.pageUuid ? "Journal Page" : "Journal Entry", route.pageUuid ? "Read" : "Open");

  const entry = await lookup.lookupByUuid(route.entryUuid);
  if (!entry.available || entry.documentType !== "journal-entry") return null;

  if (!route.pageUuid) {
    return {
      id: getRecentRouteId(route),
      kind: "journal-entry",
      rowClass: getRecentRowClass("journal-entry"),
      title: entry.name,
      subtitle: "Journal Entry",
      icon: entry.icon,
      iconText: getInitials(entry.name, "J"),
      actionLabel: "Open",
      lastOpenedLabel: formatLastOpened(lastOpened),
      route: cloneRoute(route)
    };
  }

  const page = await lookup.lookupByUuid(route.pageUuid);
  if (!page.available || page.documentType !== "journal-page") return null;

  return {
    id: getRecentRouteId(route),
    kind: "journal-page",
    rowClass: getRecentRowClass("journal-page"),
    title: page.name,
    subtitle: `Journal Page - ${entry.name}`,
    icon: page.icon,
    iconText: getInitials(page.name, "P"),
    actionLabel: "Read",
    lastOpenedLabel: formatLastOpened(lastOpened),
    route: cloneRoute(route)
  };
}

async function buildDocumentBackedRow(options: {
  route: MobileRoute;
  lastOpened: number;
  lookup: DocumentLookupService | null;
  documentUuid: string;
  expectedType?: string;
  kind: RecentRouteRowViewModel["kind"];
  subtitle: string;
  actionLabel: "Open" | "Read";
}): Promise<RecentRouteRowViewModel | null> {
  if (!options.lookup) return createFallbackRow(options.route, options.lastOpened, options.subtitle, options.subtitle, options.actionLabel);

  const document = await options.lookup.lookupByUuid(options.documentUuid);
  if (!document.available) return null;
  if (options.expectedType && document.documentType !== options.expectedType) return null;

  return {
    id: getRecentRouteId(options.route),
    kind: options.kind,
    rowClass: getRecentRowClass(options.kind),
    title: document.name,
    subtitle: options.subtitle,
    icon: document.icon,
    iconText: getInitials(document.name, document.displayType[0] ?? "?"),
    actionLabel: options.actionLabel,
    lastOpenedLabel: formatLastOpened(options.lastOpened),
    route: cloneRoute(options.route)
  };
}

function createFallbackRow(
  route: MobileRoute,
  lastOpened: number,
  title: string,
  subtitle: string,
  actionLabel: "Open" | "Read" | "Search"
): RecentRouteRowViewModel {
  return {
    id: getRecentRouteId(route),
    kind: getRecentKindFromSubtitle(subtitle),
    rowClass: getRecentRowClass(getRecentKindFromSubtitle(subtitle)),
    title,
    subtitle,
    icon: null,
    iconText: getInitials(title, "?"),
    actionLabel,
    lastOpenedLabel: formatLastOpened(lastOpened),
    route: cloneRoute(route)
  };
}

function getRecentKindForDocumentType(documentType: Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"]): RecentRouteRowViewModel["kind"] {
  switch (documentType) {
    case "character":
      return "character";
    case "item":
      return "item";
    case "journal-entry":
      return "journal-entry";
    case "journal-page":
      return "journal-page";
    case "unknown":
      return "document";
  }
}

function getRecentKindFromSubtitle(subtitle: string): RecentRouteRowViewModel["kind"] {
  if (subtitle.includes("Character")) return "character";
  if (subtitle.includes("Journal Page")) return "journal-page";
  if (subtitle.includes("Journal Entry")) return "journal-entry";
  if (subtitle.includes("Item")) return "item";
  return "document";
}

function getRecentRowClass(kind: RecentRouteRowViewModel["kind"]): string {
  switch (kind) {
    case "character":
      return "character-picker-row";
    case "item":
      return "recent-item-row";
    case "journal-entry":
    case "journal-page":
      return "journal-page-row";
    case "document":
      return "";
  }
}

function createLookupService(environment: DocumentLookupEnvironment | undefined): DocumentLookupService | null {
  return environment ? createDocumentLookupService(environment) : null;
}

function isRecentableRoute(route: MobileRoute): boolean {
  if (route.view === RouteView.Character) return Boolean(route.actorUuid);
  if (route.view === RouteView.OwnedDocument) return Boolean(route.actorUuid && route.documentUuid);
  if (route.view === RouteView.Journal) return Boolean(route.entryUuid);
  if (route.view === RouteView.DocumentDetail) return Boolean(route.documentUuid);
  return false;
}

function getRecentRouteIdentity(route: MobileRoute): string {
  return JSON.stringify(getRecentRouteIdentitySnapshot(route));
}

function getRecentRouteIdentitySnapshot(route: MobileRoute): MobileRoute {
  switch (route.view) {
    case RouteView.Combat:
      return {
        view: route.view
      };
    case RouteView.Character:
      return {
        view: route.view,
        actorUuid: route.actorUuid
      };
    case RouteView.OwnedDocument:
      return {
        view: route.view,
        actorUuid: route.actorUuid,
        documentUuid: route.documentUuid,
        parentPane: route.parentPane
      };
    case RouteView.Journal:
      return {
        view: route.view,
        ...(route.entryUuid === undefined ? {} : { entryUuid: route.entryUuid }),
        ...(route.pageUuid === undefined ? {} : { pageUuid: route.pageUuid }),
        ...(route.query === undefined ? {} : { query: route.query })
      };
    case RouteView.Search:
      return {
        view: route.view,
        query: route.query,
        ...(route.typeFilter === undefined ? {} : { typeFilter: route.typeFilter })
      };
    case RouteView.DocumentDetail:
      return {
        view: route.view,
        documentUuid: route.documentUuid,
        documentType: route.documentType,
        ...(route.source === undefined ? {} : { source: route.source })
      };
    default:
      return cloneRoute(route);
  }
}

function parseRecentRouteRecord(value: unknown): RecentRouteRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RecentRouteRecord>;
  if (!candidate.route || !isMobileRoute(candidate.route)) return null;
  const lastOpened = Number(candidate.lastOpened);
  if (!Number.isFinite(lastOpened)) return null;
  return {
    route: cloneRoute(candidate.route),
    lastOpened
  };
}

function parseRecentRouteRecords(value: unknown): RecentRouteRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return normalizeRecentRouteRecords(value);
}

function normalizeRecentRouteRecords(value: unknown[]): RecentRouteRecord[] {
  return value
    .map(parseRecentRouteRecord)
    .filter((record): record is RecentRouteRecord => Boolean(record))
    .slice(0, MAX_RECENT_ROUTES);
}

function isMobileRoute(value: unknown): value is MobileRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<MobileRoute>;
  return Object.values(RouteView).includes(route.view as RouteView);
}

function getDocumentTypeLabel(documentType: Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"]): string {
  switch (documentType) {
    case "character":
      return "Character";
    case "item":
      return "Item";
    case "journal-entry":
      return "Journal Entry";
    case "journal-page":
      return "Journal Page";
    case "unknown":
      return "Document";
  }
}

function formatLastOpened(lastOpened: number): string {
  if (!Number.isFinite(lastOpened)) return "";
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return formatter.format(new Date(lastOpened));
}
