import { RouteView, type MobileRoute } from "../router/routes.ts";
import { getObject, getString } from "../core/utils.ts";

type FoundryHookCallback = (...args: unknown[]) => void;

export type ReactiveRefreshHooks = {
  on?: (hook: string, callback: FoundryHookCallback) => number | void;
  off?: (hook: string, callbackOrId: FoundryHookCallback | number) => void;
};

export type RefreshInvalidationKind =
  | "actor"
  | "item"
  | "active-effect"
  | "journal-entry"
  | "journal-page"
  | "combat"
  | "combatant"
  | "user-permission";

export type RefreshInvalidation = {
  hookName: string;
  kind: RefreshInvalidationKind;
  action: "create" | "update" | "delete";
  uuid?: string;
  parentUuid?: string;
  changed?: Record<string, unknown>;
  permissionRelated: boolean;
};

export type ReactiveRefreshController = {
  dispose: () => void;
};

export type ReactiveRefreshControllerOptions = {
  hooks?: ReactiveRefreshHooks | null;
  getRoute: () => MobileRoute;
  preserveTransientState?: () => void;
  onRefresh: (invalidation: RefreshInvalidation) => void | Promise<void>;
  onSearchInvalidated?: (invalidation: RefreshInvalidation) => void | Promise<void>;
};

export const REACTIVE_REFRESH_HOOKS = [
  "createActor",
  "updateActor",
  "deleteActor",
  "createItem",
  "updateItem",
  "deleteItem",
  "createActiveEffect",
  "updateActiveEffect",
  "deleteActiveEffect",
  "createJournalEntry",
  "updateJournalEntry",
  "deleteJournalEntry",
  "createJournalEntryPage",
  "updateJournalEntryPage",
  "deleteJournalEntryPage",
  "createCombat",
  "updateCombat",
  "deleteCombat",
  "createCombatant",
  "updateCombatant",
  "deleteCombatant",
  "combatTurnChange",
  "updateUser"
] as const;

/**
 * Registers Foundry document lifecycle hooks and coalesces matching route
 * refreshes into one microtask. Foundry v14 fires create/update/delete hooks
 * after the database operation on every connected client, so the shell can
 * safely rebuild view models from current documents here without polling.
 */
export function createReactiveRefreshController(options: ReactiveRefreshControllerOptions): ReactiveRefreshController {
  const hooks = options.hooks;
  if (!hooks?.on) return { dispose: () => undefined };

  const unsubscribers = REACTIVE_REFRESH_HOOKS.map(hookName => {
    const callback: FoundryHookCallback = (...args) => {
      const invalidation = createRefreshInvalidation(hookName, args);
      if (invalidation) queueRefresh(invalidation);
    };
    const id = hooks.on?.(hookName, callback);
    return () => hooks.off?.(hookName, typeof id === "number" ? id : callback);
  });

  let queuedInvalidation: RefreshInvalidation | undefined;
  let queuedSearchInvalidation = false;
  let refreshQueued = false;
  let disposed = false;

  function queueRefresh(invalidation: RefreshInvalidation): void {
    const route = options.getRoute();
    if (!shouldRefreshRoute(route, invalidation)) return;

    queuedSearchInvalidation = queuedSearchInvalidation || shouldInvalidateSearch(route, invalidation);
    queuedInvalidation = mergeInvalidations(queuedInvalidation, invalidation);
    if (refreshQueued) return;

    refreshQueued = true;
    queueMicrotask(() => {
      void flushRefresh();
    });
  }

  async function flushRefresh(): Promise<void> {
    if (disposed || !queuedInvalidation) return;

    const invalidation = queuedInvalidation;
    const searchInvalidated = queuedSearchInvalidation;
    queuedInvalidation = undefined;
    queuedSearchInvalidation = false;
    refreshQueued = false;
    options.preserveTransientState?.();

    if (searchInvalidated && options.onSearchInvalidated) {
      await options.onSearchInvalidated(invalidation);
      return;
    }

    await options.onRefresh(invalidation);
  }

  return {
    dispose: () => {
      disposed = true;
      queuedInvalidation = undefined;
      queuedSearchInvalidation = false;
      refreshQueued = false;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    }
  };
}

export function createRefreshInvalidation(hookName: string, args: unknown[]): RefreshInvalidation | null {
  if (hookName === "combatTurnChange") {
    return {
      hookName,
      kind: "combat",
      action: "update",
      uuid: getDocumentUuid(args[0]),
      changed: getChangedData(args),
      permissionRelated: false
    };
  }

  if (hookName === "updateUser") {
    return {
      hookName,
      kind: "user-permission",
      action: "update",
      uuid: getDocumentUuid(args[0]),
      changed: getChangedData(args),
      permissionRelated: true
    };
  }

  const action = getHookAction(hookName);
  if (!action) return null;

  const kind = getHookKind(hookName);
  if (!kind) return null;

  const document = args[0];
  const changed = action === "update" ? getChangedData(args) : undefined;

  return {
    hookName,
    kind,
    action,
    uuid: getDocumentUuid(document),
    parentUuid: getParentDocumentUuid(document),
    changed,
    permissionRelated: isPermissionRelated(kind, action, changed)
  };
}

export function shouldRefreshRoute(route: MobileRoute, invalidation: RefreshInvalidation): boolean {
  // Encounter state affects global shell navigation (Encounter button state and
  // warning marker), so refresh all routes when combat documents change.
  if (invalidation.kind === "combat" || invalidation.kind === "combatant") return true;
  if (route.view === RouteView.Settings) return false;
  if (route.view === RouteView.Search) return shouldInvalidateSearch(route, invalidation);
  if (route.view === RouteView.Recents) return true;
  if (invalidation.kind === "user-permission" || invalidation.permissionRelated) return true;

  switch (route.view) {
    case RouteView.Characters:
      return invalidation.kind === "actor";
    case RouteView.Combat:
      return true;
    case RouteView.Character:
      return isActorInvalidationForRoute(route.actorUuid, invalidation);
    case RouteView.OwnedDocument:
      return isActorInvalidationForRoute(route.actorUuid, invalidation) || invalidation.uuid === route.documentUuid;
    case RouteView.Journal:
      return isJournalInvalidationForRoute(route, invalidation);
    case RouteView.DocumentDetail:
      return invalidation.uuid === route.documentUuid || invalidation.parentUuid === route.documentUuid;
    default:
      return false;
  }
}

function shouldInvalidateSearch(route: MobileRoute, invalidation: RefreshInvalidation): boolean {
  return route.view === RouteView.Search && Boolean(invalidation.kind);
}

function mergeInvalidations(current: RefreshInvalidation | undefined, next: RefreshInvalidation): RefreshInvalidation {
  if (!current) return next;

  return {
    hookName: current.hookName === next.hookName ? current.hookName : "multiple",
    kind: current.kind === next.kind ? current.kind : next.kind,
    action: current.action === next.action ? current.action : "update",
    uuid: current.uuid ?? next.uuid,
    parentUuid: current.parentUuid ?? next.parentUuid,
    changed: current.changed ?? next.changed,
    permissionRelated: current.permissionRelated || next.permissionRelated
  };
}

/**
 * Parses the action prefix from Foundry lifecycle hook names, which use a
 * stable `verb + DocumentName` convention (for example `createActor`,
 * `updateCombatant`, or `deleteJournalEntryPage`).
 */
function getHookAction(hookName: string): RefreshInvalidation["action"] | null {
  if (hookName.startsWith("create")) return "create";
  if (hookName.startsWith("update")) return "update";
  if (hookName.startsWith("delete")) return "delete";
  return null;
}

/**
 * Foundry document lifecycle hooks follow a stable `verb + DocumentName` shape
 * (for example `updateCombatant` or `deleteJournalEntryPage`).
 *
 * Action is decoded separately via `getHookAction()` using the prefix, so this
 * helper reads only the trailing document token via `endsWith(...)`. That keeps
 * the mapping compact and avoids enumerating every full verb/type combination.
 */
function getHookKind(hookName: string): RefreshInvalidationKind | null {
  if (hookName.endsWith("Combatant")) return "combatant";
  if (hookName.endsWith("Combat")) return "combat";
  if (hookName.endsWith("Actor")) return "actor";
  if (hookName.endsWith("Item")) return "item";
  if (hookName.endsWith("ActiveEffect")) return "active-effect";
  if (hookName.endsWith("JournalEntry")) return "journal-entry";
  if (hookName.endsWith("JournalEntryPage")) return "journal-page";
  return null;
}

function getChangedData(args: unknown[]): Record<string, unknown> | undefined {
  const changed = getObject(args[1]);
  return changed ?? undefined;
}

function isPermissionRelated(kind: RefreshInvalidationKind, action: RefreshInvalidation["action"], changed: Record<string, unknown> | undefined): boolean {
  if (action !== "update") return kind === "user-permission";
  return Boolean(changed && ("ownership" in changed || "permission" in changed || "permissions" in changed));
}

function isActorInvalidationForRoute(actorUuid: string, invalidation: RefreshInvalidation): boolean {
  if (invalidation.kind === "actor") return invalidation.uuid === actorUuid;
  if (invalidation.kind === "item" || invalidation.kind === "active-effect") return invalidation.parentUuid === actorUuid;
  return false;
}

function isJournalInvalidationForRoute(route: Extract<MobileRoute, { view: RouteView.Journal }>, invalidation: RefreshInvalidation): boolean {
  if (invalidation.kind === "journal-entry") return !route.entryUuid || invalidation.uuid === route.entryUuid;
  if (invalidation.kind === "journal-page") return !route.entryUuid || invalidation.parentUuid === route.entryUuid || invalidation.uuid === route.pageUuid;
  return false;
}

function getDocumentUuid(document: unknown): string | undefined {
  const data = getObject(document);
  if (!data) return undefined;

  const uuid = getString(data.uuid);
  if (uuid) return uuid;

  const documentName = getString(data.documentName);
  const id = getString(data.id) || getString(data._id);
  return documentName && id ? `${documentName}.${id}` : undefined;
}

function getParentDocumentUuid(document: unknown): string | undefined {
  const parent = getObject(document)?.parent;
  return getDocumentUuid(parent);
}
