import { RouteView } from "../../router/routes.ts";
import { ALL_SEARCH_RESULT_TYPES } from "../../services/search.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { getCharacterSheetBannerEnabled, getColorBlindMode, getMobileViewEnabled, setCharacterSheetBannerEnabled, setColorBlindMode, setMobileViewEnabled } from "../settings.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { navigateShellDestination } from "../shell-navigation.ts";
import { createFoundryRecentsService, isShellDestination, navigateCharacterPane, normalizeSearchTypeFilter, rememberCurrentRouteScroll, setCharacterPickerRouteFavorite, updateCharacterPickerFolderExpansion, updateCharacterPickerSearch } from "./controller-helpers-navigation.ts";
import { openRecentRoute, openSearchResult, runSearchImmediately } from "./controller-helpers-search.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { awaitHandledShellTask, browserHistoryActive, closeFavoriteContextMenu, closeShellActionErrorDialog, consumeShellActionEvent, recordHistoryDebug } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

/**
 * Handles global shell clicks that are not owned by a specific route content area.
 */
export async function handleShellClickAction(context: MobileShellActionContext, target: HTMLElement, event: Event): Promise<boolean> {
  const { element, router, searchState } = context;

        if (target.dataset.action === "favorite-context-close") {
          consumeShellActionEvent(event);
          closeFavoriteContextMenu(element);
          return true;
        }

        if (target.dataset.action === "shell-error-close") {
          consumeShellActionEvent(event);
          closeShellActionErrorDialog(element);
          return true;
        }

        if (target.dataset.action === "toggle-mobile-view") {
          consumeShellActionEvent(event);
          await awaitHandledShellTask(element, setMobileViewEnabled(!getMobileViewEnabled()), { kind: "settings", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "toggle-character-banner") {
          consumeShellActionEvent(event);
          await awaitHandledShellTask(element, setCharacterSheetBannerEnabled(!getCharacterSheetBannerEnabled()), { kind: "settings", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "toggle-color-blind-mode") {
          consumeShellActionEvent(event);
          await awaitHandledShellTask(element, setColorBlindMode(!getColorBlindMode()), { kind: "settings", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "clear-recents") {
          consumeShellActionEvent(event);
          const recents = createFoundryRecentsService();
          if (recents) {
            await awaitHandledShellTask(element, recents.clearRoutes().then(() => renderShell(element, router, searchState)), { kind: "storage", action: target.dataset.action });
          }
          return true;
        }

        if (target.dataset.action === "logout") {
          consumeShellActionEvent(event);
          getFoundryRuntime().game?.logOut?.();
          return true;
        }

        if (target.dataset.action === "navigate") {
          consumeShellActionEvent(event);
          const route = target.dataset.route;
          if (isShellDestination(route)) {
            rememberCurrentRouteScroll(element, router);
            recordHistoryDebug("click:navigate", { route, current: router.getCurrentRoute(), stack: router.getHistory() });
            await awaitHandledShellTask(element, navigateShellDestination(router, route).then(() => renderShell(element, router, searchState)), { kind: "navigation", action: target.dataset.action });
          }
          return true;
        }

        if (target.dataset.action === "open-character") {
          consumeShellActionEvent(event);
          const actorUuid = target.dataset.uuid;
          if (!actorUuid) return true;

          rememberCurrentRouteScroll(element, router);
          await awaitHandledShellTask(element, router.push(getCharacterSheetAdapter().createPaneRoute({ actorUuid, pane: undefined })).then(() => renderShell(element, router, searchState)), { kind: "navigation", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "character-picker-add-favorite" || target.dataset.action === "character-picker-remove-favorite") {
          consumeShellActionEvent(event);
          const actorUuid = target.dataset.favoriteId ?? target.dataset.uuid;
          if (!actorUuid) return true;

          await awaitHandledShellTask(element, setCharacterPickerRouteFavorite(actorUuid, target.dataset.action === "character-picker-add-favorite").then(() => renderShell(element, router, searchState)), { kind: "storage", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "character-picker-clear-search") {
          consumeShellActionEvent(event);
          await awaitHandledShellTask(element, updateCharacterPickerSearch(element, router, searchState, ""), { kind: "search", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "character-picker-toggle-favorite-help") {
          consumeShellActionEvent(event);
          const activeRoute = router.getCurrentRoute();
          if (activeRoute.view !== RouteView.Characters) return true;

          router.updateCurrentRoute({
            ...activeRoute,
            favoriteHelpOpen: !activeRoute.favoriteHelpOpen
          });
          await awaitHandledShellTask(element, renderShell(element, router, searchState), { kind: "render", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "character-picker-toggle-folder") {
          consumeShellActionEvent(event);
          const folderId = target.dataset.folderId;
          if (!folderId) return true;
          const expanded = (target.dataset.expanded ?? "false") !== "true";
          await awaitHandledShellTask(element, updateCharacterPickerFolderExpansion(element, router, searchState, folderId, expanded), { kind: "navigation", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "navigate-character-pane") {
          consumeShellActionEvent(event);
          const pane = getCharacterSheetAdapter().normalizePane(target.dataset.pane);
          await awaitHandledShellTask(element, navigateCharacterPane(element, router, pane, searchState), { kind: "navigation", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "search-type-filter") {
          consumeShellActionEvent(event);
          const activeRoute = router.getCurrentRoute();
          if (activeRoute.view !== RouteView.Search) return true;

          const typeFilter = normalizeSearchTypeFilter(target.dataset.typeFilter);
          router.updateCurrentRoute({
            ...activeRoute,
            typeFilter: typeFilter === ALL_SEARCH_RESULT_TYPES ? undefined : typeFilter,
            scrollTop: 0
          });
          await awaitHandledShellTask(element, runSearchImmediately(element, router, searchState).then(() => renderShell(element, router, searchState)), { kind: "search", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "open-search-result") {
          consumeShellActionEvent(event);
          const resultId = target.dataset.resultId;
          if (!resultId) return true;

          await awaitHandledShellTask(element, openSearchResult(element, router, searchState, resultId), { kind: "navigation", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "open-recent") {
          consumeShellActionEvent(event);
          const recentId = target.dataset.recentId;
          if (!recentId) return true;

          await awaitHandledShellTask(element, openRecentRoute(element, router, searchState, recentId), { kind: "navigation", action: target.dataset.action });
          return true;
        }

        if (target.dataset.action === "back") {
          consumeShellActionEvent(event);
          rememberCurrentRouteScroll(element, router);
          recordHistoryDebug("click:back", { current: router.getCurrentRoute(), stack: router.getHistory(), historyLength: globalThis.history?.length });
          if (router.canGoBack() && browserHistoryActive) {
            globalThis.history.back();
            return true;
          }

          await awaitHandledShellTask(element, router.back().then(() => renderShell(element, router, searchState)), { kind: "navigation", action: target.dataset.action });
          return true;
        }

  return false;
}

