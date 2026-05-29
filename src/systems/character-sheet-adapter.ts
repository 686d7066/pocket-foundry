import type { ActorSheetPaneId, CharacterRoute, MobileRoute, OwnedDocumentRoute } from "../router/routes.ts";
import type { FoundryUserLike, PermissionCheckedDocument } from "../services/permissions.ts";
import type { CompendiumSearchCustomization, SearchAdapter } from "../services/search.ts";
import type { FavoritesModel } from "../services/favorites.ts";

/**
 * Minimal actor shape required to build character sheet navigation chrome.
 */
export type CharacterSheetNavigationActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  name?: string;
  type?: string;
  img?: string | null;
  system?: Record<string, unknown>;
  items?: unknown;
};

/**
 * Metadata for one pane shown in the character sheet rail.
 */
export type CharacterSheetPaneSpec = {
  id: ActorSheetPaneId;
  label: string;
  compactLabel: string;
  displayLabel: string;
  railClass: string;
  icon?: string;
  /** Canonical route key used for this character sheet pane. */
  routeKey?: ActorSheetPaneId;
  /** Backwards-compatible aliases from historical pane labels. */
  legacyRouteKeys?: readonly string[];
  /** Template context key rendered by the shell for this pane. */
  context: string;
  /** Drawer search prefix used by pane-local search filters. */
  searchDrawerPrefix?: string | null;
};

/**
 * Generic action execution result for pane-specific controls.
 */
export type CharacterSheetActionResult = {
  ok: boolean;
  reason?: string;
  data?: Record<string, unknown>;
};

/**
 * Normalized pane rail item rendered by the actor sheet navigation template.
 */
export type CharacterSheetPaneItem = {
  id: ActorSheetPaneId;
  label: string;
  compactLabel: string;
  displayLabel: string;
  railClass: string;
  action: "navigate-character-pane";
  active: boolean;
};

/**
 * Compact, high-priority character stat displayed in the persistent actor header.
 */
export type CharacterSheetHeaderStat = {
  id: string;
  label: string;
  value: string;
  suffix?: string;
};

/**
 * System-defined character sheet template partials consumed by the shell.
 */
export type CharacterSheetTemplatePaths = {
  details: string;
  inventory: string;
  features: string;
  spells: string;
  effects: string;
  biography: string;
  favorites?: string;
};
export type CharacterSheetPaneTemplatePaths = CharacterSheetTemplatePaths;

/**
 * Optional adapter capability for systems that expose the generic Favorites pane.
 */
export type CharacterSheetFavoritesCapability = {
  context: "favorites";
  groupPartials: readonly string[];
  buildViewModel(options: {
    actor: CharacterSheetNavigationActor | null | undefined;
    user: FoundryUserLike;
    route: CharacterRoute | OwnedDocumentRoute | MobileRoute;
  }): FavoritesModel | Promise<FavoritesModel>;
};

/**
 * Extra adapter-owned templates that should be preloaded once the adapter is
 * selected for the active system.
 */
export type CharacterSheetPreloadTemplatePaths = readonly string[];
export type CharacterSheetStylePaths = readonly string[];

/**
 * Optional visual metadata for character-sheet-specific chrome.
 */
export type CharacterSheetVisualMetadata = {
  /**
   * System-owned sheet banner image path. Set to null when the system does not
   * provide a background image.
   */
  bannerImage: string | null;
  bannerLabel?: string;
  bannerHint?: string;
  bannerAriaLabel?: string;
};

/**
 * View model for the persistent actor header and major pane rail.
 */
export type CharacterSheetNavigationViewModel = {
  actorUuid: string;
  actorName: string;
  portraitInitials: string;
  portraitImage: string | null;
  classSummary: string;
  activePane: ActorSheetPaneId;
  activePaneLabel: string;
  panes: CharacterSheetPaneItem[];
  headerStats: CharacterSheetHeaderStat[];
  unavailable: false;
};

/**
 * Non-leaking actor sheet state used when the requested actor is unavailable.
 */
export type UnavailableCharacterSheetNavigationViewModel = {
  unavailable: true;
  title: string;
  body: string;
};

/**
 * Character sheet navigation model rendered by the shell.
 */
export type CharacterSheetNavigationModel = CharacterSheetNavigationViewModel | UnavailableCharacterSheetNavigationViewModel;

/**
 * Generic return type used by a system adapter for pane view-model creation.
 *
 * The shell can carry this as an opaque value until templates are adapted.
 */
export type CharacterSheetPaneViewModel = {
  pane: ActorSheetPaneId;
  context: string;
  data: unknown;
};

/**
 * Shared context used by adapter action handlers.
 *
 * Foundry/runtime boundaries may surface either null or undefined for missing
 * actor references, so adapter-facing contracts accept both.
 */
export type CharacterSheetActionContext = {
  actor: CharacterSheetNavigationActor | null | undefined;
  actorUuid: string;
  pane: ActorSheetPaneId;
  route: CharacterRoute | OwnedDocumentRoute | MobileRoute;
  user: FoundryUserLike;
  action: string;
  data?: Readonly<Record<string, string>>;
  event?: Event;
};

/**
 * Touch gesture coordinates used to decide whether a swipe changes major panes.
 */
export type PaneSwipeGesture = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

/**
 * System-owned actor sheet behavior consumed by the generic mobile shell.
 */
export type CharacterSheetAdapter = {
  buildNavigationViewModel(options: {
    actor: CharacterSheetNavigationActor | null | undefined;
    user: FoundryUserLike;
    activePane: ActorSheetPaneId | undefined;
  }): CharacterSheetNavigationModel;
  getPaneSpecs(options: {
    actor: CharacterSheetNavigationActor | null | undefined;
    user: FoundryUserLike;
  }): CharacterSheetPaneSpec[];
  buildPaneViewModel(options: {
    pane: ActorSheetPaneId;
    actor: CharacterSheetNavigationActor | null | undefined;
    user: FoundryUserLike;
    route: CharacterRoute | OwnedDocumentRoute | MobileRoute;
  }): CharacterSheetPaneViewModel | Promise<CharacterSheetPaneViewModel>;
  runPaneAction(options: CharacterSheetActionContext): Promise<CharacterSheetActionResult> | CharacterSheetActionResult;
  onPaneActionResult?(options: {
    actionContext: CharacterSheetActionContext;
    result: CharacterSheetActionResult;
  }): void;
  clearTransientState(route: CharacterRoute | OwnedDocumentRoute | MobileRoute): void;
  createPaneRoute(options: {
    actorUuid: string;
    pane: ActorSheetPaneId | undefined;
    scrollTop?: number;
  }): CharacterRoute;
  createOwnedDocumentRoute(options: {
    actorUuid: string;
    documentUuid: string;
    parentPane: ActorSheetPaneId | undefined;
    scrollTop?: number;
  }): OwnedDocumentRoute;
  getPaneTemplatePaths(): CharacterSheetTemplatePaths;
  /**
   * Full set of system-owned templates and partials that must be preloaded in
   * `module.ts` before rendering system-specific actor panes.
   */
  getTemplatePaths: () => CharacterSheetPreloadTemplatePaths;
  /**
   * Adapter-owned stylesheet paths that should be loaded for the active system.
   */
  getStylePaths: () => CharacterSheetStylePaths;
  getPaneContext(pane: ActorSheetPaneId): string;
  getHeaderPaneContext?(): string | null;
  getPaneSearchDrawerPrefix(pane: ActorSheetPaneId): string | null;
  getSearchAdapters(options: { user: FoundryUserLike }): SearchAdapter[];
  getFavoritesCapability?(): CharacterSheetFavoritesCapability | null;
  /**
   * Optional system-owned compendium labels and type filters for generic
   * compendium search results.
   */
  getCompendiumSearchCustomization?(): CompendiumSearchCustomization;
  getVisualMetadata(): CharacterSheetVisualMetadata;
  getPaneFromSwipe(activePane: ActorSheetPaneId | undefined, gesture: PaneSwipeGesture): ActorSheetPaneId | null;
  normalizePane(pane: string | undefined): ActorSheetPaneId;
  getDefaultPane(): ActorSheetPaneId;
  getDefaultOwnedItemParentPane(): ActorSheetPaneId;
  isInteractiveSwipeTarget(target: EventTarget | null): boolean;
  isCharacterRoute(route: MobileRoute): route is CharacterRoute;
};
