import { getCollectionContents, getObject, getNumber, getString } from "../core/utils.ts";
import { RouteView, type MobileRoute } from "../router/routes.ts";
import {
  FOUNDRY_PERMISSION_LEVELS,
  canUpdateDocument,
  canViewDocument,
  canViewJournalPage,
  getDocumentUserLevel,
  type FoundryUserLike,
  type PermissionCheckedDocument
} from "./permissions.ts";

export type JournalPageType = "text" | "image" | "pdf" | "video" | "unsupported";

export type JournalEntryDocumentLike = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  _id?: string;
  name?: string;
  img?: string | null;
  documentName?: string;
  sort?: number;
  isOwner?: boolean;
  pages?: Iterable<JournalPageDocumentLike> | { contents?: JournalPageDocumentLike[] };
  createEmbeddedDocuments?: (embeddedName: string, data?: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<JournalPageDocumentLike[]>;
  sheet?: {
    render?: (options?: unknown, legacyOptions?: Record<string, unknown>) => unknown;
  };
};

export type JournalPageDocumentLike = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  _id?: string;
  name?: string;
  documentName?: string;
  parent?: JournalEntryDocumentLike | null;
  type?: string;
  sort?: number;
  category?: string | null;
  title?: { show?: boolean; level?: number } | string | null;
  text?: {
    content?: string;
    format?: number;
    markdown?: string;
  };
  src?: string | null;
  image?: unknown;
  video?: unknown;
  system?: unknown;
  img?: string | null;
  isOwner?: boolean;
  update?: (data: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  delete?: (options?: Record<string, unknown>) => Promise<unknown>;
  sheet?: {
    render?: (options?: unknown, legacyOptions?: Record<string, unknown>) => unknown;
  };
};

export type JournalTextEnricher = (
  value: string,
  options: {
    async: true;
    secrets: boolean;
    relativeTo: JournalPageDocumentLike;
  }
) => Promise<string> | string;

export type JournalUuidResolver = {
  // Foundry/test lookup paths may report "not found" as either null or
  // undefined; keep both at the boundary and normalize downstream.
  fromUuid: (uuid: string) => Promise<JournalEntryDocumentLike | JournalPageDocumentLike | null | undefined>;
};

export type JournalPageDraftType = "text" | "image" | "pdf" | "video";

export type JournalPageDraft = {
  name: string;
  type: JournalPageDraftType;
  textContent?: string;
  src?: string;
};

export type JournalServiceEnvironment = JournalUuidResolver & {
  // Collection availability varies by lifecycle and fixture setup, so absent
  // collections are accepted as either null or undefined.
  collection: Iterable<JournalEntryDocumentLike> | { contents?: JournalEntryDocumentLike[] } | null | undefined;
  user: FoundryUserLike;
  enrichHtml?: JournalTextEnricher;
  canCreatePage?: (user: FoundryUserLike, entry?: JournalEntryDocumentLike | null) => boolean;
  createPageDialog?: (entry: JournalEntryDocumentLike) => Promise<JournalPageDocumentLike | null | undefined>;
  createPageData?: (entry: JournalEntryDocumentLike, data: Record<string, unknown>) => Promise<JournalPageDocumentLike | null | undefined>;
  updatePageData?: (page: JournalPageDocumentLike, data: Record<string, unknown>) => Promise<unknown>;
  openPageEditor?: (page: JournalPageDocumentLike) => Promise<boolean> | boolean;
};

export type JournalEntrySummaryViewModel = {
  uuid: string;
  id: string;
  name: string;
  icon: string | null;
  visiblePageCount: number;
  route: MobileRoute;
};

export type JournalPageSummaryViewModel = {
  uuid: string;
  id: string;
  name: string;
  type: string;
  pageType: JournalPageType;
  sort: number;
  category: string | null;
  canView: true;
  canUpdate: boolean;
  canDelete: boolean;
  route: MobileRoute;
};

export type JournalEntryViewModel = {
  unavailable: false;
  uuid: string;
  id: string;
  name: string;
  icon: string | null;
  visiblePages: JournalPageSummaryViewModel[];
  selectedPageUuid: string | null;
  canCreatePage: boolean;
  route: MobileRoute;
};

export type JournalTextPageViewModel = JournalPageSummaryViewModel & {
  unavailable: false;
  pageType: "text";
  entryUuid: string;
  entryName: string;
  title: string;
  textHtml: string;
  textSource: string;
  textFormat: number | null;
  textMarkdown: string | null;
};

export type JournalMediaPageViewModel = JournalPageSummaryViewModel & {
  unavailable: false;
  pageType: "image" | "pdf" | "video";
  entryUuid: string;
  entryName: string;
  title: string;
  src: string;
  image: unknown;
  video: unknown;
};

export type JournalUnsupportedPageViewModel = JournalPageSummaryViewModel & {
  unavailable: false;
  pageType: "unsupported";
  entryUuid: string;
  entryName: string;
  title: string;
  unsupported: true;
};

export type JournalPageViewModel = JournalTextPageViewModel | JournalMediaPageViewModel | JournalUnsupportedPageViewModel;

export type UnavailableJournalViewModel = {
  unavailable: true;
  title: "Journal Unavailable";
  body: "This journal content is not available to the current user.";
};

export type JournalRouteResolution = {
  route: MobileRoute;
  entry: JournalEntryViewModel | UnavailableJournalViewModel;
  page: JournalPageViewModel | UnavailableJournalViewModel | null;
};

export type MobileJournalService = {
  listEntries: () => JournalEntrySummaryViewModel[];
  lookupEntry: (entryUuid: string, selectedPageUuid?: string | null) => Promise<JournalEntryViewModel | UnavailableJournalViewModel>;
  lookupPage: (pageUuid: string, expectedEntryUuid?: string | null) => Promise<JournalPageViewModel | UnavailableJournalViewModel>;
  resolveRoute: (route: Extract<MobileRoute, { view: RouteView.Journal }>) => Promise<JournalRouteResolution>;
  createRouteForDocumentLink: (uuid: string, parentRoute?: MobileRoute) => Promise<MobileRoute | null>;
  createPage: (entryUuid: string) => Promise<JournalPageMutationResult>;
  createPageFromDraft: (entryUuid: string, draft: JournalPageDraft) => Promise<JournalPageMutationResult>;
  deletePage: (pageUuid: string, expectedEntryUuid?: string | null) => Promise<JournalPageMutationResult>;
  updatePageFromDraft: (pageUuid: string, expectedEntryUuid: string | null | undefined, draft: JournalPageDraft) => Promise<JournalPageMutationResult>;
  openPageEditor: (pageUuid: string, expectedEntryUuid?: string | null) => Promise<JournalPageMutationResult>;
};

export type JournalPageMutationResult = {
  ok: boolean;
  route?: MobileRoute;
  reason?: "forbidden" | "invalid" | "missing" | "upload-failed" | "unsupported";
};

export function createMobileJournalService(environment: JournalServiceEnvironment): MobileJournalService {
  return {
    listEntries: () => listVisibleEntries(environment),
    lookupEntry: (entryUuid, selectedPageUuid) => lookupEntry(environment, entryUuid, selectedPageUuid),
    lookupPage: (pageUuid, expectedEntryUuid) => lookupPage(environment, pageUuid, expectedEntryUuid),
    resolveRoute: route => resolveJournalRoute(environment, route),
    createRouteForDocumentLink: (uuid, parentRoute) => createRouteForDocumentLink(environment, uuid, parentRoute),
    createPage: entryUuid => createPage(environment, entryUuid),
    createPageFromDraft: (entryUuid, draft) => createPageFromDraft(environment, entryUuid, draft),
    deletePage: (pageUuid, expectedEntryUuid) => deletePage(environment, pageUuid, expectedEntryUuid),
    updatePageFromDraft: (pageUuid, expectedEntryUuid, draft) => updatePageFromDraft(environment, pageUuid, expectedEntryUuid, draft),
    openPageEditor: (pageUuid, expectedEntryUuid) => openPageEditor(environment, pageUuid, expectedEntryUuid)
  };
}

export function createJournalUnavailableState(): UnavailableJournalViewModel {
  return {
    unavailable: true,
    title: "Journal Unavailable",
    body: "This journal content is not available to the current user."
  };
}

export function buildJournalEntryViewModel(options: {
  entry: JournalEntryDocumentLike | null | undefined;
  user: FoundryUserLike;
  selectedPageUuid?: string | null;
  canCreatePage?: (user: FoundryUserLike, entry?: JournalEntryDocumentLike | null) => boolean;
}): JournalEntryViewModel | UnavailableJournalViewModel {
  const entry = options.entry;
  if (!entry || !canViewDocument(entry, options.user)) return createJournalUnavailableState();

  const visiblePages = getVisiblePages(entry, options.user).map(page => buildPageSummary(page, entry, options.user));
  const selectedPageUuid = normalizeSelectedPageUuid(visiblePages, options.selectedPageUuid);

  return {
    unavailable: false,
    uuid: getEntryUuid(entry),
    id: getDocumentId(entry),
    name: getDocumentName(entry, "Journal Entry"),
    icon: entry.img ?? null,
    visiblePages,
    selectedPageUuid,
    canCreatePage: canCreateJournalPage(entry, options.user, options.canCreatePage),
    route: { view: RouteView.Journal, entryUuid: getEntryUuid(entry), ...(selectedPageUuid ? { pageUuid: selectedPageUuid } : {}) }
  };
}

async function createPage(environment: JournalServiceEnvironment, entryUuid: string): Promise<JournalPageMutationResult> {
  const document = await safeFromUuid(environment, entryUuid);
  const entry = isJournalPage(document) ? document.parent : document;
  if (!entry || !canViewDocument(entry, environment.user)) return { ok: false, reason: "missing" };
  if (!canCreateJournalPage(entry, environment.user, environment.canCreatePage)) return { ok: false, reason: "forbidden" };
  if (!environment.createPageDialog) return { ok: false, reason: "unsupported" };

  const page = await environment.createPageDialog(entry);
  if (!page) return { ok: true, route: { view: RouteView.Journal, entryUuid: getEntryUuid(entry) } };

  const pageUuid = getPageUuid(page.parent ? page : { ...page, parent: entry });
  return {
    ok: true,
    route: { view: RouteView.Journal, entryUuid: getEntryUuid(entry), pageUuid, scrollTop: 0 }
  };
}

async function createPageFromDraft(
  environment: JournalServiceEnvironment,
  entryUuid: string,
  draft: JournalPageDraft
): Promise<JournalPageMutationResult> {
  const document = await safeFromUuid(environment, entryUuid);
  const entry = isJournalPage(document) ? document.parent : document;
  if (!entry || !canViewDocument(entry, environment.user)) return { ok: false, reason: "missing" };
  if (!canCreateJournalPage(entry, environment.user, environment.canCreatePage)) return { ok: false, reason: "forbidden" };

  const data = buildJournalPageData(draft);
  if (!data) return { ok: false, reason: "invalid" };

  const page = await createJournalPageDocument(environment, entry, data);
  if (!page) return { ok: false, reason: "unsupported" };

  const pageUuid = getPageUuid(page.parent ? page : { ...page, parent: entry });
  return {
    ok: true,
    route: { view: RouteView.Journal, entryUuid: getEntryUuid(entry), pageUuid, scrollTop: 0 }
  };
}

async function deletePage(
  environment: JournalServiceEnvironment,
  pageUuid: string,
  expectedEntryUuid?: string | null
): Promise<JournalPageMutationResult> {
  const document = await safeFromUuid(environment, pageUuid);
  if (!isJournalPage(document) || !document.parent) return { ok: false, reason: "missing" };
  if (expectedEntryUuid && getEntryUuid(document.parent) !== expectedEntryUuid) return { ok: false, reason: "missing" };
  if (!canViewJournalPage(document, environment.user)) return { ok: false, reason: "missing" };
  if (!canDeleteJournalPage(document, document.parent, environment.user)) return { ok: false, reason: "forbidden" };
  if (typeof document.delete !== "function") return { ok: false, reason: "unsupported" };

  const entryUuid = getEntryUuid(document.parent);
  await document.delete();
  return { ok: true, route: { view: RouteView.Journal, entryUuid } };
}

async function openPageEditor(
  environment: JournalServiceEnvironment,
  pageUuid: string,
  expectedEntryUuid?: string | null
): Promise<JournalPageMutationResult> {
  const document = await safeFromUuid(environment, pageUuid);
  if (!isJournalPage(document) || !document.parent) return { ok: false, reason: "missing" };
  if (expectedEntryUuid && getEntryUuid(document.parent) !== expectedEntryUuid) return { ok: false, reason: "missing" };
  if (!canViewJournalPage(document, environment.user)) return { ok: false, reason: "missing" };
  if (!canUpdateJournalPage(document, document.parent, environment.user)) return { ok: false, reason: "forbidden" };
  if (environment.openPageEditor) {
    return (await environment.openPageEditor(document))
      ? { ok: true, route: { view: RouteView.Journal, entryUuid: getEntryUuid(document.parent), pageUuid: getPageUuid(document) } }
      : { ok: false, reason: "unsupported" };
  }

  if (typeof document.sheet?.render === "function") {
    document.sheet.render({ force: true });
    return { ok: true, route: { view: RouteView.Journal, entryUuid: getEntryUuid(document.parent), pageUuid: getPageUuid(document) } };
  }

  if (typeof document.parent.sheet?.render === "function") {
    document.parent.sheet.render(true, { pageId: getDocumentId(document) });
    return { ok: true, route: { view: RouteView.Journal, entryUuid: getEntryUuid(document.parent), pageUuid: getPageUuid(document) } };
  }

  return { ok: false, reason: "unsupported" };
}

async function updatePageFromDraft(
  environment: JournalServiceEnvironment,
  pageUuid: string,
  expectedEntryUuid: string | null | undefined,
  draft: JournalPageDraft
): Promise<JournalPageMutationResult> {
  const document = await safeFromUuid(environment, pageUuid);
  if (!isJournalPage(document) || !document.parent) return { ok: false, reason: "missing" };
  if (expectedEntryUuid && getEntryUuid(document.parent) !== expectedEntryUuid) return { ok: false, reason: "missing" };
  if (!canViewJournalPage(document, environment.user)) return { ok: false, reason: "missing" };
  if (!canUpdateJournalPage(document, document.parent, environment.user)) return { ok: false, reason: "forbidden" };

  const data = buildJournalPageData(draft);
  if (!data) return { ok: false, reason: "invalid" };

  if (environment.updatePageData) await environment.updatePageData(document, data);
  else if (typeof document.update === "function") await document.update(data);
  else return { ok: false, reason: "unsupported" };

  return {
    ok: true,
    route: { view: RouteView.Journal, entryUuid: getEntryUuid(document.parent), pageUuid: getPageUuid(document), scrollTop: 0 }
  };
}

export async function buildJournalPageViewModel(options: {
  page: JournalPageDocumentLike | null | undefined;
  user: FoundryUserLike;
  enrichHtml?: JournalTextEnricher;
}): Promise<JournalPageViewModel | UnavailableJournalViewModel> {
  const page = options.page;
  const entry = page?.parent ?? null;
  if (!page || !entry || !canViewJournalPage(page, options.user)) return createJournalUnavailableState();

  const summary = buildPageSummary(page, entry, options.user);
  const title = getPageTitle(page);
  const entryUuid = getEntryUuid(entry);
  const entryName = getDocumentName(entry, "Journal Entry");

  if (summary.pageType === "text") {
    const textSource = getString(page.text?.content) || getString(getObject(page.system)?.content);
    return {
      ...summary,
      unavailable: false,
      pageType: "text",
      entryUuid,
      entryName,
      title,
      textHtml: await enrichJournalText(page, textSource, options.user, options.enrichHtml),
      textSource,
      textFormat: getNumber(page.text?.format),
      textMarkdown: getString(page.text?.markdown) || null
    };
  }

  if (summary.pageType === "image" || summary.pageType === "pdf" || summary.pageType === "video") {
    return {
      ...summary,
      unavailable: false,
      pageType: summary.pageType,
      entryUuid,
      entryName,
      title,
      src: getPageSource(page),
      image: page.image ?? null,
      video: page.video ?? null
    };
  }

  return {
    ...summary,
    unavailable: false,
    pageType: "unsupported",
    entryUuid,
    entryName,
    title,
    unsupported: true
  };
}

export function createJournalPageRoute(entryUuid: string, pageUuid: string, scrollTop?: number): MobileRoute {
  return {
    view: RouteView.Journal,
    entryUuid,
    pageUuid,
    ...(scrollTop === undefined ? {} : { scrollTop })
  };
}

function listVisibleEntries(environment: JournalServiceEnvironment): JournalEntrySummaryViewModel[] {
  return (getCollectionContents(environment.collection) as JournalEntryDocumentLike[])
    .filter(entry => canViewDocument(entry, environment.user))
    .sort(compareDocumentsBySortThenName)
    .map(entry => ({
      uuid: getEntryUuid(entry),
      id: getDocumentId(entry),
      name: getDocumentName(entry, "Journal Entry"),
      icon: entry.img ?? null,
      visiblePageCount: getVisiblePages(entry, environment.user).length,
      route: { view: RouteView.Journal, entryUuid: getEntryUuid(entry) }
    }));
}

async function lookupEntry(
  environment: JournalServiceEnvironment,
  entryUuid: string,
  selectedPageUuid?: string | null
): Promise<JournalEntryViewModel | UnavailableJournalViewModel> {
  const document = await safeFromUuid(environment, entryUuid);
  const entry = isJournalPage(document) ? document.parent : document;
  return buildJournalEntryViewModel({ entry, user: environment.user, selectedPageUuid, canCreatePage: environment.canCreatePage });
}

async function lookupPage(
  environment: JournalServiceEnvironment,
  pageUuid: string,
  expectedEntryUuid?: string | null
): Promise<JournalPageViewModel | UnavailableJournalViewModel> {
  const document = await safeFromUuid(environment, pageUuid);
  if (!isJournalPage(document)) return createJournalUnavailableState();
  if (expectedEntryUuid && getEntryUuid(document.parent) !== expectedEntryUuid) return createJournalUnavailableState();
  return buildJournalPageViewModel({ page: document, user: environment.user, enrichHtml: environment.enrichHtml });
}

async function resolveJournalRoute(
  environment: JournalServiceEnvironment,
  route: Extract<MobileRoute, { view: RouteView.Journal }>
): Promise<JournalRouteResolution> {
  if (!route.entryUuid) {
    return {
      route,
      entry: createJournalUnavailableState(),
      page: null
    };
  }

  const entry = await lookupEntry(environment, route.entryUuid, route.pageUuid);
  if (entry.unavailable) return { route: { view: RouteView.Journal }, entry, page: null };

  const selectedPageUuid = entry.selectedPageUuid;
  const resolvedRoute = {
    view: RouteView.Journal,
    entryUuid: entry.uuid,
    ...(selectedPageUuid ? { pageUuid: selectedPageUuid } : {}),
    ...(route.query === undefined ? {} : { query: route.query }),
    ...(route.scrollTop === undefined ? {} : { scrollTop: route.scrollTop })
  } satisfies MobileRoute;

  return {
    route: resolvedRoute,
    entry,
    page: selectedPageUuid ? await lookupPage(environment, selectedPageUuid, entry.uuid) : null
  };
}

async function createRouteForDocumentLink(environment: JournalServiceEnvironment, uuid: string, parentRoute?: MobileRoute): Promise<MobileRoute | null> {
  const document = await safeFromUuid(environment, uuid);
  if (!document) return null;

  if (isJournalPage(document)) {
    if (!canViewJournalPage(document, environment.user) || !document.parent) return null;
    return {
      view: RouteView.Journal,
      entryUuid: getEntryUuid(document.parent),
      pageUuid: getPageUuid(document),
      ...(parentRoute ? { scrollTop: 0 } : {})
    };
  }

  if (!canViewDocument(document, environment.user)) return null;

  if (document.documentName === "JournalEntry" || getEntryUuid(document).startsWith("JournalEntry.")) {
    return { view: RouteView.Journal, entryUuid: getEntryUuid(document) };
  }

  if (document.documentName === "Actor" || getEntryUuid(document).startsWith("Actor.")) {
    return { view: RouteView.Character, actorUuid: getEntryUuid(document) };
  }

  return {
    view: RouteView.DocumentDetail,
    documentUuid: getEntryUuid(document),
    documentType: document.documentName === "Item" || getEntryUuid(document).startsWith("Item.") ? "item" : "unknown",
    ...(parentRoute ? { parentRoute } : {})
  };
}

function buildPageSummary(page: JournalPageDocumentLike, entry: JournalEntryDocumentLike, user: FoundryUserLike): JournalPageSummaryViewModel {
  const entryUuid = getEntryUuid(entry);
  const pageUuid = getPageUuid(page);
  return {
    uuid: pageUuid,
    id: getDocumentId(page),
    name: getDocumentName(page, "Journal Page"),
    type: getString(page.type) || "unknown",
    pageType: normalizePageType(page.type),
    sort: getNumber(page.sort) ?? 0,
    category: getString(page.category) || null,
    canView: true,
    canUpdate: canUpdateJournalPage(page, entry, user),
    canDelete: canDeleteJournalPage(page, entry, user),
    route: { view: RouteView.Journal, entryUuid, pageUuid }
  };
}

function getVisiblePages(entry: JournalEntryDocumentLike, user: FoundryUserLike): JournalPageDocumentLike[] {
  return (getCollectionContents(entry.pages) as JournalPageDocumentLike[])
    .map(page => (page.parent ? page : { ...page, parent: entry }))
    .filter(page => canViewJournalPage(page, user))
    .sort(compareDocumentsBySortThenName);
}

async function createJournalPageDocument(
  environment: JournalServiceEnvironment,
  entry: JournalEntryDocumentLike,
  data: Record<string, unknown>
): Promise<JournalPageDocumentLike | null | undefined> {
  if (environment.createPageData) return environment.createPageData(entry, data);

  if (typeof entry.createEmbeddedDocuments === "function") {
    const created = await entry.createEmbeddedDocuments("JournalEntryPage", [data]);
    return created[0] ?? null;
  }

  return null;
}

function buildJournalPageData(draft: JournalPageDraft): Record<string, unknown> | null {
  const name = draft.name.trim();
  if (!name) return null;
  if (!isJournalPageDraftType(draft.type)) return null;

  const data: Record<string, unknown> = {
    name,
    type: draft.type
  };

  if (draft.type === "text") {
    data.text = {
      content: convertPlainTextToJournalHtml(draft.textContent ?? ""),
      format: getJournalHtmlFormat()
    };
    return data;
  }

  const src = draft.src?.trim() ?? "";
  if (!src) return null;
  data.src = src;
  return data;
}

function isJournalPageDraftType(type: string): type is JournalPageDraftType {
  return type === "text" || type === "image" || type === "pdf" || type === "video";
}

function getJournalHtmlFormat(): number {
  const formats = (globalThis as { CONST?: { JOURNAL_ENTRY_PAGE_FORMATS?: { HTML?: number } } }).CONST?.JOURNAL_ENTRY_PAGE_FORMATS;
  return getNumber(formats?.HTML) ?? 1;
}

function convertPlainTextToJournalHtml(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map(paragraph => `<p>${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function canCreateJournalPage(
  entry: JournalEntryDocumentLike,
  user: FoundryUserLike,
  canCreatePage?: (user: FoundryUserLike, entry?: JournalEntryDocumentLike | null) => boolean
): boolean {
  if (canManageJournalEntryPages(entry, user)) return true;
  const staticPermission = canCreatePage?.(user, entry) ?? true;
  return staticPermission && canUpdateDocument(entry, user);
}

function canUpdateJournalPage(page: JournalPageDocumentLike, entry: JournalEntryDocumentLike, user: FoundryUserLike): boolean {
  return page.isOwner === true || canUpdateDocument(page, user) || canManageJournalEntryPages(entry, user);
}

function canDeleteJournalPage(page: JournalPageDocumentLike, entry: JournalEntryDocumentLike, user: FoundryUserLike): boolean {
  return page.canUserModify?.(user, "delete") === true || canManageJournalEntryPages(entry, user);
}

function canManageJournalEntryPages(entry: JournalEntryDocumentLike, user: FoundryUserLike): boolean {
  return (
    entry.isOwner === true ||
    entry.testUserPermission?.(user, "OWNER") === true ||
    canUpdateDocument(entry, user) ||
    (getDocumentUserLevel(entry, user) ?? FOUNDRY_PERMISSION_LEVELS.NONE) >= FOUNDRY_PERMISSION_LEVELS.OWNER
  );
}

function normalizeSelectedPageUuid(pages: JournalPageSummaryViewModel[], selectedPageUuid: string | null | undefined): string | null {
  if (selectedPageUuid && pages.some(page => page.uuid === selectedPageUuid || page.id === selectedPageUuid)) {
    return pages.find(page => page.uuid === selectedPageUuid || page.id === selectedPageUuid)?.uuid ?? null;
  }

  return pages[0]?.uuid ?? null;
}

async function enrichJournalText(
  page: JournalPageDocumentLike,
  value: string,
  user: FoundryUserLike,
  enrichHtml?: JournalTextEnricher
): Promise<string> {
  if (!value) return "";
  if (!enrichHtml) return value;

  return enrichHtml(value, {
    async: true,
    secrets: page.isOwner === true || canUpdateDocument(page, user),
    relativeTo: page
  });
}

async function safeFromUuid(environment: JournalUuidResolver, uuid: string): Promise<JournalEntryDocumentLike | JournalPageDocumentLike | null> {
  if (!uuid.trim()) return null;

  try {
    return (await environment.fromUuid(uuid)) ?? null;
  } catch {
    return null;
  }
}

function isJournalPage(document: JournalEntryDocumentLike | JournalPageDocumentLike | null | undefined): document is JournalPageDocumentLike {
  return document?.documentName === "JournalEntryPage" || Boolean(document?.parent && getString((document as JournalPageDocumentLike).type));
}

function normalizePageType(type: string | undefined): JournalPageType {
  switch (type) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "pdf":
      return "pdf";
    case "video":
      return "video";
    default:
      return "unsupported";
  }
}

function getPageTitle(page: JournalPageDocumentLike): string {
  const title = typeof page.title === "string" ? page.title : "";
  return getString(title) || getDocumentName(page, "Journal Page");
}

function getPageSource(page: JournalPageDocumentLike): string {
  return getString(page.src) || getString(getObject(page.image)?.src) || getString(getObject(page.video)?.src);
}

function getDocumentName(document: JournalEntryDocumentLike | JournalPageDocumentLike, fallback: string): string {
  return getString(document.name) || fallback;
}

function getDocumentId(document: JournalEntryDocumentLike | JournalPageDocumentLike): string {
  return getString(document.id) || getString(document._id) || getEntryUuid(document).split(".").at(-1) || "";
}

function getEntryUuid(entry: JournalEntryDocumentLike | null | undefined): string {
  return getString(entry?.uuid) || (getString(entry?.id) ? `JournalEntry.${entry?.id}` : "");
}

function getPageUuid(page: JournalPageDocumentLike): string {
  return getString(page.uuid) || (getString(page.id) && page.parent ? `${getEntryUuid(page.parent)}.JournalEntryPage.${page.id}` : "");
}

function compareDocumentsBySortThenName(left: JournalEntryDocumentLike | JournalPageDocumentLike, right: JournalEntryDocumentLike | JournalPageDocumentLike): number {
  const sortComparison = (getNumber(left.sort) ?? 0) - (getNumber(right.sort) ?? 0);
  if (sortComparison !== 0) return sortComparison;
  return getDocumentName(left, "").localeCompare(getDocumentName(right, ""));
}
