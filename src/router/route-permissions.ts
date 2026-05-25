import { cloneRoute, RouteView, type MobileRoute } from "./routes.ts";

/**
 * Normalized permission result returned by route permission checks.
 */
export type RoutePermissionResult = {
  permitted: boolean;
};

/**
 * Optional permission callbacks used to resolve routes before rendering.
 */
export type RoutePermissionResolver = {
  canViewActor?: (actorUuid: string) => RoutePermissionResult | boolean;
  canViewDocument?: (documentUuid: string, expectedType?: "character" | "item" | "journal-entry" | "journal-page") => RoutePermissionResult | boolean;
  canViewJournalEntry?: (entryUuid: string) => RoutePermissionResult | boolean;
  canViewJournalPage?: (entryUuid: string, pageUuid: string) => RoutePermissionResult | boolean;
};

/**
 * Resolves a route to itself or the nearest safe parent route based on permissions.
 *
 * Fallbacks intentionally avoid carrying hidden document names or child metadata.
 */
export function resolvePermittedRoute(route: MobileRoute, permissions: RoutePermissionResolver = {}): MobileRoute {
  switch (route.view) {
    case RouteView.Character:
      return isAllowed(permissions.canViewActor?.(route.actorUuid)) ? cloneRoute(route) : { view: RouteView.Characters };

    case RouteView.OwnedDocument:
      if (!isAllowed(permissions.canViewActor?.(route.actorUuid))) return { view: RouteView.Characters };
      if (isAllowed(permissions.canViewDocument?.(route.documentUuid, "item"))) return cloneRoute(route);
      return {
        view: RouteView.Character,
        actorUuid: route.actorUuid,
        pane: route.parentPane,
        scrollTop: route.scrollTop,
        ...(route.expandedDetailKeys === undefined ? {} : { expandedDetailKeys: route.expandedDetailKeys })
      };

    case RouteView.Journal:
      return resolveJournalRoute(route, permissions);

    case RouteView.DocumentDetail:
      if (!route.parentRoute) return cloneRoute(route);
      const documentType = route.documentType === "unknown" ? undefined : route.documentType;
      if (isAllowed(permissions.canViewDocument?.(route.documentUuid, documentType))) return cloneRoute(route);
      if (route.parentRoute) return resolvePermittedRoute(route.parentRoute, permissions);
      return route.documentType === "character" ? { view: RouteView.Characters } : { view: RouteView.Journal };

    case RouteView.Characters:
    case RouteView.Combat:
    case RouteView.Recents:
    case RouteView.Search:
    case RouteView.Settings:
      return cloneRoute(route);
  }
}

function resolveJournalRoute(route: Extract<MobileRoute, { view: RouteView.Journal }>, permissions: RoutePermissionResolver): MobileRoute {
  if (!route.entryUuid) return cloneRoute(route);
  if (!isAllowed(permissions.canViewJournalEntry?.(route.entryUuid))) return { view: RouteView.Journal };
  if (!route.pageUuid) return cloneRoute(route);
  if (isAllowed(permissions.canViewJournalPage?.(route.entryUuid, route.pageUuid))) return cloneRoute(route);

  return {
    view: RouteView.Journal,
    entryUuid: route.entryUuid,
    ...(route.query === undefined ? {} : { query: route.query }),
    ...(route.scrollTop === undefined ? {} : { scrollTop: route.scrollTop }),
    ...(route.expandedDetailKeys === undefined ? {} : { expandedDetailKeys: route.expandedDetailKeys })
  };
}

function isAllowed(result: RoutePermissionResult | boolean | undefined): boolean {
  if (typeof result === "boolean") return result;
  return result?.permitted ?? true;
}
