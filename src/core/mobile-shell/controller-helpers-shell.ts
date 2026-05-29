import { type MobileRouter } from "../../router/mobile-router.ts";
import { createShellRoute, getShellDestination, RouteView, ShellDestination, type CharacterRoute, type MobileRoute } from "../../router/routes.ts";
import {
    buildCharacterPickerViewModel
} from "../../services/character-picker.ts";
import { buildCombatViewModel } from "../../services/combat.ts";
import { buildItemDetailViewModel } from "../../services/item-detail.ts";
import {
    createMobileJournalService,
    type JournalEntryDocumentLike,
    type JournalEntryViewModel,
    type JournalPageDocumentLike,
    type JournalPageSummaryViewModel,
    type JournalPageViewModel,
    type MobileJournalService,
    type UnavailableJournalViewModel
} from "../../services/journal.ts";
import {
    buildRecentsViewModel,
    createMobileRecentsService,
    createFoundryRecentRouteRecordStorage
} from "../../services/recents.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { getCharacterSheetBannerEnabled, getColorBlindMode, getMobileViewEnabled } from "../settings.ts";
import { getCollectionContents, getInitials } from "../utils.ts";
import { buildBottomNav, createFoundryRecentsService, getActorByUuid, getCharacterPickerRouteFavorites, getHeader, persistSelectedCharacterRoute, restoreCharacterPickerSearchFocus, restorePaneSearchFocus, restoreRouteScroll, restoreSearchFocus } from "./controller-helpers-navigation.ts";
import { buildSearchViewModel, prepareSearchForRender } from "./controller-helpers-search.ts";
import type { JournalEntryTemplateModel, JournalPageRowViewModel, JournalPageTemplateModel, JournalShellViewModel, SearchUiState, ShellContentType, ShellViewModel } from "./types.ts";

const SHELL_TEMPLATE = `modules/${MODULE_ID}/templates/shell.hbs`;


export async function renderShell(rootElement: HTMLElement, router: MobileRouter, searchState?: SearchUiState): Promise<void> {
  const runtime = getFoundryRuntime();
  if (!runtime.renderTemplate) {
    throw new Error(`${MODULE_ID} cannot render the mobile shell before Foundry's template renderer is available.`);
  }

  const activeRoute = await normalizeUnavailableCombatRoute(router);
  const selectedCharacterRoute = router.getSelectedCharacterRoute();
  if (searchState) await prepareSearchForRender(activeRoute, searchState);
  persistSelectedCharacterRoute(selectedCharacterRoute);
  await createFoundryRecentsService()?.recordRoute(activeRoute);
  rootElement.innerHTML = await runtime.renderTemplate(SHELL_TEMPLATE, await buildShellViewModel(activeRoute, router.canGoBack(), selectedCharacterRoute, searchState));
  restoreRouteScroll(rootElement, router.getCurrentRoute());
  restoreSearchFocus(rootElement, activeRoute);
  restorePaneSearchFocus(rootElement, activeRoute);
  restoreCharacterPickerSearchFocus(rootElement, activeRoute);
}

async function normalizeUnavailableCombatRoute(router: MobileRouter): Promise<MobileRoute> {
  const route = router.getCurrentRoute();
  if (route.view !== RouteView.Combat) return route;
  if (buildCombatViewModel().actions.isCombatActive) return route;
  return router.replace(createShellRoute(ShellDestination.Characters));
}

/**
 * Builds the root shell view model for the current route.
 */
export async function buildShellViewModel(
  activeRoute: MobileRoute,
  canGoBack: boolean,
  selectedCharacterRoute: CharacterRoute | undefined,
  searchState?: SearchUiState
): Promise<ShellViewModel> {
  const activeDestination = getShellDestination(activeRoute);
  const contentType = getShellContentType(activeRoute);
  const runtime = getFoundryRuntime();
  const characterSheetAdapter = getCharacterSheetAdapter();
  const visualMetadata = characterSheetAdapter.getVisualMetadata();
  const contentViewModel = await buildShellContentViewModel(contentType, activeRoute, canGoBack, runtime, searchState);
  const header = getHeader(activeDestination, activeRoute, contentViewModel.itemDetail, contentViewModel.journal);

  return {
    characterSheetBannerImage: visualMetadata.bannerImage,
    activeDestination,
    contentType,
    canGoBack,
    colorBlindMode: getColorBlindMode(),
    journalUpRoute: getJournalParentRoute(activeRoute) ?? undefined,
    title: header.title,
    subtitle: header.subtitle,
    portraitInitials: header.portraitInitials,
    portraitImage: header.portraitImage,
    bottomNav: {
      label: "Shell navigation",
      items: buildBottomNav(activeRoute, activeDestination, selectedCharacterRoute)
    },
    ...contentViewModel
  };
}

/**
 * Converts concrete routes into the shell content type used by the template.
 */
export function getShellContentType(activeRoute: MobileRoute): ShellContentType {
  // A character sheet lives under the Characters shell destination for bottom
  // navigation, but it renders different content than the character picker.
  if (activeRoute.view === RouteView.Character) return "character";
  if (activeRoute.view === RouteView.Combat) return ShellDestination.Combat;
  if (activeRoute.view === RouteView.DocumentDetail) return "document-detail";
  if (activeRoute.view === RouteView.OwnedDocument) return "owned-document";
  return getShellDestination(activeRoute);
}

export function normalizeCharacterRoutePanes(route: MobileRoute | undefined, characterSheetAdapter: ReturnType<typeof getCharacterSheetAdapter>): MobileRoute | undefined {
  if (!route) return route;
  if (route.view === RouteView.Character) {
    return { ...route, pane: characterSheetAdapter.normalizePane(route.pane) };
  }

  if (route.view === RouteView.OwnedDocument) {
    return {
      ...route,
      parentPane: characterSheetAdapter.normalizePane(route.parentPane)
    };
  }

  if (route.view === RouteView.DocumentDetail && route.parentRoute) {
    return { ...route, parentRoute: normalizeCharacterRoutePanes(route.parentRoute, characterSheetAdapter) };
  }

  return route;
}

/**
 * Builds only the content payload needed for the current shell content type.
 */
export async function buildShellContentViewModel(
  contentType: ShellContentType,
  activeRoute: MobileRoute,
  canGoBack: boolean,
  runtime: ReturnType<typeof getFoundryRuntime>,
  searchState?: SearchUiState
): Promise<Pick<ShellViewModel, "characterPicker" | "actorSheet" | "journal" | "combat" | "recents" | "search" | "settings" | "itemDetail" | "pendingDetail">> {
  const characterSheetAdapter = getCharacterSheetAdapter();
  const visualMetadata = characterSheetAdapter.getVisualMetadata();
  const paneTemplatePaths = characterSheetAdapter.getPaneTemplatePaths();

  switch (contentType) {
    case "character":
      const actor = activeRoute.view === RouteView.Character ? getActorByUuid(activeRoute.actorUuid) : null;
      const activePane = activeRoute.view === RouteView.Character ? activeRoute.pane : undefined;
      const normalizedPane = characterSheetAdapter.normalizePane(activePane);
      const navigationModel = characterSheetAdapter.buildNavigationViewModel({
        actor,
        user: runtime.game?.user ?? null,
        activePane
      });
      const paneModel = navigationModel.unavailable
        ? { pane: normalizedPane, context: characterSheetAdapter.getPaneContext(normalizedPane), data: undefined }
        : await characterSheetAdapter.buildPaneViewModel({
            pane: normalizedPane,
            actor,
            user: runtime.game?.user ?? null,
            route: activeRoute
          });

      const actorSheet: ShellViewModel["actorSheet"] = {
        ...navigationModel,
        showCharacterBanner: getCharacterSheetBannerEnabled(),
        paneTemplatePaths,
        canGoBack
      };

      if (!navigationModel.unavailable) {
        const paneSpecs = characterSheetAdapter.getPaneSpecs({ actor, user: runtime.game?.user ?? null });
        const headerPaneContext = characterSheetAdapter.getHeaderPaneContext?.() ?? null;
        const headerPane = headerPaneContext
          ? paneSpecs.find(spec => spec.context === headerPaneContext)?.id
          : undefined;

        const paneContext = characterSheetAdapter.getPaneContext(normalizedPane);
        const paneData = paneModel.data as Record<string, unknown> | undefined;
        (actorSheet as Record<string, unknown>)[paneContext] = paneData;
        if (headerPane) {
          if (headerPane === normalizedPane) {
            actorSheet.headerDetails = paneData;
          } else {
            const headerPaneModel = await characterSheetAdapter.buildPaneViewModel({
              pane: headerPane,
              actor,
              user: runtime.game?.user ?? null,
              route: activeRoute
            });
            actorSheet.headerDetails = headerPaneModel.data as Record<string, unknown> | undefined;
          }
        }
      }

      return {
        actorSheet
      };
    case ShellDestination.Characters:
      return {
        characterPicker: buildCharacterPickerViewModel({
          actors: runtime.game?.actors,
          folders: runtime.game?.folders,
          user: runtime.game?.user ?? null,
          favoriteActorUuids: getCharacterPickerRouteFavorites(),
          favoriteHelpOpen: activeRoute.view === RouteView.Characters ? activeRoute.favoriteHelpOpen === true : false,
          searchQuery: activeRoute.view === RouteView.Characters ? activeRoute.query : "",
          expandedFolderIds: activeRoute.view === RouteView.Characters ? activeRoute.expandedFolderIds : []
        })
      };
    case ShellDestination.Combat:
      return {
        combat: buildCombatViewModel()
      };
    case "owned-document":
      if (activeRoute.view === RouteView.OwnedDocument) {
        return {
          itemDetail: await buildItemDetailViewModel(activeRoute.documentUuid)
        };
      }

      return {
        pendingDetail: {
          title: "Character Item",
          body: "This item detail is not available from this view."
        }
      };
    case "document-detail":
      if (activeRoute.view === RouteView.DocumentDetail && activeRoute.documentType === "item") {
        return {
          itemDetail: await buildItemDetailViewModel(activeRoute.documentUuid, { source: activeRoute.source })
        };
      }

      return {
        pendingDetail: {
          title: "Unavailable document",
          body: "This document is no longer available or you do not have permission to view it."
        }
      };
    case ShellDestination.Journal:
      return {
        journal: await buildJournalShellViewModel(activeRoute)
      };
    case ShellDestination.Recents:
      return {
        recents: await buildRecentsViewModel(createFoundryRecentsService() ?? createMobileRecentsService({ storage: createFoundryRecentRouteRecordStorage() }))
      };
    case ShellDestination.Search:
      return {
        search: buildSearchViewModel(activeRoute, searchState)
      };
    case ShellDestination.Settings:
      return {
        settings: {
          mobileViewEnabled: getMobileViewEnabled(),
          characterSheetBannerEnabled: getCharacterSheetBannerEnabled(),
          colorBlindMode: getColorBlindMode(),
          characterSheetBannerAvailable: Boolean(visualMetadata.bannerImage),
          characterSheetBannerLabel: visualMetadata.bannerLabel ?? "Character Sheet Banner",
          characterSheetBannerHint: visualMetadata.bannerHint ?? "Show the character sheet banner texture at the top of mobile character sheets.",
          characterSheetBannerAriaLabel: visualMetadata.bannerAriaLabel ?? "Character Sheet Banner",
          colorBlindModeAriaLabel: "Color-Blind Mode"
        }
      };
  }
}

export async function buildJournalShellViewModel(activeRoute: MobileRoute): Promise<JournalShellViewModel> {
  const service = createFoundryJournalService();
  if (activeRoute.view !== RouteView.Journal) {
    return {
      list: buildJournalListTemplateModel(service)
    };
  }

  if (!activeRoute.entryUuid) {
    return {
      list: buildJournalListTemplateModel(service)
    };
  }

  const entry = await service.lookupEntry(activeRoute.entryUuid, activeRoute.pageUuid);
  if (entry.unavailable) {
    return {
      entry
    };
  }

  if (!activeRoute.pageUuid) {
    return {
      entry: addJournalEntryTemplateState(entry)
    };
  }

  return {
    page: addJournalPageTemplateState(await service.lookupPage(activeRoute.pageUuid, entry.uuid))
  };
}

export function buildJournalListTemplateModel(service: MobileJournalService): NonNullable<JournalShellViewModel["list"]> {
  const entries = service.listEntries().map(entry => ({
    ...entry,
    iconText: getInitials(entry.name, "J"),
    pageCountLabel: entry.visiblePageCount === 1 ? "page" as const : "pages" as const
  }));

  return {
    entries,
    hasEntries: entries.length > 0
  };
}

export function addJournalEntryTemplateState(entry: JournalEntryViewModel): JournalEntryTemplateModel {
  return {
    ...entry,
    hasPages: entry.visiblePages.length > 0,
    visiblePages: entry.visiblePages.map(addJournalPageRowState)
  };
}

export function addJournalPageTemplateState(page: JournalPageViewModel | UnavailableJournalViewModel): JournalPageTemplateModel {
  if (page.unavailable) return page;

  return {
    ...page,
    textPage: page.pageType === "text",
    imagePage: page.pageType === "image",
    pdfPage: page.pageType === "pdf",
    videoPage: page.pageType === "video",
    unsupportedPage: page.pageType === "unsupported",
    unsupportedBody: `This ${page.type || "journal"} page type is not supported by the mobile journal reader yet.`
  };
}

export function getJournalParentRoute(route: MobileRoute): MobileRoute | null {
  if (route.view !== RouteView.Journal || !route.entryUuid) return null;
  if (route.pageUuid) return { view: RouteView.Journal, entryUuid: route.entryUuid };
  return { view: RouteView.Journal };
}

export function addJournalPageRowState(page: JournalPageSummaryViewModel): JournalPageRowViewModel {
  return {
    ...page,
    iconText: getJournalPageIconText(page),
    typeLabel: getJournalPageTypeLabel(page.pageType)
  };
}

export function createFoundryJournalService(): MobileJournalService {
  const runtime = getFoundryRuntime();
  const fromUuid = runtime.foundry?.utils?.fromUuid;
  const textEditor = runtime.TextEditor;

  return createMobileJournalService({
    collection: runtime.game?.journal as Iterable<JournalEntryDocumentLike> | { contents?: JournalEntryDocumentLike[] } | undefined,
    user: runtime.game?.user ?? null,
    fromUuid: async uuid => {
      if (fromUuid) return (await fromUuid(uuid)) as JournalEntryDocumentLike | JournalPageDocumentLike | null | undefined;
      return getJournalDocumentByUuid(uuid);
    },
    enrichHtml: typeof textEditor?.enrichHTML === "function" ? textEditor.enrichHTML.bind(textEditor) : undefined,
    canCreatePage: user => {
      const pageClass = (globalThis as { JournalEntryPage?: { canUserCreate?: (user: unknown) => boolean } }).JournalEntryPage;
      return pageClass?.canUserCreate?.(user) !== false;
    },
    createPageDialog: entry => {
      const pageClass = (globalThis as {
        JournalEntryPage?: {
          implementation?: {
            createDialog?: (data?: Record<string, unknown>, createOptions?: Record<string, unknown>, dialogOptions?: Record<string, unknown>) => Promise<JournalPageDocumentLike | null | undefined>;
          };
          createDialog?: (data?: Record<string, unknown>, createOptions?: Record<string, unknown>, dialogOptions?: Record<string, unknown>) => Promise<JournalPageDocumentLike | null | undefined>;
        };
      }).JournalEntryPage;
      if (!pageClass) return Promise.resolve(null);
      const owner = pageClass.implementation ?? pageClass;
      const createDialog = owner.createDialog;
      if (typeof createDialog !== "function") return Promise.resolve(null);
      return createDialog.call(owner, {}, { parent: entry }, {});
    },
    createPageData: async (entry, data) => {
      const pageClass = (globalThis as {
        JournalEntryPage?: {
          implementation?: {
            create?: (data?: Record<string, unknown>, createOptions?: Record<string, unknown>) => Promise<JournalPageDocumentLike | JournalPageDocumentLike[] | null | undefined>;
          };
          create?: (data?: Record<string, unknown>, createOptions?: Record<string, unknown>) => Promise<JournalPageDocumentLike | JournalPageDocumentLike[] | null | undefined>;
        };
      }).JournalEntryPage;
      const owner = pageClass?.implementation ?? pageClass;
      const create = owner?.create;
      if (typeof create === "function") {
        const created = await create.call(owner, data, { parent: entry });
        return Array.isArray(created) ? created[0] : created;
      }

      if (typeof entry.createEmbeddedDocuments === "function") {
        const created = await entry.createEmbeddedDocuments("JournalEntryPage", [data]);
        return created[0] ?? null;
      }

      return null;
    },
    updatePageData: (page, data) => {
      if (typeof page.update !== "function") return Promise.resolve(null);
      return page.update(data);
    },
    openPageEditor: page => {
      const renderedPage = renderJournalSheet(page.sheet);
      const renderedEntry = renderJournalSheet(page.parent?.sheet, getJournalDocumentId(page));
      return renderedPage || renderedEntry;
    }
  });
}

export function renderJournalSheet(
  sheet: JournalEntryDocumentLike["sheet"] | JournalPageDocumentLike["sheet"] | undefined,
  pageId?: string
): boolean {
  if (typeof sheet?.render !== "function") return false;

  const appV2Options = pageId ? { force: true, pageId } : { force: true };
  const legacyOptions = pageId ? { pageId } : undefined;
  let rendered = false;

  try {
    sheet.render(appV2Options);
    rendered = true;
  } catch (error) {
    globalThis.console?.debug?.(`${MODULE_ID} could not render a Journal sheet with ApplicationV2 options.`, error);
  }

  try {
    sheet.render(true, legacyOptions);
    rendered = true;
  } catch (error) {
    globalThis.console?.debug?.(`${MODULE_ID} could not render a Journal sheet with legacy options.`, error);
  }

  return rendered;
}

export function getJournalDocumentId(document: JournalEntryDocumentLike | JournalPageDocumentLike): string {
  return document.id ?? document._id ?? document.uuid?.split(".").at(-1) ?? "";
}

export function getJournalDocumentByUuid(uuid: string): JournalEntryDocumentLike | JournalPageDocumentLike | null {
  for (const entry of getCollectionContents(getFoundryRuntime().game?.journal) as JournalEntryDocumentLike[]) {
    if (entry.uuid === uuid || (entry.id && `JournalEntry.${entry.id}` === uuid)) return entry;
    for (const page of getCollectionContents(entry.pages) as JournalPageDocumentLike[]) {
      if (page.uuid === uuid || (page.id && `${entry.uuid}.JournalEntryPage.${page.id}` === uuid)) return page;
    }
  }

  return null;
}

export function getJournalPageIconText(page: JournalPageSummaryViewModel): string {
  switch (page.pageType) {
    case "text":
      return "T";
    case "image":
      return "I";
    case "pdf":
      return "P";
    case "video":
      return "V";
    case "unsupported":
      return "?";
  }
}

export function getJournalPageTypeLabel(pageType: JournalPageSummaryViewModel["pageType"]): string {
  switch (pageType) {
    case "text":
      return "Text page";
    case "image":
      return "Image page";
    case "pdf":
      return "PDF page";
    case "video":
      return "Video page";
    case "unsupported":
      return "Unsupported page";
  }
}

