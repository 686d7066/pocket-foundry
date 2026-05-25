/**
 * Stable top-level destinations shown by the mobile shell navigation.
 */
export enum ShellDestination {
  Characters = "characters",
  Combat = "combat",
  Journal = "journal",
  Recents = "recents",
  Search = "search",
  Settings = "settings"
}

/**
 * Concrete route categories used by the internal mobile router.
 *
 * Actor sheet panes are intentionally not represented here. Pane identifiers
 * are system-adapter data stored on character routes so each system can define
 * its own pane set without changing the router enum.
 */
export enum RouteView {
  Characters = "characters",
  Combat = "combat",
  Character = "character",
  OwnedDocument = "owned-document",
  Journal = "journal",
  Search = "search",
  Recents = "recents",
  Settings = "settings",
  DocumentDetail = "document-detail"
}

/**
 * Opaque actor sheet pane id owned by the active system adapter.
 *
 * The generic router stores and restores this id but must not interpret it.
 */
export type ActorSheetPaneId = string;

/**
 * Shared transient scroll state stored on concrete routes.
 */
export type RouteScrollState = {
  scrollTop?: number;
  expandedDetailKeys?: string[];
};

/**
 * Character picker route for the Characters shell destination.
 */
export type CharactersRoute = RouteScrollState & {
  view: RouteView.Characters;
  query?: string;
  expandedFolderIds?: string[];
  favoriteHelpOpen?: boolean;
  selectedActorUuid?: string;
};

/**
 * Global combat tracker route.
 */
export type CombatRoute = RouteScrollState & {
  view: RouteView.Combat;
};

/**
 * Concrete character sheet route with a system-specific pane id.
 */
export type CharacterRoute = RouteScrollState & {
  view: RouteView.Character;
  actorUuid: string;
  pane?: ActorSheetPaneId;
  drawer?: string;
};

/**
 * Actor-owned document detail route that returns to a parent character pane.
 */
export type OwnedDocumentRoute = RouteScrollState & {
  view: RouteView.OwnedDocument;
  actorUuid: string;
  documentUuid: string;
  parentPane: ActorSheetPaneId;
};

/**
 * Journal browser, entry, or page route.
 */
export type JournalRoute = RouteScrollState & {
  view: RouteView.Journal;
  entryUuid?: string;
  pageUuid?: string;
  query?: string;
};

/**
 * Global search route with query and transient focus state.
 */
export type SearchRoute = RouteScrollState & {
  view: RouteView.Search;
  query: string;
  typeFilter?: string;
  focusedResultId?: string;
};

/**
 * Recent mobile route list destination.
 */
export type RecentsRoute = RouteScrollState & {
  view: RouteView.Recents;
  focusedRouteId?: string;
};

/**
 * In-shell settings destination.
 */
export type SettingsRoute = RouteScrollState & {
  view: RouteView.Settings;
};

/**
 * Generic document detail route used for search and document-link navigation.
 */
export type DocumentDetailRoute = RouteScrollState & {
  view: RouteView.DocumentDetail;
  documentUuid: string;
  documentType: "character" | "item" | "journal-entry" | "journal-page" | "unknown";
  source?: string;
  parentRoute?: MobileRoute;
};

/**
 * All concrete route states understood by the mobile shell.
 */
export type MobileRoute =
  | CharactersRoute
  | CombatRoute
  | CharacterRoute
  | OwnedDocumentRoute
  | JournalRoute
  | SearchRoute
  | RecentsRoute
  | SettingsRoute
  | DocumentDetailRoute;

/**
 * Creates the default route for a top-level shell destination.
 */
export function createShellRoute(destination: ShellDestination): MobileRoute {
  switch (destination) {
    case ShellDestination.Characters:
      return { view: RouteView.Characters };
    case ShellDestination.Combat:
      return { view: RouteView.Combat };
    case ShellDestination.Journal:
      return { view: RouteView.Journal };
    case ShellDestination.Recents:
      return { view: RouteView.Recents };
    case ShellDestination.Search:
      return { view: RouteView.Search, query: "" };
    case ShellDestination.Settings:
      return { view: RouteView.Settings };
  }
}

/**
 * Creates a character sheet route for an adapter-provided pane id.
 */
export function createCharacterRoute(actorUuid: string, pane?: ActorSheetPaneId): CharacterRoute {
  return {
    view: RouteView.Character,
    actorUuid,
    ...(pane === undefined ? {} : { pane })
  };
}

/**
 * Maps any concrete route to the top-level shell destination that owns it.
 */
export function getShellDestination(route: MobileRoute): ShellDestination {
  switch (route.view) {
    case RouteView.Combat:
      return ShellDestination.Combat;
    case RouteView.Character:
    case RouteView.OwnedDocument:
      return ShellDestination.Characters;
    case RouteView.DocumentDetail:
      return getDocumentDetailDestination(route);
    case RouteView.Journal:
      return ShellDestination.Journal;
    case RouteView.Recents:
      return ShellDestination.Recents;
    case RouteView.Search:
      return ShellDestination.Search;
    case RouteView.Settings:
      return ShellDestination.Settings;
    case RouteView.Characters:
      return ShellDestination.Characters;
  }
}

/**
 * Deep-clones route objects so router callers cannot mutate stored state.
 */
export function cloneRoute<T extends MobileRoute>(route: T): T {
  return structuredClone(route) as T;
}

function getDocumentDetailDestination(route: DocumentDetailRoute): ShellDestination {
  if (route.parentRoute) return getShellDestination(route.parentRoute);
  if (route.documentType === "character") return ShellDestination.Characters;
  if (route.documentType === "journal-entry" || route.documentType === "journal-page") return ShellDestination.Journal;
  return ShellDestination.Search;
}
