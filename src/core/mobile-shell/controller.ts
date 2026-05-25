import { getPocketFoundryRouteFromHash } from "../../router/browser-history.ts";
import { createMobileRouter } from "../../router/mobile-router.ts";
import { createReactiveRefreshController, type ReactiveRefreshController, type ReactiveRefreshHooks } from "../../services/reactive-refresh.ts";
import { getCharacterSheetAdapter, hasCharacterSheetAdapterForSystem } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { createViewportOwnershipController } from "../viewport-ownership.ts";
import { createFoundryRoutePermissionResolver, getStoredSelectedCharacterRoute, rememberCurrentRouteScroll } from "./controller-helpers-navigation.ts";
import { clearSearchDebounce, createInitialSearchUiState, runSearchImmediately } from "./controller-helpers-search.ts";
import { normalizeCharacterRoutePanes, renderShell } from "./controller-helpers-shell.ts";
import { activateBrowserHistory, bindBrowserBack, uninstallLeaveGameConfirmGuard, writeBrowserHistory } from "./controller-helpers-ui.ts";
import { bindMobileShellEvents } from "./events.ts";
import type { MobileShellController } from "./types.ts";

export type { MobileShellController } from "./types.ts";

/**
 * Creates the mobile shell controller and registers browser Back interception.
 */
export function createMobileShellController(): MobileShellController {
  let rootElement: HTMLElement | undefined;
  let abortController: AbortController | undefined;
  const initialHashRoute = getPocketFoundryRouteFromHash(globalThis.location?.hash ?? "");
  const initialSelectedCharacterRoute = getStoredSelectedCharacterRoute();
  const router = createMobileRouter({
    initialRoute: normalizeCharacterRoutePanes(initialHashRoute ?? initialSelectedCharacterRoute, getCharacterSheetAdapter()),
    selectedCharacterRoute: initialSelectedCharacterRoute,
    permissions: createFoundryRoutePermissionResolver(),
    onRouteChange: (_, nextRoute, mode) => writeBrowserHistory(nextRoute, mode)
  });
  const viewportOwnership = createViewportOwnershipController();
  const searchState = createInitialSearchUiState();
  let reactiveRefresh: ReactiveRefreshController | undefined;
  let unbindBrowserBack: (() => void) | undefined;

  async function synchronizeInitialRouteFromCurrentHash(): Promise<void> {
    const hashRoute = getPocketFoundryRouteFromHash(globalThis.location?.hash ?? "");
    const fallbackRoute = hashRoute ? undefined : getStoredSelectedCharacterRoute();
    const selectedRoute = (hashRoute ?? fallbackRoute);
    const route = normalizeCharacterRoutePanes(selectedRoute, getCharacterSheetAdapter());
    if (!route) return;

    await router.replace(route);
  }

  async function mount(): Promise<void> {
    if (rootElement) {
      if (!unbindBrowserBack) unbindBrowserBack = bindBrowserBack(router, () => rootElement, searchState);
      viewportOwnership.acquire();
      await renderShell(rootElement, router, searchState);
      return;
    }

    if (!globalThis.document?.body) return;

    rootElement = document.createElement("div");
    rootElement.id = MODULE_ID + "-root";
    rootElement.dataset.pocketFoundryShell = "active";

    try {
      await synchronizeInitialRouteFromCurrentHash();
      await renderShell(rootElement, router, searchState);
      document.body.append(rootElement);
      unbindBrowserBack = bindBrowserBack(router, () => rootElement, searchState);
      bindEvents(rootElement);
      reactiveRefresh = createReactiveRefreshController({
        hooks: (globalThis as { Hooks?: ReactiveRefreshHooks }).Hooks,
        getRoute: () => router.getCurrentRoute(),
        preserveTransientState: () => {
          if (rootElement) rememberCurrentRouteScroll(rootElement, router, { writeHistory: false });
        },
        onRefresh: async () => {
          if (rootElement) await renderShell(rootElement, router, searchState);
        },
        onSearchInvalidated: async () => {
          if (rootElement) await runSearchImmediately(rootElement, router, searchState);
        }
      });
      activateBrowserHistory(router);
      viewportOwnership.acquire();
    } catch (error) {
      rootElement.remove();
      rootElement = undefined;
      viewportOwnership.release();
      globalThis.console?.error?.(MODULE_ID + " failed to render the mobile shell.", error);
      throw error;
    }
  }

  function bindEvents(element: HTMLElement): void {
    abortController?.abort();
    abortController = new AbortController();
    bindMobileShellEvents({ element, abortController, router, searchState });
  }

  function unmount(): void {
    abortController?.abort();
    abortController = undefined;
    reactiveRefresh?.dispose();
    reactiveRefresh = undefined;
    clearSearchDebounce(searchState);
    unbindBrowserBack?.();
    unbindBrowserBack = undefined;
    rootElement?.remove();
    rootElement = undefined;
    uninstallLeaveGameConfirmGuard();
    viewportOwnership.release();
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      if (!hasCharacterSheetAdapterForSystem()) {
        const runtime = getFoundryRuntime();
        const system = runtime.game?.system;
        const systemName = (system as { title?: string } | undefined)?.title ?? system?.id ?? "Unknown";
        globalThis.console?.error?.(MODULE_ID + " cannot enable mobile shell: " + systemName + " character sheets are not supported.");
        unmount();
        return;
      }

      await mount();
      return;
    }

    unmount();
  }

  async function refresh(): Promise<void> {
    if (rootElement) await renderShell(rootElement, router, searchState);
  }

  return {
    isMounted: () => Boolean(rootElement),
    mount,
    unmount,
    setMobileViewEnabled: setEnabled,
    refresh
  };
}

