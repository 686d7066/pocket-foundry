import { RouteView } from "../../router/routes.ts";
import { ALL_SEARCH_RESULT_TYPES } from "../../services/search.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { getCharacterSheetBannerEnabled, getColorBlindMode, getMobileViewEnabled, setCharacterSheetBannerEnabled, setColorBlindMode, setMobileViewEnabled } from "../settings.ts";
import { navigateShellDestination } from "../shell-navigation.ts";
import { createFoundryRecentsService, isShellDestination, navigateCharacterPane, normalizeSearchTypeFilter, rememberCurrentRouteScroll, setCharacterPickerRouteFavorite, updateCharacterPickerFolderExpansion, updateCharacterPickerSearch } from "./controller-helpers-navigation.ts";
import { openRecentRoute, openSearchResult, runSearchImmediately } from "./controller-helpers-search.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { browserHistoryActive, closeFavoriteContextMenu, consumeShellActionEvent, recordHistoryDebug } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

export async function handleShellClickAction(context: MobileShellActionContext, target: HTMLElement, event: Event): Promise<boolean> {
  const { element, router, searchState } = context;

        if (target.dataset.action === "favorite-context-close") {
          consumeShellActionEvent(event);
          closeFavoriteContextMenu(element);
          return true;
        }

        if (target.dataset.action === "toggle-mobile-view") {
          consumeShellActionEvent(event);
          void setMobileViewEnabled(!getMobileViewEnabled());
          return true;
        }

        if (target.dataset.action === "toggle-character-banner") {
          consumeShellActionEvent(event);
          void setCharacterSheetBannerEnabled(!getCharacterSheetBannerEnabled());
          return true;
        }

        if (target.dataset.action === "toggle-color-blind-mode") {
          consumeShellActionEvent(event);
          void setColorBlindMode(!getColorBlindMode());
          return true;
        }

        if (target.dataset.action === "clear-recents") {
          consumeShellActionEvent(event);
          createFoundryRecentsService()?.clearRoutes();
          void renderShell(element, router, searchState);
          return true;
        }

        if (target.dataset.action === "navigate") {
          consumeShellActionEvent(event);
          const route = target.dataset.route;
          if (isShellDestination(route)) {
            rememberCurrentRouteScroll(element, router);
            recordHistoryDebug("click:navigate", { route, current: router.getCurrentRoute(), stack: router.getHistory() });
            void navigateShellDestination(router, route).then(() => renderShell(element, router, searchState));
          }
          return true;
        }

        if (target.dataset.action === "open-character") {
          consumeShellActionEvent(event);
          const actorUuid = target.dataset.uuid;
          if (!actorUuid) return true;

          rememberCurrentRouteScroll(element, router);
          void router.push(getCharacterSheetAdapter().createPaneRoute({ actorUuid, pane: undefined })).then(() => renderShell(element, router, searchState));
          return true;
        }

        if (target.dataset.action === "character-picker-add-favorite" || target.dataset.action === "character-picker-remove-favorite") {
          consumeShellActionEvent(event);
          const actorUuid = target.dataset.favoriteId ?? target.dataset.uuid;
          if (!actorUuid) return true;

          setCharacterPickerRouteFavorite(actorUuid, target.dataset.action === "character-picker-add-favorite");
          void renderShell(element, router, searchState);
          return true;
        }

        if (target.dataset.action === "character-picker-clear-search") {
          consumeShellActionEvent(event);
          void updateCharacterPickerSearch(element, router, searchState, "");
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
          void renderShell(element, router, searchState);
          return true;
        }

        if (target.dataset.action === "character-picker-toggle-folder") {
          consumeShellActionEvent(event);
          const folderId = target.dataset.folderId;
          if (!folderId) return true;
          const expanded = (target.dataset.expanded ?? "false") !== "true";
          void updateCharacterPickerFolderExpansion(element, router, searchState, folderId, expanded);
          return true;
        }

        if (target.dataset.action === "navigate-character-pane") {
          consumeShellActionEvent(event);
          const pane = getCharacterSheetAdapter().normalizePane(target.dataset.pane);
          void navigateCharacterPane(element, router, pane, searchState);
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
          void runSearchImmediately(element, router, searchState).then(() => renderShell(element, router, searchState));
          return true;
        }

        if (target.dataset.action === "open-search-result") {
          consumeShellActionEvent(event);
          const resultId = target.dataset.resultId;
          if (!resultId) return true;

          void openSearchResult(element, router, searchState, resultId);
          return true;
        }

        if (target.dataset.action === "open-recent") {
          consumeShellActionEvent(event);
          const recentId = target.dataset.recentId;
          if (!recentId) return true;

          void openRecentRoute(element, router, searchState, recentId);
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

          void router.back().then(() => renderShell(element, router, searchState));
          return true;
        }

  return false;
}

