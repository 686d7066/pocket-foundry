import {
  getPocketFoundryRouteFromHash,
  isPocketFoundryHistoryState,
  writePocketFoundryHistoryEntry
} from "../../router/browser-history.ts";
import { type MobileRouter } from "../../router/mobile-router.ts";
import { RouteView, type MobileRoute } from "../../router/routes.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { normalizeCharacterRoutePanes, renderShell } from "./controller-helpers-shell.ts";
import { runHandledShellTask } from "./controller-helpers-ui.ts";
import type { SearchUiState } from "./types.ts";

const HISTORY_DEBUG_STORAGE_KEY = `${MODULE_ID}.historyDebug`;

export let browserHistoryActive = false;
let browserHistorySequence = 0;
let originalConfirm: ((message?: string) => boolean) | undefined;

/**
 * Bridges browser Back into the internal mobile router before Foundry can treat
 * the event as a request to leave the game.
 */
export function bindBrowserBack(router: MobileRouter, getRootElement: () => HTMLElement | undefined, searchState: SearchUiState): () => void {
  const onPopState = (event: PopStateEvent): void => {
    const element = getRootElement();
    if (!element) return;

    const hasPocketRouteState = isPocketFoundryHistoryState(event.state);
    const route = hasPocketRouteState ? event.state.route : getPocketFoundryRouteFromHash(globalThis.location?.hash ?? "");
    const normalizedRoute = route ? normalizeCharacterRoutePanes(route, getCharacterSheetAdapter()) : undefined;
    recordHistoryDebug("popstate", {
      state: event.state,
      hash: globalThis.location?.hash,
      href: globalThis.location?.href,
      route: normalizedRoute ?? route,
      current: router.getCurrentRoute(),
      stack: router.getHistory(),
      historyLength: globalThis.history?.length
    });

    event.stopImmediatePropagation();
    event.preventDefault();

    // If browser state is missing (hash-only fallback), prefer the internal
    // stack entry so transient route state (scroll, expanded drawers, focus)
    // survives Back navigation.
    if (!hasPocketRouteState && router.canGoBack()) {
      runHandledShellTask(element, router.back().then(() => {
        return renderShell(element, router, searchState);
      }), { kind: "navigation", action: "browser-back" });
      return;
    }

    // Browser state may lag behind transient in-memory route fields (scroll,
    // expanded drawers). If the target identity equals the previous stack
    // route, consume Back via the internal stack to preserve exact state.
    if (normalizedRoute && shouldConsumeAsInternalBack(router, normalizedRoute)) {
      runHandledShellTask(element, router.back().then(() => {
        return renderShell(element, router, searchState);
      }), { kind: "navigation", action: "browser-back" });
      return;
    }

    if (!normalizedRoute && router.canGoBack()) {
      runHandledShellTask(element, router.back().then(() => {
        return renderShell(element, router, searchState);
      }), { kind: "navigation", action: "browser-back" });
      return;
    }

    if (!normalizedRoute) return;

    runHandledShellTask(element, router.restore(normalizedRoute).then(() => renderShell(element, router, searchState)), { kind: "navigation", action: "browser-restore" });
  };

  globalThis.addEventListener(
    "popstate",
    onPopState,
    { capture: true }
  );

  return () => globalThis.removeEventListener("popstate", onPopState, { capture: true });
}

function shouldConsumeAsInternalBack(router: MobileRouter, route: MobileRoute): boolean {
  const history = router.getHistory();
  const previous = history.length > 0 ? history[history.length - 1] : undefined;
  if (!previous) return false;
  return getRouteIdentityKey(previous) === getRouteIdentityKey(route);
}

function getRouteIdentityKey(route: MobileRoute): string {
  switch (route.view) {
    case RouteView.Characters:
      return "characters";
    case RouteView.Combat:
      return "combat";
    case RouteView.Character:
      return `character:${route.actorUuid}:${route.pane ?? ""}`;
    case RouteView.OwnedDocument:
      return `owned:${route.actorUuid}:${route.documentUuid}:${route.parentPane}`;
    case RouteView.Journal:
      return `journal:${route.entryUuid ?? ""}:${route.pageUuid ?? ""}`;
    case RouteView.Search:
      return `search:${route.query}:${route.typeFilter ?? ""}`;
    case RouteView.Recents:
      return "recents";
    case RouteView.Settings:
      return "settings";
    case RouteView.DocumentDetail:
      return `document:${route.documentUuid}:${route.documentType}:${route.source ?? ""}`;
  }
}

/**
 * Starts mirroring internal routes into browser history after the shell mounts.
 */
export function activateBrowserHistory(router: MobileRouter): void {
  if (!globalThis.history?.replaceState) return;

  browserHistoryActive = true;
  installLeaveGameConfirmGuard(router);
  recordHistoryDebug("activate", {
    current: router.getCurrentRoute(),
    href: globalThis.location?.href,
    state: globalThis.history.state,
    historyLength: globalThis.history.length
  });
  // Replace the current URL with the router's hydrated route, then push a guard
  // entry so the first browser Back can be consumed inside the mobile shell.
  writeBrowserHistory(router.getCurrentRoute(), "replace");
  writeBrowserHistory(router.getCurrentRoute(), "push");
}

/**
 * Writes a concrete mobile route into the browser URL/hash when history is active.
 */
export function writeBrowserHistory(route: MobileRoute, mode: "push" | "replace"): void {
  if (!browserHistoryActive || !globalThis.history?.replaceState) return;

  browserHistorySequence += 1;
  writePocketFoundryHistoryEntry(globalThis.history, globalThis.location?.href ?? "http://localhost/", route, mode, browserHistorySequence);
  recordHistoryDebug("write", {
    mode,
    route,
    sequence: browserHistorySequence,
    href: globalThis.location?.href,
    state: globalThis.history.state,
    historyLength: globalThis.history.length
  });
}

/**
 * Installs a fallback guard for Foundry's leave-game confirmation.
 */
export function installLeaveGameConfirmGuard(router: MobileRouter): void {
  if (originalConfirm || !globalThis.confirm) return;

  originalConfirm = globalThis.confirm.bind(globalThis);
  globalThis.confirm = (message?: string): boolean => {
    if (isFoundryLeaveGamePrompt(message) && shouldSuppressFoundryLeavePrompt(router)) {
      recordHistoryDebug("confirm:suppressed", {
        message,
        hash: globalThis.location?.hash,
        href: globalThis.location?.href,
        current: router.getCurrentRoute(),
        stack: router.getHistory()
      });
      return false;
    }

    if (isFoundryLeaveGamePrompt(message)) recordHistoryDebug("confirm:passthrough", { message, hash: globalThis.location?.hash, href: globalThis.location?.href });
    return originalConfirm ? originalConfirm(message) : false;
  };
}

/**
 * Restores the original browser confirm implementation after unmount.
 */
export function uninstallLeaveGameConfirmGuard(): void {
  if (!originalConfirm) return;

  globalThis.confirm = originalConfirm;
  originalConfirm = undefined;
}

/**
 * Detects Foundry's browser Back leave-game confirmation text.
 */
export function isFoundryLeaveGamePrompt(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("exit the Foundry Virtual Tabletop game");
}

/**
 * Decides whether Foundry's leave-game prompt should be suppressed by mobile navigation.
 */
export function shouldSuppressFoundryLeavePrompt(router: MobileRouter): boolean {
  if (!globalThis.document?.querySelector?.(`[data-pocket-foundry-shell="active"]`)) return false;
  if (router.canGoBack()) return true;
  return Boolean(getPocketFoundryRouteFromHash(globalThis.location?.hash ?? ""));
}

/**
 * Records browser-history diagnostics when window.pocketFoundry.historyDebug is enabled.
 */
export function recordHistoryDebug(event: string, details: Record<string, unknown>): void {
  const pocketFoundry = globalThis.window?.pocketFoundry;
  const config = pocketFoundry?.historyDebug;
  const enabled = config === true || (typeof config === "object" && config.enabled !== false);
  if (!enabled) return;

  const entry = {
    event,
    at: new Date().toISOString(),
    ...details
  };

  if (typeof config === "object") {
    config.events ??= [];
    config.events.push(entry);
  }

  persistHistoryDebugEntry(entry);
  globalThis.console?.info?.("[pocket-foundry history]", entry);
}

/**
 * Persists route-history diagnostics into sessionStorage for browser test inspection.
 */
export function persistHistoryDebugEntry(entry: Record<string, unknown>): void {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;

    const previous = JSON.parse(storage.getItem(HISTORY_DEBUG_STORAGE_KEY) ?? "[]") as unknown;
    const events = Array.isArray(previous) ? previous : [];
    events.push(entry);
    storage.setItem(HISTORY_DEBUG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Debug persistence should never affect mobile navigation behavior.
  }
}
