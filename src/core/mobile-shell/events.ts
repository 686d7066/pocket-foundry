import type { MobileRouter } from "../../router/mobile-router.ts";
import { bindActionPopoverPositioning } from "./action-popovers.ts";
import { bindNumberWheelDragging } from "./number-wheel-drag.ts";
import { RouteView, type CharacterRoute } from "../../router/routes.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { handleCombatClickAction } from "./actions-combat.ts";
import { handleCharacterSheetClickAction } from "./actions-character-sheet.ts";
import { handleJournalClickAction } from "./actions-journal.ts";
import { handleShellClickAction } from "./actions-shell.ts";
import { navigateCharacterPane, rememberCurrentRouteScroll, updateCharacterPickerSearch, updateNumberWheelSelection, updatePaneSearch } from "./controller-helpers-navigation.ts";
import { handleEnrichedDocumentLinkClick, scheduleSearch } from "./controller-helpers-search.ts";
import { updateJournalPageDraftFields } from "./controller-helpers-journal-dialogs.ts";
import { openFavoriteContextMenu, reportShellActionError, runHandledShellTask } from "./controller-helpers-ui.ts";
import type { SearchUiState } from "./types.ts";

type SwipeStart = { x: number; y: number; route: CharacterRoute };

/**
 * Binds delegated shell event handlers for navigation, actions, search, scroll
 * persistence, browser history, and touch gestures.
 */
export function bindMobileShellEvents(options: {
  element: HTMLElement;
  abortController: AbortController;
  router: MobileRouter;
  searchState: SearchUiState;
}): void {
  const { element, abortController, router, searchState } = options;
  bindActionPopoverPositioning(element, abortController.signal);
  bindNumberWheelDragging(element, abortController.signal);
  const actionContext = { element, router, searchState };
  let swipeStart: SwipeStart | undefined;
  let favoriteLongPressTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const clearFavoriteLongPress = (): void => {
    if (!favoriteLongPressTimer) return;
    globalThis.clearTimeout(favoriteLongPressTimer);
    favoriteLongPressTimer = undefined;
  };

  element.addEventListener(
    "click",
    async event => {
      try {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
        const isHtmlButton =
          typeof globalThis.HTMLButtonElement !== "undefined" && target instanceof globalThis.HTMLButtonElement;
        const getAttribute = typeof (target as { getAttribute?: unknown } | null)?.getAttribute === "function"
          ? (target as { getAttribute: (name: string) => string | null }).getAttribute.bind(target)
          : undefined;
        const isDisabledControl = isHtmlButton ? target.disabled : (getAttribute?.("disabled") ?? null) !== null;
        const isAriaDisabled = (getAttribute?.("aria-disabled") ?? null) === "true";
        if (isDisabledControl || isAriaDisabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!target) {
          await handleEnrichedDocumentLinkClick(event, element, router, searchState);
          return;
        }

        target.closest?.<HTMLElement>("[data-action-popover]")?.hidePopover();
        if (await handleShellClickAction(actionContext, target, event)) return;
        if (await handleCombatClickAction(actionContext, target, event)) return;
        if (await handleJournalClickAction(actionContext, target, event)) return;
        await handleCharacterSheetClickAction(actionContext, target, event);
      } catch (error) {
        reportShellActionError(element, error, { kind: "unknown", action: "click" });
      }
    },
    { signal: abortController.signal }
  );

  element.addEventListener(
    "change",
    event => {
      try {
        const pageTypeSelect = event.target instanceof Element ? event.target.closest<HTMLSelectElement>("[data-journal-page-type-select]") : null;
        if (pageTypeSelect) updateJournalPageDraftFields(pageTypeSelect.closest<HTMLFormElement>("[data-journal-page-draft-form]"));
      } catch (error) {
        reportShellActionError(element, error, { kind: "journal", action: "journal-page-type-change" });
      }
    },
    { signal: abortController.signal }
  );

  element.addEventListener(
    "scroll",
    event => {
      const wheel = event.target instanceof Element ? event.target.closest<HTMLElement>(".spinner-wheel") : null;
      if (wheel) updateNumberWheelSelection(wheel);
    },
    { capture: true, signal: abortController.signal, passive: true }
  );

  element.addEventListener(
    "contextmenu",
    event => {
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>(".favorite-context-row, [data-favorite-context]") : null;
      if (!row?.querySelector(".favorite-context-menu [data-action]")) return;

      event.preventDefault();
      openFavoriteContextMenu(element, row);
    },
    { signal: abortController.signal }
  );

  element.addEventListener(
    "input",
    event => {
      try {
        const characterPickerSearch = event.target instanceof Element ? event.target.closest<HTMLInputElement>("[data-character-picker-search-input]") : null;
        if (characterPickerSearch?.dataset.characterPickerSearchInput) {
          runHandledShellTask(element, updateCharacterPickerSearch(element, router, searchState, characterPickerSearch.value), { kind: "search", action: "character-picker-search" });
          return;
        }

        const paneSearch = event.target instanceof Element ? event.target.closest<HTMLInputElement>("[data-pane-search-input]") : null;
        if (paneSearch?.dataset.paneSearchInput) {
          const pane = getCharacterSheetAdapter().normalizePane(paneSearch.dataset.paneSearchInput);
          runHandledShellTask(element, updatePaneSearch(element, router, searchState, pane, paneSearch.value), { kind: "search", action: "pane-search" });
          return;
        }

        const target = event.target instanceof Element ? event.target.closest<HTMLInputElement>("[data-search-input]") : null;
        if (!target || !("searchInput" in target.dataset)) return;

        const activeRoute = router.getCurrentRoute();
        if (activeRoute.view !== RouteView.Search) return;

        router.updateCurrentRoute({
          ...activeRoute,
          query: target.value,
          focusedResultId: undefined,
          scrollTop: 0
        });
        scheduleSearch(element, router, searchState);
      } catch (error) {
        reportShellActionError(element, error, { kind: "search", action: "search-input" });
      }
    },
    { signal: abortController.signal }
  );

  element.addEventListener(
    "scroll",
    () => rememberCurrentRouteScroll(element, router, { writeHistory: false }),
    { signal: abortController.signal, passive: true }
  );

  element.addEventListener(
    "toggle",
    event => {
      const drawer = event.target instanceof Element ? event.target.closest<HTMLElement>("details") : null;
      if (!drawer?.closest<HTMLElement>("[data-state-key]")?.dataset.stateKey) return;
      rememberCurrentRouteScroll(element, router, { writeHistory: false });
    },
    { capture: true, signal: abortController.signal }
  );

  element.addEventListener(
    "touchstart",
    event => {
      const route = router.getCurrentRoute();
      const touch = event.touches[0];
      const target = event.target;
      clearFavoriteLongPress();

      const favoriteRow = target instanceof Element ? target.closest<HTMLElement>(".favorite-context-row, [data-favorite-context]") : null;
      if (favoriteRow?.querySelector(".favorite-context-menu [data-action]")
        && !(target instanceof Element && target.closest("[popovertarget], [data-action-popover]"))) {
        favoriteLongPressTimer = globalThis.setTimeout(() => openFavoriteContextMenu(element, favoriteRow), 550);
      }

      const characterSheetAdapter = getCharacterSheetAdapter();
      if (!characterSheetAdapter.isCharacterRoute(route) || !touch || characterSheetAdapter.isInteractiveSwipeTarget(target)) {
        swipeStart = undefined;
        return;
      }

      if (!(target instanceof Element) || !target.closest("[data-swipe-region='character-pane']")) {
        swipeStart = undefined;
        return;
      }

      swipeStart = { x: touch.clientX, y: touch.clientY, route };
    },
    { signal: abortController.signal, passive: true }
  );

  element.addEventListener("touchmove", clearFavoriteLongPress, { signal: abortController.signal, passive: true });
  element.addEventListener("touchcancel", clearFavoriteLongPress, { signal: abortController.signal, passive: true });

  element.addEventListener(
    "touchend",
    event => {
      try {
        clearFavoriteLongPress();
        if (!swipeStart) return;

        const touch = event.changedTouches[0];
        const activeRoute = router.getCurrentRoute();
        const start = swipeStart;
        swipeStart = undefined;

        const characterSheetAdapter = getCharacterSheetAdapter();
        if (!touch || !characterSheetAdapter.isCharacterRoute(activeRoute) || activeRoute.actorUuid !== start.route.actorUuid || activeRoute.pane !== start.route.pane) return;

        const pane = characterSheetAdapter.getPaneFromSwipe(activeRoute.pane, {
          startX: start.x,
          startY: start.y,
          endX: touch.clientX,
          endY: touch.clientY
        });
        if (!pane) return;

        event.preventDefault();
        event.stopPropagation();
        runHandledShellTask(element, navigateCharacterPane(element, router, pane, searchState), { kind: "navigation", action: "swipe-character-pane" });
      } catch (error) {
        reportShellActionError(element, error, { kind: "navigation", action: "swipe-character-pane" });
      }
    },
    { signal: abortController.signal }
  );
}

