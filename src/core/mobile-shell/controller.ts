import { disposeTableLayout } from "./table-layout.ts";
import { disposeShellRendering } from "./render-ownership.ts";
import { getPocketFoundryRouteFromHash } from "../../router/browser-history.ts";
import { createMobileRouter } from "../../router/mobile-router.ts";
import { createReactiveRefreshController, type ReactiveRefreshController, type ReactiveRefreshHooks } from "../../services/reactive-refresh.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { createViewportOwnershipController } from "../viewport-ownership.ts";
import { createFoundryRoutePermissionResolver, getStoredSelectedCharacterRoute, rememberCurrentRouteScroll } from "./controller-helpers-navigation.ts";
import { clearSearchDebounce, createInitialSearchUiState, runSearchImmediately } from "./controller-helpers-search.ts";
import { normalizeCharacterRoutePanes, renderShell } from "./controller-helpers-shell.ts";
import { activateBrowserHistory, bindBrowserBack, uninstallLeaveGameConfirmGuard, writeBrowserHistory } from "./controller-helpers-browser-history.ts";
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
  let pendingMount: Promise<void> | undefined;

  async function synchronizeInitialRouteFromCurrentHash(): Promise<void> {
    const hashRoute = getPocketFoundryRouteFromHash(globalThis.location?.hash ?? "");
    const fallbackRoute = hashRoute ? undefined : getStoredSelectedCharacterRoute();
    const selectedRoute = (hashRoute ?? fallbackRoute);
    const route = normalizeCharacterRoutePanes(selectedRoute, getCharacterSheetAdapter());
    if (!route) return;

    await router.replace(route);
  }

  /** Coalesces mount requests while initialization is still pending. */
  async function mount(): Promise<void> {
    if (pendingMount) return pendingMount;
    const task = mountRoot();
    pendingMount = task;
    try {
      await task;
    } finally {
      if (pendingMount === task) pendingMount = undefined;
    }
  }

  /** Initializes one root without allowing retired work to attach after unmount. */
  async function mountRoot(): Promise<void> {
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
    const element = rootElement;

    try {
      await synchronizeInitialRouteFromCurrentHash();
      if (rootElement !== element) return;
      await renderShell(element, router, searchState);
      if (rootElement !== element) return;
      document.body.append(element);
      unbindBrowserBack = bindBrowserBack(router, () => rootElement, searchState);
      bindEvents(rootElement);
      reactiveRefresh = createReactiveRefreshController({
        hooks: getFoundryRuntime().Hooks as ReactiveRefreshHooks | undefined,
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
      disposeShellRendering(element);
      disposeTableLayout(element);
      element.remove();
      if (rootElement !== element) return;
      unmount();
      globalThis.console?.error?.(MODULE_ID + " failed to render the mobile shell.", error);
      throw error;
    }
  }

  function bindEvents(element: HTMLElement): void {
    abortController?.abort();
    abortController = new AbortController();
    bindMobileShellEvents({ element, abortController, router, searchState });
  }

  /** Invalidates async renders before removing listeners and the owned DOM root. */
  function unmount(): void {
    if (rootElement) disposeShellRendering(rootElement);
    pendingMount = undefined;
    abortController?.abort();
    abortController = undefined;
    reactiveRefresh?.dispose();
    reactiveRefresh = undefined;
    clearSearchDebounce(searchState);
    unbindBrowserBack?.();
    unbindBrowserBack = undefined;
    if (rootElement) disposeTableLayout(rootElement);
    rootElement?.remove();
    rootElement = undefined;
    uninstallLeaveGameConfirmGuard();
    viewportOwnership.release();
  }

  /** Enables shared Foundry views regardless of character-sheet adapter support. */
  async function setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
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

