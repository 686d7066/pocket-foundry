import { getBrowserHistoryWriteMode, type BrowserHistoryWriteMode } from "./browser-history.ts";
import { resolvePermittedRoute, type RoutePermissionResolver } from "./route-permissions.ts";
import { cloneRoute, createShellRoute, getShellDestination, RouteView, ShellDestination, type CharacterRoute, type MobileRoute } from "./routes.ts";

/**
 * Listener invoked after the current concrete mobile route changes.
 */
export type RouteChangeHandler = (route: MobileRoute) => void | Promise<void>;

/**
 * In-memory mobile route stack used by the shell and browser-history bridge.
 */
export type MobileRouter = {
  getCurrentRoute: () => MobileRoute;
  getHistory: () => readonly MobileRoute[];
  canGoBack: () => boolean;
  push: (route: MobileRoute) => Promise<MobileRoute>;
  replace: (route: MobileRoute) => Promise<MobileRoute>;
  back: () => Promise<MobileRoute>;
  restore: (route: MobileRoute) => Promise<MobileRoute>;
  updateCurrentRoute: (route: MobileRoute, options?: { writeHistory?: boolean }) => MobileRoute;
  getSelectedCharacterRoute: () => CharacterRoute | undefined;
  openShellDestination: (destination: ShellDestination) => Promise<MobileRoute>;
  openSearch: (route?: Partial<Extract<MobileRoute, { view: RouteView.Search }>>) => Promise<MobileRoute>;
  selectSearchRoute: (route: MobileRoute) => Promise<MobileRoute>;
  subscribe: (handler: RouteChangeHandler) => () => void;
};

/**
 * Router construction options for initial route hydration and permission fallback.
 */
export type MobileRouterOptions = {
  initialRoute?: MobileRoute;
  selectedCharacterRoute?: CharacterRoute;
  permissions?: RoutePermissionResolver;
  onRouteChange?: (previousRoute: MobileRoute, nextRoute: MobileRoute, mode: BrowserHistoryWriteMode) => void;
};

/**
 * Creates the mobile router that owns exact route state and back-stack behavior.
 *
 * Routes are permission-resolved before becoming current so unavailable targets
 * fall back without leaking hidden document names through rendered state.
 */
export function createMobileRouter(options: MobileRouterOptions = {}): MobileRouter {
  const permissions = options.permissions ?? {};
  const areaState = new Map<ShellDestination, MobileRoute>();
  const history: MobileRoute[] = [];
  const listeners = new Set<RouteChangeHandler>();
  let currentRoute = resolvePermittedRoute(options.initialRoute ?? { view: RouteView.Characters }, permissions);
  let selectedCharacterRoute = resolveSelectedCharacterRoute(options.selectedCharacterRoute);

  saveAreaState(currentRoute);
  saveSelectedCharacterRoute(currentRoute);

  async function push(route: MobileRoute): Promise<MobileRoute> {
    const previousRoute = cloneRoute(currentRoute);
    history.push(cloneRoute(currentRoute));
    currentRoute = resolvePermittedRoute(route, permissions);
    saveAreaState(currentRoute);
    notifyRouteChanged(previousRoute, getBrowserHistoryWriteMode(previousRoute, currentRoute));
    await notify();
    return cloneRoute(currentRoute);
  }

  async function replace(route: MobileRoute): Promise<MobileRoute> {
    const previousRoute = cloneRoute(currentRoute);
    currentRoute = resolvePermittedRoute(route, permissions);
    saveAreaState(currentRoute);
    notifyRouteChanged(previousRoute, "replace");
    await notify();
    return cloneRoute(currentRoute);
  }

  async function back(): Promise<MobileRoute> {
    const previousRoute = cloneRoute(currentRoute);
    while (history.length > 0) {
      const previous = history.pop();
      if (!previous) break;

      const resolved = resolvePermittedRoute(previous, permissions);
      currentRoute = resolved;
      saveAreaState(currentRoute);
      notifyRouteChanged(previousRoute, "replace");
      await notify();
      return cloneRoute(currentRoute);
    }

    return cloneRoute(currentRoute);
  }

  async function restore(route: MobileRoute): Promise<MobileRoute> {
    const previousRoute = cloneRoute(currentRoute);
    // Browser Back restores a route already represented in the mirrored history.
    // Trimming keeps the internal stack aligned with the browser traversal.
    const matchingHistoryIndex = findLastMatchingHistoryIndex(route);
    if (matchingHistoryIndex >= 0) {
      history.splice(matchingHistoryIndex);
    }

    const resolvedRoute = resolvePermittedRoute(route, permissions);
    if (JSON.stringify(previousRoute) !== JSON.stringify(resolvedRoute)) {
      currentRoute = resolvedRoute;
      saveAreaState(currentRoute);
      notifyRouteChanged(previousRoute, "replace");
    }
    saveAreaState(currentRoute);
    await notify();
    return cloneRoute(currentRoute);
  }

  function updateCurrentRoute(route: MobileRoute, options: { writeHistory?: boolean } = {}): MobileRoute {
    const previousRoute = cloneRoute(currentRoute);
    // Scroll updates should not create a back-stack entry, but they must update
    // saved area state so later navigation can restore the exact route.
    currentRoute = resolvePermittedRoute(route, permissions);
    saveAreaState(currentRoute);
    if (options.writeHistory !== false) {
      notifyRouteChanged(previousRoute, "replace");
    }
    return cloneRoute(currentRoute);
  }

  function notifyRouteChanged(previousRoute: MobileRoute, mode: BrowserHistoryWriteMode): void {
    if (JSON.stringify(previousRoute) === JSON.stringify(currentRoute)) return;
    if (!options.onRouteChange) return;

    try {
      options.onRouteChange(previousRoute, cloneRoute(currentRoute), mode);
    } catch {
      // Route-history side effects should not block navigation updates.
    }
  }

  async function openShellDestination(destination: ShellDestination): Promise<MobileRoute> {
    const currentDestination = getShellDestination(currentRoute);
    if (destination === ShellDestination.Characters) {
      const characterPickerRoute = createShellRoute(ShellDestination.Characters);
      if (currentRoute.view === RouteView.Character || !selectedCharacterRoute) {
        return currentRoute.view === RouteView.Characters ? replace(characterPickerRoute) : push(characterPickerRoute);
      }

      return push(selectedCharacterRoute);
    }

    if (destination === ShellDestination.Search) {
      return currentDestination === ShellDestination.Search ? replace(getSavedAreaRoute(ShellDestination.Search)) : openSearch();
    }

    if (destination === ShellDestination.Journal && currentDestination === ShellDestination.Journal) {
      return replace(createShellRoute(ShellDestination.Journal));
    }

    const savedRoute = getSavedAreaRoute(destination);
    return currentDestination === destination ? replace(savedRoute) : push(savedRoute);
  }

  async function openSearch(route: Partial<Extract<MobileRoute, { view: RouteView.Search }>> = {}): Promise<MobileRoute> {
    return push({
      view: RouteView.Search,
      query: route.query ?? "",
      ...(route.typeFilter === undefined ? {} : { typeFilter: route.typeFilter }),
      ...(route.focusedResultId === undefined ? {} : { focusedResultId: route.focusedResultId }),
      ...(route.scrollTop === undefined ? {} : { scrollTop: route.scrollTop })
    });
  }

  async function selectSearchRoute(route: MobileRoute): Promise<MobileRoute> {
    return push(route);
  }

  function subscribe(handler: RouteChangeHandler): () => void {
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  function getSavedAreaRoute(destination: ShellDestination): MobileRoute {
    return areaState.get(destination) ? cloneRoute(areaState.get(destination) as MobileRoute) : createShellRoute(destination);
  }

  function saveAreaState(route: MobileRoute): void {
    areaState.set(getShellDestination(route), cloneRoute(route));
    saveSelectedCharacterRoute(route);
  }

  function saveSelectedCharacterRoute(route: MobileRoute): void {
    if (route.view !== RouteView.Character) return;

    selectedCharacterRoute = cloneRoute(route);
  }

  function resolveSelectedCharacterRoute(route: CharacterRoute | undefined): CharacterRoute | undefined {
    if (!route) return undefined;

    const resolvedRoute = resolvePermittedRoute(route, permissions);
    return resolvedRoute.view === RouteView.Character ? resolvedRoute : undefined;
  }

  function findLastMatchingHistoryIndex(route: MobileRoute): number {
    const serializedRoute = JSON.stringify(route);
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (JSON.stringify(history[index]) === serializedRoute) return index;
    }

    return -1;
  }

  async function notify(): Promise<void> {
    const snapshot = cloneRoute(currentRoute);
    await Promise.all([...listeners].map(listener => listener(snapshot)));
  }

  return {
    getCurrentRoute: () => cloneRoute(currentRoute),
    getHistory: () => history.map(cloneRoute),
    canGoBack: () => history.length > 0,
    push,
    replace,
    back,
    restore,
    updateCurrentRoute,
    getSelectedCharacterRoute: () => (selectedCharacterRoute ? cloneRoute(selectedCharacterRoute) : undefined),
    openShellDestination,
    openSearch,
    selectSearchRoute,
    subscribe
  };
}
