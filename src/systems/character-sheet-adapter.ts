import type { foundry } from "fvtt-types";
import type { LocalizationData } from "../core/localization.ts";
import type { FoundryDataShape } from "../core/foundry-globals.ts";
import type { ActorSheetPaneId, CharacterRoute, MobileRoute, OwnedDocumentRoute } from "../router/routes.ts";
import type { FoundryDocumentMutationApi, FoundryUserLike, PermissionCheckedDocument } from "../services/permissions.ts";
import type { CompendiumSearchCustomization, SearchAdapter } from "../services/search.ts";
import type { FavoritesModel } from "../services/favorites.ts";

/**
 * Minimal actor shape required to build character sheet navigation chrome.
 */
export type CharacterSheetNavigationActor = PermissionCheckedDocument
  & FoundryDocumentMutationApi
  & FoundryDataShape<foundry.documents.types.ActorData>
  & {
    img?: foundry.documents.types.ActorData["img"] | null;
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
  /** False when an acknowledged action completed without changing character data. */
  changed?: boolean;
  /** Whether a failed action was definitely rejected or may have reached Foundry. */
  failure?: "rejected" | "uncertain";
  /** Manual retry guidance. Uncertain writes must be reviewed before retrying. */
  retry?: "safe" | "review";
};

/** System-neutral description of an adapter action that changes character data. */
export type CharacterSheetMutationDescriptor = {
  label: string;
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
 * Small metadata chip supplied by a system adapter for a character-picker row.
 */
export type CharacterPickerPresentationChip = {
  id: string;
  label: string;
  value: string;
  tone?: string;
};

/**
 * System-owned presentation for one fully observable actor in the character picker.
 */
export type CharacterPickerPresentation = {
  typeLabel: string;
  summary: string;
  subtitle: string;
  headerStats: CharacterSheetHeaderStat[];
  chips: CharacterPickerPresentationChip[];
};

/**
 * Minimal resolved item shape exposed to a system-owned detail presenter.
 */
export type CharacterSheetItemDetailDocument = PermissionCheckedDocument
  & FoundryDocumentMutationApi
  & FoundryDataShape<foundry.documents.types.ItemData>
  & {
    img?: foundry.documents.types.ItemData["img"] | null;
    pack?: string | null;
    parent?: PermissionCheckedDocument | null;
    system?: unknown;
  };

/**
 * System-owned raw item presentation enriched and rendered by shared services.
 */
export type CharacterSheetItemDetailPresentation = {
  description: string;
  typeLabel: string;
  source: string | null;
  chips: Array<{ id: string; label: string; value: string }>;
  fields: Array<{ label: string; value: string }>;
};

/**
 * Optional adapter capability for systems that expose mobile item details.
 */
export type CharacterSheetItemDetailCapability = {
  buildPresentation(options: {
    document: CharacterSheetItemDetailDocument;
    source?: string;
  }): CharacterSheetItemDetailPresentation;
};

/**
 * Renderable content returned by a system adapter.
 */
export type CharacterSheetRenderableContent = {
  templatePath: string;
  data: unknown;
};

/**
 * Optional high-priority header chrome returned by a system adapter.
 */
export type CharacterSheetHeaderContent = CharacterSheetRenderableContent & {
  headerClass?: string;
  dialogsTemplatePath?: string;
};

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
  summary: string;
  activePane: ActorSheetPaneId;
  activePaneLabel: string;
  panes: CharacterSheetPaneItem[];
  headerStats: CharacterSheetHeaderStat[];
  /** True when the current user can only see Foundry's limited actor view. */
  limited?: boolean;
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
  templatePath: string;
  data: unknown;
};

/**
 * System-owned terminology that generic Pocket Foundry UI may need without
 * referencing concrete system localization keys.
 */
export type SystemTermId =
  | "enemy"
  | "initiative";

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

export type CharacterSheetActionHelpers = {
  /** Whether the shell still shows the character and pane that initiated this action. */
  isCurrentRoute(): boolean;
  openFormDialog?(title: string): HTMLElement;
  setDialogOpen(dialogId: string | undefined, open: boolean): void;
  setNumberWheelValue(wheel: HTMLElement, value: number): void;
  getCenteredNumberWheelOption(wheel: HTMLElement): HTMLElement | null;
  setSelectedNumberDelta(target: HTMLElement): void;
  runAction(action: string, options?: {
    data?: Readonly<Record<string, string>>;
    event?: Event;
    closeDialogs?: boolean;
    onSuccess?: (result: CharacterSheetActionResult) => Promise<void> | void;
  }): Promise<void>;
  /** Runs an adapter-owned write through the shell's actor-wide mutation guard. */
  runMutation(label: string, operation: () => Promise<CharacterSheetActionResult>): Promise<CharacterSheetActionResult>;
  /** Whether another character write still owns the actor-wide mutation lease. */
  isMutationPending(): boolean;
  clearTransientState(): void;
  closeFavoriteContextMenu(): void;
};

export type CharacterSheetShellActionContext = {
  element: HTMLElement;
  target: HTMLElement;
  event: Event;
  action: string;
  route: CharacterRoute;
  helpers: CharacterSheetActionHelpers;
};

/**
 * System-owned actor sheet behavior consumed by the generic mobile shell.
 */
export type CharacterSheetAdapter = {
  isCharacterPickerActor(actor: CharacterSheetNavigationActor): boolean;
  buildCharacterPickerPresentation(options: {
    actor: CharacterSheetNavigationActor;
    user: FoundryUserLike;
  }): CharacterPickerPresentation;
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
  buildHeaderViewModel?(options: {
    actor: CharacterSheetNavigationActor | null | undefined;
    user: FoundryUserLike;
    route: CharacterRoute | OwnedDocumentRoute | MobileRoute;
  }): CharacterSheetHeaderContent | Promise<CharacterSheetHeaderContent>;
  handleShellAction?(options: CharacterSheetShellActionContext): boolean | Promise<boolean>;
  shouldCloseDialogsAfterAction?(action: string): boolean;
  runPaneAction(options: CharacterSheetActionContext): Promise<CharacterSheetActionResult> | CharacterSheetActionResult;
  /** Identifies pane actions that perform character writes before they execute. */
  describePaneAction?(options: CharacterSheetActionContext): CharacterSheetMutationDescriptor | null;
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
  getPaneSearchDrawerPrefix(pane: ActorSheetPaneId): string | null;
  getSearchAdapters(options: { user: FoundryUserLike }): SearchAdapter[];
  getFavoritesCapability?(): CharacterSheetFavoritesCapability | null;
  getItemDetailCapability?(): CharacterSheetItemDetailCapability | null;
  /**
   * Optional system-owned compendium labels and type filters for generic
   * compendium search results.
   */
  getCompendiumSearchCustomization?(): CompendiumSearchCustomization;
  getVisualMetadata(): CharacterSheetVisualMetadata;
  /**
   * Resolves a system-owned combat term for generic UI using the active
   * system's localization keys when available.
   */
  getSystemTermLabel?(term: SystemTermId, data?: LocalizationData): string;
  getPaneFromSwipe(activePane: ActorSheetPaneId | undefined, gesture: PaneSwipeGesture): ActorSheetPaneId | null;
  normalizePane(pane: string | undefined): ActorSheetPaneId;
  getDefaultPane(): ActorSheetPaneId;
  getDefaultOwnedItemParentPane(): ActorSheetPaneId;
  isInteractiveSwipeTarget(target: EventTarget | null): boolean;
  isCharacterRoute(route: MobileRoute): route is CharacterRoute;
};
