import { type MobileRouter } from "../../router/mobile-router.ts";
import type { RoutePermissionResolver } from "../../router/route-permissions.ts";
import { RouteView, ShellDestination, type ActorSheetPaneId, type CharacterRoute, type MobileRoute } from "../../router/routes.ts";
import { getMobileDocumentType, type FoundryDocumentLike, type MobileDocumentType } from "../../services/document-lookup.ts";
import { hasDocumentPermission, type FoundryPermissionLevelName } from "../../services/permissions.ts";
import { type ItemDetailViewModel } from "../../services/item-detail.ts";
import {
    type JournalPageMutationResult,
    type MobileJournalService
} from "../../services/journal.ts";
import {
    createFoundryCharacterPickerFavoritesStorage,
    readCharacterPickerFavoritesFromStorage,
    setCharacterPickerFavoriteInStorage
} from "../../services/character-picker-favorites.ts";
import { buildCombatViewModel } from "../../services/combat.ts";
import { createLocalStorageKey, nonEmptyStringLocalStorageCodec, readLocalStorage, writeLocalStorage, type LocalStorageKey } from "../../services/local-storage.ts";
import {
    createMobileRecentsService,
    createFoundryRecentRouteRecordStorage
} from "../../services/recents.ts";
import {
    ALL_SEARCH_RESULT_TYPES,
    isUsableSearchQuery,
    type MobileSearchResult,
    type SearchResultType
} from "../../services/search.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import type {
    CharacterSheetNavigationActor
} from "../../systems/character-sheet-adapter.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { getCollectionContents, getInitials } from "../utils.ts";
import { createPaneSearchDrawer, getPaneSearchQuery } from "./controller-helpers-search.ts";
import { createFoundryJournalService, getJournalPageIconText, getJournalPageTypeLabel, renderShell } from "./controller-helpers-shell.ts";
import type { BottomNavItem, JournalShellViewModel, SearchResultViewModel, SearchTypeFilterViewModel, SearchUiState, ShellViewModel } from "./types.ts";

const SELECTED_CHARACTER_STORAGE_NAMESPACE = "selectedCharacterUuid";
const DEFAULT_DYNAMIC_WHEEL_CHUNK_SIZE = 20;
const DYNAMIC_WHEEL_EDGE_THRESHOLD = 4;
const encounterBackgroundImageStatus = new Map<string, "ready" | "missing" | "checking">();

export function clearSearchDebounce(searchState: SearchUiState): void {
  if (!searchState.debounceTimer) return;

  globalThis.clearTimeout(searchState.debounceTimer);
  searchState.debounceTimer = undefined;
}

export function buildSearchTypeFilters(resultTypes: string[], activeTypeFilter: string): SearchTypeFilterViewModel[] {
  return [
    {
      label: "All",
      value: ALL_SEARCH_RESULT_TYPES,
      active: activeTypeFilter === ALL_SEARCH_RESULT_TYPES
    },
    ...resultTypes.map(type => ({
      label: type,
      value: type,
      active: type === activeTypeFilter
    }))
  ];
}

export function createSearchResultViewModel(result: MobileSearchResult, focusedResultId: string | undefined): SearchResultViewModel {
  return {
    ...result,
    iconText: getSearchResultIconText(result),
    subtitle: getSearchResultSubtitle(result),
    actionLabel: getSearchResultActionLabel(result),
    focused: focusedResultId === result.uuid
  };
}

export function getSearchResultSubtitle(result: MobileSearchResult): string {
  return result.source ? `${result.type} - ${result.source}` : result.type;
}

export function getSearchResultActionLabel(result: MobileSearchResult): string {
  switch (result.type) {
    case "Journal Page":
      return "Page";
    case "Item":
      return "Item";
    default:
      return "Open";
  }
}

export function getSearchResultIconText(result: MobileSearchResult): string {
  const words = result.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map(word => word[0]?.toLocaleUpperCase() ?? "").join("");
  return initials || result.type[0]?.toLocaleUpperCase() || "?";
}

export function normalizeSearchTypeFilter(value: string | undefined): SearchResultType | typeof ALL_SEARCH_RESULT_TYPES {
  return value?.trim() || ALL_SEARCH_RESULT_TYPES;
}

export function hasUsableSearchQuery(query: string): boolean {
  return isUsableSearchQuery(query);
}

export function getSearchRequestKey(query: string, typeFilter: string): string {
  return `${query.trim().replace(/\s+/g, " ")}\u0000${typeFilter}`;
}

/**
 * Builds the stable top-level shell navigation entries.
 */
export function buildBottomNav(activeRoute: MobileRoute, activeDestination: ShellDestination, selectedCharacterRoute: CharacterRoute | undefined): BottomNavItem[] {
  const characterLabel = getCharactersNavLabel(activeRoute, selectedCharacterRoute);
  const combatViewModel = buildCombatViewModel();
  const hasActiveEncounter = combatViewModel.actions.isCombatActive;
  const encounterBackgroundImage = hasActiveEncounter ? getEncounterBackgroundImagePath() : null;
  const encounterBackgroundState = encounterBackgroundImage ? getEncounterBackgroundImageState(encounterBackgroundImage) : "missing";
  const showEncounterBackgroundImage = hasActiveEncounter && encounterBackgroundState === "ready";
  const showEncounterFallbackBorder = hasActiveEncounter && encounterBackgroundState !== "ready";

  return [
    { label: characterLabel, action: "navigate", route: ShellDestination.Characters, active: activeDestination === ShellDestination.Characters },
    {
      label: "Encounter",
      action: "navigate",
      route: ShellDestination.Combat,
      active: activeDestination === ShellDestination.Combat,
      disabled: !hasActiveEncounter,
      warningIcon: combatViewModel.localUserTurn,
      backgroundImage: showEncounterBackgroundImage ? encounterBackgroundImage ?? undefined : undefined,
      highlightBorder: showEncounterFallbackBorder
    },
    { label: "Journal", action: "navigate", route: ShellDestination.Journal, active: activeDestination === ShellDestination.Journal },
    { label: "Recents", action: "navigate", route: ShellDestination.Recents, active: activeDestination === ShellDestination.Recents },
    { label: "Search", action: "navigate", route: ShellDestination.Search, active: activeDestination === ShellDestination.Search, icon: "fa-solid fa-magnifying-glass" },
    { label: "Settings", action: "navigate", route: ShellDestination.Settings, active: activeDestination === ShellDestination.Settings, icon: "fa-solid fa-cog" }
  ];
}

/**
 * Builds the Characters nav label from the selected character shortcut state.
 */
export function getCharactersNavLabel(activeRoute: MobileRoute, selectedCharacterRoute: CharacterRoute | undefined): string {
  if (activeRoute.view === RouteView.Character) return "Characters";
  if (!selectedCharacterRoute) return "Characters";

  const actor = getActorByUuid(selectedCharacterRoute.actorUuid);
  return getFirstName(actor?.name) || "Character";
}

/**
 * Builds the default shell header for non-character destinations.
 */
export function getHeader(
  activeDestination: ShellDestination,
  activeRoute?: MobileRoute,
  itemDetail?: ItemDetailViewModel,
  journal?: JournalShellViewModel
): Pick<ShellViewModel, "title" | "subtitle" | "portraitInitials" | "portraitImage"> {
  if (itemDetail?.available) {
    return {
      title: itemDetail.name,
      subtitle: itemDetail.source ? `${itemDetail.typeLabel} - ${itemDetail.source}` : itemDetail.typeLabel,
      portraitInitials: itemDetail.iconText,
      portraitImage: itemDetail.icon
    };
  }

  if (activeRoute?.view === RouteView.DocumentDetail && activeRoute.documentType === "item") {
    return { title: "Item", subtitle: activeRoute.source ? `Search result - ${activeRoute.source}` : "Search result", portraitInitials: "I" };
  }

  if (activeRoute?.view === RouteView.OwnedDocument) {
    return { title: "Character Item", subtitle: "Character-owned item route", portraitInitials: "I" };
  }

  switch (activeDestination) {
    case ShellDestination.Combat:
      return { title: "Encounter", subtitle: "Initiative order and turn controls", portraitInitials: "E" };
    case ShellDestination.Journal:
      if (journal?.page && !journal.page.unavailable) {
        return {
          title: journal.page.title,
          subtitle: `${journal.page.entryName} - ${getJournalPageTypeLabel(journal.page.pageType)}`,
          portraitInitials: getJournalPageIconText(journal.page)
        };
      }

      if (journal?.entry && !journal.entry.unavailable) {
        return {
          title: journal.entry.name,
          subtitle: "Journal Entry - visible pages",
          portraitInitials: getInitials(journal.entry.name, "J")
        };
      }

      return { title: "Journal", subtitle: "Visible entries and pages", portraitInitials: "J" };
    case ShellDestination.Recents:
      return { title: "Recents", subtitle: "Recently opened mobile views", portraitInitials: "R" };
    case ShellDestination.Search:
      return { title: "Search", subtitle: "Find Characters, Items, Journals, and Compendiums", portraitInitials: "S" };
    case ShellDestination.Settings:
      return { title: "Settings", subtitle: "User-specific mobile mode controls", portraitInitials: "PF" };
    case ShellDestination.Characters:
      return { title: "Characters", subtitle: "Observable player characters", portraitInitials: "PF" };
  }
}

/**
 * Validates a template-provided route string as a top-level shell destination.
 */
export function isShellDestination(route: string | undefined): route is ShellDestination {
  return (
    route === ShellDestination.Characters ||
    route === ShellDestination.Combat ||
    route === ShellDestination.Journal ||
    route === ShellDestination.Recents ||
    route === ShellDestination.Search ||
    route === ShellDestination.Settings
  );
}

/**
 * Creates Foundry-backed permission checks for router route resolution.
 */
export function createFoundryRoutePermissionResolver(): RoutePermissionResolver {
  return {
    canViewActor: actorUuid => canViewDocumentByUuid(actorUuid, "character", "LIMITED"),
    canViewDocument: (documentUuid, expectedType) => canViewDocumentByUuid(documentUuid, expectedType),
    canViewJournalEntry: entryUuid => canViewDocumentByUuid(entryUuid, "journal-entry"),
    canViewJournalPage: (_entryUuid, pageUuid) => canViewDocumentByUuid(pageUuid, "journal-page")
  };
}

/**
 * Checks view permission for a UUID using Foundry's synchronous UUID lookup.
 */
export function canViewDocumentByUuid(
  uuid: string,
  expectedType?: MobileDocumentType,
  minimumPermission: FoundryPermissionLevelName = "OBSERVER"
): boolean {
  const runtime = getFoundryRuntime();
  const fromUuidSync = runtime.foundry?.utils?.fromUuidSync;
  const user = runtime.game?.user;
  // In non-Foundry fixture tests there may be no UUID service. Treat routes as
  // visible there so pure router behavior can be tested without a live world.
  if (!fromUuidSync || !user) return true;

  const document = fromUuidSync(uuid) as FoundryDocumentLike | null | undefined;
  if (!document) return false;

  const documentType = getMobileDocumentType(document);
  if (expectedType && documentType !== expectedType) return false;
  if (document.parent && !hasDocumentPermission(document.parent, user, minimumPermission)) return false;
  return hasDocumentPermission(document, user, minimumPermission);
}

/**
 * Navigates between major character panes.
 *
 * Direct pane navigation starts at the top of the target pane; Back restores
 * the previous route's saved scroll position.
 */
export async function navigateCharacterPane(
  element: HTMLElement,
  router: MobileRouter,
  pane: ActorSheetPaneId,
  searchState?: SearchUiState
): Promise<void> {
  const currentRoute = router.getCurrentRoute();
  const characterSheetAdapter = getCharacterSheetAdapter();
  if (!characterSheetAdapter.isCharacterRoute(currentRoute)) return;

  rememberCurrentRouteScroll(element, router);
  const nextRoute = characterSheetAdapter.createPaneRoute({
    actorUuid: currentRoute.actorUuid,
    pane,
    scrollTop: 0
  });

  const isSamePane = characterSheetAdapter.normalizePane(currentRoute.pane) === pane;
  await (isSamePane ? router.replace(nextRoute) : router.push(nextRoute));
  await renderShell(element, router, searchState);
}

export function clearCharacterSheetTransientState(router: MobileRouter): void {
  const activeRoute = router.getCurrentRoute();
  if (activeRoute.view !== RouteView.Character) return;
  getCharacterSheetAdapter().clearTransientState(activeRoute);
}

type CharacterSheetActionOptions = {
  data?: Readonly<Record<string, string>>;
  event?: Event;
  closeDialogs?: boolean;
  onSuccess?: (result: { ok: boolean; reason?: string; data?: Record<string, unknown> }) => Promise<void> | void;
};

/**
 * Executes a character pane action through the active adapter and refreshes the
 * shell when the action reports success.
 */
export async function runCharacterSheetAction(
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState,
  action: string,
  options: CharacterSheetActionOptions = {}
): Promise<void> {
  const activeRoute = router.getCurrentRoute();
  if (activeRoute.view !== RouteView.Character) return;

  const characterSheetAdapter = getCharacterSheetAdapter();
  const actor = getActorByUuid(activeRoute.actorUuid);
  const actionContext = {
    actor,
    actorUuid: activeRoute.actorUuid,
    pane: characterSheetAdapter.normalizePane(activeRoute.pane),
    route: activeRoute,
    user: getFoundryRuntime().game?.user ?? null,
    action,
    data: options.data,
    event: options.event
  };
  const result = await characterSheetAdapter.runPaneAction(actionContext);
  characterSheetAdapter.onPaneActionResult?.({ actionContext, result });

  if (!result.ok) return;

  if (options.closeDialogs) setNumberDialogOpen(element, undefined, false);
  await options.onSuccess?.(result);
  await renderShell(element, router, searchState);
}

export async function runJournalControl(
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState,
  control: (service: MobileJournalService) => Promise<JournalPageMutationResult>,
  options: { navigateToResult?: boolean } = {}
): Promise<void> {
  const activeRoute = router.getCurrentRoute();
  if (activeRoute.view !== RouteView.Journal) return;

  const result = await control(createFoundryJournalService());
  if (!result.ok) {
    notifyJournalMutationUnavailable(result.reason);
    return;
  }

  if (options.navigateToResult && result.route) {
    rememberCurrentRouteScroll(element, router);
    await router.push(result.route);
  }

  await renderShell(element, router, searchState);
}

export function notifyJournalMutationUnavailable(reason?: JournalPageMutationResult["reason"]): void {
  const notifications = (globalThis as { ui?: { notifications?: { warn?: (message: string) => void } } }).ui?.notifications;
  const message = reason === "forbidden"
    ? "You do not have permission to modify this journal page."
    : reason === "invalid"
      ? "Enter a page name before saving."
      : reason === "upload-failed"
        ? "The selected file could not be uploaded."
      : "This journal page action is not available here.";
  notifications?.warn?.(message);
}

export async function updatePaneSearch(
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState,
  pane: ActorSheetPaneId,
  query: string
): Promise<void> {
  const activeRoute = router.getCurrentRoute();
  const characterSheetAdapter = getCharacterSheetAdapter();
  if (activeRoute.view !== RouteView.Character || characterSheetAdapter.normalizePane(activeRoute.pane) !== pane || !characterSheetAdapter.getPaneSearchDrawerPrefix(pane)) return;
  const nextDrawer = createPaneSearchDrawer(pane, query);

  router.updateCurrentRoute({
    ...activeRoute,
    drawer: nextDrawer,
    scrollTop: 0
  });
  await renderShell(element, router, searchState);

  const latestRoute = router.getCurrentRoute();
  if (latestRoute.view !== RouteView.Character || characterSheetAdapter.normalizePane(latestRoute.pane) !== pane) return;
  if (latestRoute.drawer !== nextDrawer) {
    await renderShell(element, router, searchState);
  }
  focusPaneSearchInput(element, pane);
}

function getEncounterBackgroundImagePath(): string | null {
  const systemId = getFoundryRuntime().game?.system?.id?.trim();
  if (!systemId) return null;
  return `/modules/${MODULE_ID}/systems/${systemId}/assets/images/encounter_bg.png`;
}

function getEncounterBackgroundImageState(path: string): "ready" | "missing" | "checking" {
  const cached = encounterBackgroundImageStatus.get(path);
  if (cached) return cached;

  if (typeof Image === "undefined") return "checking";
  encounterBackgroundImageStatus.set(path, "checking");

  const probe = new Image();
  probe.onload = () => {
    encounterBackgroundImageStatus.set(path, "ready");
    void globalThis.window?.pocketFoundry?.mobileShell?.refresh?.();
  };
  probe.onerror = () => {
    encounterBackgroundImageStatus.set(path, "missing");
    void globalThis.window?.pocketFoundry?.mobileShell?.refresh?.();
  };
  probe.src = path;

  return "checking";
}

export async function updateCharacterPickerSearch(
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState,
  query: string
): Promise<void> {
  const activeRoute = router.getCurrentRoute();
  if (activeRoute.view !== RouteView.Characters) return;
  const normalizedQuery = normalizeCharacterPickerSearchQuery(query);

  router.updateCurrentRoute({
    ...activeRoute,
    query: normalizedQuery,
    scrollTop: 0
  });
  await renderShell(element, router, searchState);

  const latestRoute = router.getCurrentRoute();
  if (latestRoute.view !== RouteView.Characters) return;
  if ((latestRoute.query ?? "") !== normalizedQuery) await renderShell(element, router, searchState);
  focusCharacterPickerSearchInput(element);
}

export async function updateCharacterPickerFolderExpansion(
  element: HTMLElement,
  router: MobileRouter,
  searchState: SearchUiState,
  folderId: string,
  expanded: boolean
): Promise<void> {
  const activeRoute = router.getCurrentRoute();
  if (activeRoute.view !== RouteView.Characters) return;
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) return;

  const expandedFolderIds = new Set((activeRoute.expandedFolderIds ?? []).map(id => id.trim()).filter(Boolean));
  if (expanded) expandedFolderIds.add(normalizedFolderId);
  else expandedFolderIds.delete(normalizedFolderId);

  router.updateCurrentRoute({
    ...activeRoute,
    expandedFolderIds: [...expandedFolderIds]
  });
  await renderShell(element, router, searchState);
}

/**
 * Persists a character picker favorite for the current Foundry system and user.
 */
export async function setCharacterPickerRouteFavorite(actorUuid: string, favorite: boolean): Promise<string[]> {
  return setCharacterPickerFavoriteInStorage(createFoundryCharacterPickerFavoritesStorage(), actorUuid, favorite);
}

/**
 * Reads character picker favorites for the current Foundry system and user.
 */
export function getCharacterPickerRouteFavorites(): string[] {
  return readCharacterPickerFavoritesFromStorage(createFoundryCharacterPickerFavoritesStorage());
}

/**
 * Opens or closes lightweight number-wheel dialogs without using
 * URL hash fragments, which are reserved for Pocket Foundry route state.
 */
export function setNumberDialogOpen(element: HTMLElement, dialogId: string | undefined, open: boolean): void {
  element.querySelectorAll<HTMLElement>(".mock-dialog.open").forEach(dialogElement => dialogElement.classList.remove("open"));
  if (!open) return;

  const dialogElement = dialogId ? element.querySelector<HTMLElement>(`#${CSS.escape(dialogId)}`) : null;
  dialogElement?.classList.add("open");
  dialogElement?.querySelectorAll<HTMLElement>(".spinner-wheel").forEach(wheel => ensureDetailsWheelOptions(wheel));
  dialogElement?.querySelector<HTMLElement>(".spinner-wheel .selected")?.scrollIntoView({ block: "center" });
}

/**
 * Stores the selected HP delta locally in the open dialog until OK confirms it.
 */
export function setDetailsSelectedDelta(target: HTMLElement): void {
  const wheel = target.closest<HTMLElement>(".spinner-wheel");
  const selectionScope = wheel?.dataset.wheelSelectScope === "wheel" ? "wheel" : "dialog";
  if (selectionScope === "wheel") {
    wheel?.querySelectorAll<HTMLElement>("button.selected").forEach(option => option.classList.remove("selected"));
  } else {
    const dialog = target.closest<HTMLElement>(".mock-dialog");
    if (!dialog) return;
    dialog.querySelectorAll<HTMLElement>(".spinner-wheel .selected").forEach(option => option.classList.remove("selected"));
  }
  target.classList.add("selected");

  if (selectionScope === "wheel") return;
  const dialog = target.closest<HTMLElement>(".mock-dialog");
  const confirm = dialog?.querySelector<HTMLElement>(".dialog-actions .primary-action");
  if (confirm?.dataset.action?.endsWith("-delta")) confirm.dataset.delta = target.dataset.delta ?? "0";
}

export function getDetailsConfirmDelta(target: HTMLElement): number {
  const dialog = target.closest<HTMLElement>(".mock-dialog");
  const wheel = dialog?.querySelector<HTMLElement>(".spinner-wheel");
  if (wheel) updateDetailsWheelSelection(wheel);

  return Number(target.dataset.delta);
}

export function getDetailsRestActionData(target: HTMLElement): Record<string, string> {
  const dialog = target.closest<HTMLElement>(".mock-dialog");
  const type = target.dataset.restType === "long" ? "long" : "short";
  const getChecked = (name: string): boolean | undefined => {
    const input = dialog?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);
    return input ? input.checked : undefined;
  };

  if (type === "short") {
    return {
      restType: "short",
      type,
      dialog: "false",
      autoHD: getChecked("autoHD") === true ? "true" : "false"
    };
  }

  return {
    restType: "long",
    type,
    dialog: "false",
    newDay: getChecked("newDay") === false ? "false" : "true",
    recoverTemp: getChecked("recoverTemp") === false ? "false" : "true",
    recoverTempMax: getChecked("recoverTempMax") === false ? "false" : "true"
  };
}

export function updateDetailsWheelSelection(wheel: HTMLElement): void {
  ensureDetailsWheelOptions(wheel);
  const selected = getCenteredDetailsWheelOption(wheel) ?? wheel.querySelector<HTMLElement>(".selected");
  if (!selected) return;

  setDetailsSelectedDelta(selected);
}

export function ensureDetailsWheelOptions(wheel: HTMLElement): void {
  if (wheel.dataset.wheelDynamic !== "true") return;
  initializeDynamicWheelOptions(wheel);
  extendDynamicWheelOptions(wheel);
}

export function setDetailsWheelValue(wheel: HTMLElement, value: number): void {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  if (wheel.dataset.wheelDynamic === "true") {
    wheel.dataset.wheelValue = String(normalized);
    wheel.dataset.wheelInitialized = "false";
    wheel.dataset.wheelTopValue = "";
    wheel.dataset.wheelBottomValue = "";
    wheel.replaceChildren();
    initializeDynamicWheelOptions(wheel);
  } else {
    wheel.querySelectorAll<HTMLElement>("button.selected").forEach(option => option.classList.remove("selected"));
    const selected = wheel.querySelector<HTMLElement>(`button[data-delta="${normalized}"]`) ?? wheel.querySelector<HTMLElement>("button");
    selected?.classList.add("selected");
  }

  const centered = wheel.querySelector<HTMLElement>("button.selected");
  centered?.scrollIntoView({ block: "center" });
}

export function getCenteredDetailsWheelOption(wheel: HTMLElement): HTMLElement | null {
  if (typeof wheel.getBoundingClientRect !== "function") return null;

  const wheelRect = wheel.getBoundingClientRect();
  if (wheelRect.height <= 0) return null;

  const wheelCenter = wheelRect.top + wheelRect.height / 2;
  let centered: HTMLElement | null = null;
  let centeredDistance = Number.POSITIVE_INFINITY;

  wheel.querySelectorAll<HTMLElement>("button[data-delta]").forEach(option => {
    const optionRect = option.getBoundingClientRect();
    if (optionRect.height <= 0) return;

    const optionCenter = optionRect.top + optionRect.height / 2;
    const distance = Math.abs(optionCenter - wheelCenter);
    if (distance >= centeredDistance) return;

    centered = option;
    centeredDistance = distance;
  });

  return centered;
}

/**
 * Restores the current route's saved vertical scroll after template rendering.
 */
export function restoreRouteScroll(element: HTMLElement, route: MobileRoute): void {
  const shellElement = getShellScrollElement(element);
  restoreExpandedDetailsState(shellElement, route);
  const scrollTop = route.scrollTop ?? 0;
  if (!globalThis.requestAnimationFrame) {
    shellElement.scrollTop = scrollTop;
    return;
  }

  globalThis.requestAnimationFrame(() => {
    shellElement.scrollTop = scrollTop;
    // Keep the active pane button visible in the horizontally-scrollable rail.
    const activePane = shellElement.querySelector<HTMLElement>(".pane-rail .active");
    activePane?.scrollIntoView?.({ block: "nearest", inline: "center" });
  });
}

function initializeDynamicWheelOptions(wheel: HTMLElement): void {
  if (wheel.dataset.wheelInitialized === "true" && wheel.querySelector("button[data-delta]")) return;

  let current = toFiniteNumber(wheel.dataset.wheelValue, 0);
  const step = Math.max(1, Math.abs(Math.trunc(toFiniteNumber(wheel.dataset.wheelStep, 1))));
  const chunkSize = Math.max(2, Math.trunc(toFiniteNumber(wheel.dataset.wheelChunkSize, DEFAULT_DYNAMIC_WHEEL_CHUNK_SIZE)));
  const min = toOptionalFiniteNumber(wheel.dataset.wheelMin);
  const max = toOptionalFiniteNumber(wheel.dataset.wheelMax);
  if (min !== null) current = Math.max(current, min);
  if (max !== null) current = Math.min(current, max);

  const halfRange = Math.floor(chunkSize / 2);
  let top = current + halfRange * step;
  let bottom = top - (chunkSize - 1) * step;

  if (max !== null && top > max) {
    const shift = top - max;
    top -= shift;
    bottom -= shift;
  }
  if (min !== null && bottom < min) {
    const shift = min - bottom;
    top += shift;
    bottom += shift;
  }

  top = max === null ? top : Math.min(top, max);
  bottom = min === null ? bottom : Math.max(bottom, min);

  if (bottom > top) bottom = top;

  const buttons = buildWheelButtons(wheel, top, bottom, step, current);
  wheel.replaceChildren(...buttons);
  wheel.dataset.wheelTopValue = String(top);
  wheel.dataset.wheelBottomValue = String(bottom);
  wheel.dataset.wheelInitialized = "true";
}

function extendDynamicWheelOptions(wheel: HTMLElement): void {
  if (wheel.dataset.wheelDynamic !== "true") return;
  const options = wheel.querySelectorAll<HTMLButtonElement>("button[data-delta]");
  if (options.length === 0) return;

  const centered = getCenteredDetailsWheelOption(wheel);
  if (!centered) return;

  const centeredButton = centered as HTMLButtonElement;
  const centeredIndex = [...options].indexOf(centeredButton);
  if (centeredIndex === -1) return;

  const step = Math.max(1, Math.abs(Math.trunc(toFiniteNumber(wheel.dataset.wheelStep, 1))));
  const chunkSize = Math.max(2, Math.trunc(toFiniteNumber(wheel.dataset.wheelChunkSize, DEFAULT_DYNAMIC_WHEEL_CHUNK_SIZE)));
  const min = toOptionalFiniteNumber(wheel.dataset.wheelMin);
  const max = toOptionalFiniteNumber(wheel.dataset.wheelMax);

  const top = toFiniteNumber(wheel.dataset.wheelTopValue, toFiniteNumber(options[0]?.dataset.delta, 0));
  const bottom = toFiniteNumber(wheel.dataset.wheelBottomValue, toFiniteNumber(options[options.length - 1]?.dataset.delta, 0));

  if (centeredIndex <= DYNAMIC_WHEEL_EDGE_THRESHOLD && (max === null || top < max)) {
    const nextTop = max === null ? top + chunkSize * step : Math.min(top + chunkSize * step, max);
    const prependButtons = buildWheelButtons(wheel, nextTop, top + step, step, null);
    if (prependButtons.length > 0) {
      const previousScrollHeight = wheel.scrollHeight;
      wheel.prepend(...prependButtons);
      wheel.dataset.wheelTopValue = String(nextTop);
      wheel.scrollTop += wheel.scrollHeight - previousScrollHeight;
    }
  }

  const refreshedOptions = wheel.querySelectorAll<HTMLButtonElement>("button[data-delta]");
  const refreshedCentered = getCenteredDetailsWheelOption(wheel);
  const refreshedIndex = refreshedCentered ? [...refreshedOptions].indexOf(refreshedCentered as HTMLButtonElement) : centeredIndex;
  if (refreshedIndex >= refreshedOptions.length - 1 - DYNAMIC_WHEEL_EDGE_THRESHOLD && (min === null || bottom > min)) {
    const nextBottom = min === null ? bottom - chunkSize * step : Math.max(bottom - chunkSize * step, min);
    const appendButtons = buildWheelButtons(wheel, bottom - step, nextBottom, step, null);
    if (appendButtons.length > 0) {
      wheel.append(...appendButtons);
      wheel.dataset.wheelBottomValue = String(nextBottom);
    }
  }
}

function buildWheelButtons(
  wheel: HTMLElement,
  top: number,
  bottom: number,
  step: number,
  selectedValue: number | null
): HTMLButtonElement[] {
  if (!globalThis.document?.createElement) return [];
  const showSign = wheel.dataset.wheelShowSign === "true";
  const centerZeroLabel = wheel.dataset.wheelCenterZeroLabel === "true";
  const selectedDelta = selectedValue === null ? null : Math.trunc(selectedValue);
  const buttons: HTMLButtonElement[] = [];

  for (let value = top; value >= bottom; value -= step) {
    const button = globalThis.document.createElement("button");
    button.type = "button";
    button.dataset.action = wheel.dataset.wheelAction ?? "details-select-delta";
    button.dataset.delta = String(value);
    if (selectedDelta !== null && value === selectedDelta) button.classList.add("selected");
    button.textContent = formatWheelLabel(value, { showSign, centerZeroLabel });
    buttons.push(button);
  }

  return buttons;
}

function formatWheelLabel(value: number, options: { showSign: boolean; centerZeroLabel: boolean }): string {
  if (options.centerZeroLabel && value === 0) return "0";
  if (options.showSign && value > 0) return `+${value}`;
  return String(value);
}

function toFiniteNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalFiniteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Saves the shell root scroll position into the current route without pushing history.
 */
export function rememberCurrentRouteScroll(
  element: HTMLElement,
  router: MobileRouter,
  options: { writeHistory?: boolean } = {}
): MobileRoute {
  const route = router.getCurrentRoute();
  const shellElement = getShellScrollElement(element);
  const scrollTop = shellElement.scrollTop;
  const expandedDetailKeys = getExpandedDetailsStateKeys(shellElement);
  return router.updateCurrentRoute(
    {
      ...route,
      scrollTop,
      expandedDetailKeys: expandedDetailKeys.length ? expandedDetailKeys : undefined
    },
    { writeHistory: options.writeHistory !== false }
  );
}

/**
 * Reads the persisted selected character UUID and lets the active adapter create
 * the concrete default pane route for the current system.
 */
export function getStoredSelectedCharacterRoute(): CharacterRoute | undefined {
  const actorUuid = readLocalStorage(getSelectedCharacterStorageKey());
  return actorUuid ? getCharacterSheetAdapter().createPaneRoute({ actorUuid, pane: undefined }) : undefined;
}

/**
 * Persists the selected character shortcut without clearing it when the picker opens.
 */
export function persistSelectedCharacterRoute(route: CharacterRoute | undefined): void {
  if (!route?.actorUuid) return;

  writeLocalStorage(getSelectedCharacterStorageKey(), route.actorUuid);
}

export function getSelectedCharacterStorageKey(): LocalStorageKey<string> {
  const runtime = getFoundryRuntime();
  return createLocalStorageKey({
    namespace: SELECTED_CHARACTER_STORAGE_NAMESPACE,
    scope: [runtime.game?.world?.id, runtime.game?.user?.id],
    codec: nonEmptyStringLocalStorageCodec
  });
}

/**
 * Creates the Foundry settings backed recents service when UUID lookup is available.
 */
export function createFoundryRecentsService(): ReturnType<typeof createMobileRecentsService> | null {
  const runtime = getFoundryRuntime();
  const fromUuid = runtime.foundry?.utils?.fromUuid;
  const user = runtime.game?.user;
  if (!user?.id || !fromUuid) return null;

  return createMobileRecentsService({
    storage: createFoundryRecentRouteRecordStorage(),
    lookupEnvironment: {
      user,
      fromUuid: async uuid => (await fromUuid(uuid)) as FoundryDocumentLike | null | undefined
    }
  });
}

/**
 * Focuses the search input after rendering the search destination.
 */
export function restoreSearchFocus(element: HTMLElement, route: MobileRoute): void {
  if (route.view !== RouteView.Search) return;

  const input = element.querySelector<HTMLInputElement>("[data-search-input]");
  if (!input) return;

  if (!globalThis.requestAnimationFrame) {
    input.focus();
    return;
  }

  globalThis.requestAnimationFrame(() => {
    input.focus();
    const cursorPosition = input.value.length;
    input.setSelectionRange?.(cursorPosition, cursorPosition);
  });
}

/**
 * Pane-local search re-renders the character sheet as filters change. Restore
 * focus so typing continues naturally after each filtered render.
 */
export function restorePaneSearchFocus(element: HTMLElement, route: MobileRoute): void {
  if (route.view !== RouteView.Character) return;

  const pane = getCharacterSheetAdapter().normalizePane(route.pane);
  if (!getPaneSearchQuery(route, pane)) return;
  focusPaneSearchInput(element, pane);
}

export function restoreCharacterPickerSearchFocus(element: HTMLElement, route: MobileRoute): void {
  if (route.view !== RouteView.Characters) return;
  if (!normalizeCharacterPickerSearchQuery(route.query).length) return;
  focusCharacterPickerSearchInput(element);
}

function focusPaneSearchInput(element: HTMLElement, pane: ActorSheetPaneId): void {
  const input = element.querySelector<HTMLInputElement>(`[data-pane-search-input="${CSS.escape(pane)}"]`);
  if (!input) return;

  const focus = () => {
    input.focus();
    const cursorPosition = input.value.length;
    input.setSelectionRange?.(cursorPosition, cursorPosition);
  };

  if (!globalThis.requestAnimationFrame) {
    focus();
    return;
  }

  globalThis.requestAnimationFrame(focus);
}

function focusCharacterPickerSearchInput(element: HTMLElement): void {
  const input = element.querySelector<HTMLInputElement>("[data-character-picker-search-input]");
  if (!input) return;

  const focus = () => {
    input.focus();
    const cursorPosition = input.value.length;
    input.setSelectionRange?.(cursorPosition, cursorPosition);
  };

  if (!globalThis.requestAnimationFrame) {
    focus();
    return;
  }

  globalThis.requestAnimationFrame(focus);
}

/**
 * Resolves an actor UUID from Foundry or from test fixture collections.
 */
export function getActorByUuid(actorUuid: string): CharacterSheetNavigationActor | null {
  const runtime = getFoundryRuntime();
  const fromUuidSync = runtime.foundry?.utils?.fromUuidSync;
  if (fromUuidSync) return (fromUuidSync(actorUuid) as CharacterSheetNavigationActor | null | undefined) ?? null;

  for (const actor of getCollectionContents(runtime.game?.actors)) {
    const candidate = actor as CharacterSheetNavigationActor;
    if (candidate.uuid === actorUuid || (candidate.id && `Actor.${candidate.id}` === actorUuid)) return candidate;
  }

  return null;
}

export function getFirstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

function restoreExpandedDetailsState(element: HTMLElement, route: MobileRoute): void {
  if (!canQueryChildren(element)) return;

  const drawers = element.querySelectorAll<HTMLDetailsElement>("details");
  if (drawers.length === 0) return;

  const expandedKeys = new Set(route.expandedDetailKeys ?? []);
  drawers.forEach(drawer => {
    const key = getExpandableStateKey(drawer);
    if (!key) return;
    drawer.open = expandedKeys.has(key);
  });
}

function getExpandedDetailsStateKeys(element: HTMLElement): string[] {
  if (!canQueryChildren(element)) return [];

  const keys = new Set<string>();
  element.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(drawer => {
    const key = getExpandableStateKey(drawer);
    if (!key) return;
    keys.add(key);
  });

  return [...keys];
}

function getExpandableStateKey(drawer: HTMLDetailsElement): string | undefined {
  const ownKey = drawer.dataset.stateKey?.trim();
  if (ownKey) return ownKey;

  const container = drawer.closest<HTMLElement>("[data-state-key]");
  const containerKey = container?.dataset.stateKey?.trim();
  return containerKey || undefined;
}

function canQueryChildren(element: HTMLElement): element is HTMLElement & { querySelectorAll: HTMLElement["querySelectorAll"] } {
  return typeof (element as { querySelectorAll?: unknown }).querySelectorAll === "function";
}

function getShellScrollElement(element: HTMLElement): HTMLElement {
  const candidate = typeof element.querySelector === "function"
    ? element.querySelector<HTMLElement>(".pocket-foundry-root")
    : null;
  return candidate ?? element;
}

function normalizeCharacterPickerSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

