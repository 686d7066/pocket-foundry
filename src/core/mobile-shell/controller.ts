import { disposeTableLayout } from "./table-layout.ts";
import { disposeShellRendering } from "./render-ownership.ts";
import { getPocketFoundryRouteFromHash } from "../../router/browser-history.ts";
import { createMobileRouter } from "../../router/mobile-router.ts";
import { createReactiveRefreshController, type ReactiveRefreshController, type ReactiveRefreshHooks } from "../../services/reactive-refresh.ts";
import { createConnectionRecoveryController, type ConnectionRecoveryController, type ConnectionSocket } from "../../services/connection-recovery.ts";
import { refreshDocumentFromDatabase } from "../../services/document-recovery.ts";
import { RouteView, type MobileRoute } from "../../router/routes.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { createViewportOwnershipController } from "../viewport-ownership.ts";
import { createFoundryRecentsService, createFoundryRoutePermissionResolver, getActorByUuid, getStoredSelectedCharacterRoute, rememberCurrentRouteScroll } from "./controller-helpers-navigation.ts";
import { clearSearchDebounce, createInitialSearchUiState, runSearchImmediately } from "./controller-helpers-search.ts";
import { normalizeCharacterRoutePanes, renderShell } from "./controller-helpers-shell.ts";
import { activateBrowserHistory, bindBrowserBack, uninstallLeaveGameConfirmGuard, writeBrowserHistory } from "./controller-helpers-browser-history.ts";
import { reportShellActionError } from "./controller-helpers-ui.ts";
import { bindMobileShellEvents } from "./events.ts";
import type { MobileShellController } from "./types.ts";
import { disposeCharacterMutationCoordinator, getCharacterMutationCoordinator } from "./character-mutation-coordinator.ts";

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
  let connectionRecovery: ConnectionRecoveryController | undefined;
  let unsubscribeConnectionRouteRecovery: (() => void) | undefined;
  let unsubscribeRecentRouteRecording: (() => void) | undefined;
  let lastVisitedRoute: string | undefined;
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
      unsubscribeRecentRouteRecording = router.subscribe(route => {
        recordRecentRoute(route, element);
      });
      recordRecentRoute(router.getCurrentRoute(), element);
      reactiveRefresh = createReactiveRefreshController({
        hooks: getFoundryRuntime().Hooks as ReactiveRefreshHooks | undefined,
        getRoute: () => router.getCurrentRoute(),
        preserveTransientState: () => {
          if (rootElement) rememberCurrentRouteScroll(rootElement, router, { writeHistory: false });
        },
        onRefresh: async () => {
          const route = router.getCurrentRoute();
          const actorUuid = route.view === RouteView.Character || route.view === RouteView.OwnedDocument ? route.actorUuid : undefined;
          if (rootElement && !(actorUuid && getCharacterMutationCoordinator(rootElement).isPending(actorUuid))) {
            await renderShell(rootElement, router, searchState);
          }
        },
        onSearchInvalidated: async () => {
          if (rootElement) await runSearchImmediately(rootElement, router, searchState);
        }
      });
      const mutationCoordinator = getCharacterMutationCoordinator(element);
      const socket = getFoundryRuntime().game?.socket as ConnectionSocket | undefined;
      const isSocketConnected = (): boolean => socket?.connected !== false;
      let recoveryChain = Promise.resolve();
      let connectionGeneration = 0;
      let lastRecoveryRouteActor = getActiveActorUuid(router.getCurrentRoute());
      const requestActorRecovery = (actorUuid: string, isCurrent: () => boolean, connectionResume = false): Promise<void> => {
        const generation = connectionGeneration;
        const task = recoveryChain.then(async () => {
          if (rootElement !== element || !isSocketConnected() || generation !== connectionGeneration || !isCurrent()) return;
          mutationCoordinator.beginRecovery(actorUuid, connectionResume);
          const actor = getActorByUuid(actorUuid);
          const refreshed = await refreshDocumentFromDatabase(actor, {
            isCurrent: () => rootElement === element && isSocketConnected()
              && generation === connectionGeneration && isCurrent()
          });
          if (rootElement !== element || !isSocketConnected() || generation !== connectionGeneration || !isCurrent()) return;
          mutationCoordinator.completeRecovery(actorUuid, refreshed);
          if (refreshed) {
            const route = router.getCurrentRoute();
            if ((route.view === RouteView.Character || route.view === RouteView.OwnedDocument) && route.actorUuid === actorUuid) {
              await renderShell(element, router, searchState, { preserveOpenCharacterDialog: true });
              mutationCoordinator.syncStatus();
            }
          }
        });
        recoveryChain = task.catch(() => undefined);
        return task;
      };
      mutationCoordinator.setReconcileHandler(actorUuid => {
        if (isSocketConnected()) void requestActorRecovery(actorUuid, () => rootElement === element);
      });
      connectionRecovery = createConnectionRecoveryController({
        socket,
        document: globalThis.document,
        window: globalThis.window,
        onDisconnected: () => {
          connectionGeneration += 1;
          mutationCoordinator.markDisconnected();
        },
        onRecoveryRequested: isCurrent => {
          const route = router.getCurrentRoute();
          const actorUuid = route.view === RouteView.Character || route.view === RouteView.OwnedDocument ? route.actorUuid : undefined;
          if (!actorUuid) {
            mutationCoordinator.markResumeRequired();
            return;
          }
          return requestActorRecovery(actorUuid, isCurrent, true);
        }
      });
      unsubscribeConnectionRouteRecovery = router.subscribe(route => {
        const actorUuid = getActiveActorUuid(route);
        if (actorUuid === lastRecoveryRouteActor) return;
        lastRecoveryRouteActor = actorUuid;
        if (actorUuid && isSocketConnected() && mutationCoordinator.isBlocked(actorUuid)) {
          void requestActorRecovery(actorUuid, () => rootElement === element);
        }
      });
      const routeAfterMount = router.getCurrentRoute();
      const actorAfterMount = routeAfterMount.view === RouteView.Character || routeAfterMount.view === RouteView.OwnedDocument
        ? routeAfterMount.actorUuid
        : undefined;
      if (actorAfterMount && mutationCoordinator.isBlocked(actorAfterMount) && isSocketConnected()) {
        void requestActorRecovery(actorAfterMount, () => rootElement === element);
      }
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

  /** Records a completed route visit without delaying navigation or rendering. */
  function recordRecentRoute(route: MobileRoute, element: HTMLElement): void {
    const serializedRoute = JSON.stringify(route);
    if (serializedRoute === lastVisitedRoute) return;
    lastVisitedRoute = serializedRoute;
    const service = createFoundryRecentsService();
    if (!service) return;

    void service.recordRoute(route).then(recorded => {
      if (!recorded || rootElement !== element || router.getCurrentRoute().view !== RouteView.Recents) return;
      void renderShell(element, router, searchState).catch(error => {
        if (rootElement !== element) return;
        reportShellActionError(element, error, { kind: "render", action: "refresh-recents-after-record" });
      });
    }).catch(error => {
      if (rootElement !== element) return;
      reportShellActionError(element, error, { kind: "storage", action: "record-recent-route" });
    });
  }

  /** Invalidates async renders before removing listeners and the owned DOM root. */
  function unmount(): void {
    if (rootElement) disposeShellRendering(rootElement);
    pendingMount = undefined;
    abortController?.abort();
    abortController = undefined;
    reactiveRefresh?.dispose();
    reactiveRefresh = undefined;
    connectionRecovery?.dispose();
    connectionRecovery = undefined;
    unsubscribeConnectionRouteRecovery?.();
    unsubscribeConnectionRouteRecovery = undefined;
    unsubscribeRecentRouteRecording?.();
    unsubscribeRecentRouteRecording = undefined;
    lastVisitedRoute = undefined;
    clearSearchDebounce(searchState);
    unbindBrowserBack?.();
    unbindBrowserBack = undefined;
    if (rootElement) {
      disposeTableLayout(rootElement);
      disposeCharacterMutationCoordinator(rootElement);
    }
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

/** Returns the actor whose authoritative state is displayed by the active route. */
function getActiveActorUuid(route: MobileRoute): string | undefined {
  return route.view === RouteView.Character || route.view === RouteView.OwnedDocument ? route.actorUuid : undefined;
}
