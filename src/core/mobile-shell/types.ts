import { ShellDestination, type MobileRoute } from "../../router/routes.ts";
import type { CharacterPickerViewModel } from "../../services/character-picker.ts";
import type { CombatViewModel } from "../../services/combat.ts";
import type { FavoritesModel } from "../../services/favorites.ts";
import type { ItemDetailViewModel } from "../../services/item-detail.ts";
import type { JournalEntrySummaryViewModel, JournalEntryViewModel, JournalPageSummaryViewModel, JournalPageViewModel, UnavailableJournalViewModel } from "../../services/journal.ts";
import type { RecentsViewModel } from "../../services/recents.ts";
import { ALL_SEARCH_RESULT_TYPES, type MobileSearchResult, type SearchAdapterError, type SearchResultType } from "../../services/search.ts";
import type { CharacterSheetNavigationModel, CharacterSheetTemplatePaths } from "../../systems/character-sheet-adapter.ts";


/**
 * Controller for mounting, unmounting, and toggling the Pocket Foundry mobile shell.
 */
export type MobileShellController = {
  isMounted: () => boolean;
  mount: () => Promise<void>;
  unmount: () => void;
  setMobileViewEnabled: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Bottom navigation entry rendered in the shell navigation bar.
 */
export type BottomNavItem = {
  label: string;
  action: string;
  route: ShellDestination;
  active: boolean;
  disabled?: boolean;
  icon?: string;
  warningIcon?: boolean;
  backgroundImage?: string;
  highlightBorder?: boolean;
};

/**
 * Top-level shell content currently rendered inside the mobile shell.
 */
export type ShellContentType = ShellDestination | "character" | "document-detail" | "owned-document";

/**
 * Settings payload rendered by the in-shell mobile settings destination.
 */
export type ShellSettingsViewModel = {
  mobileViewEnabled: boolean;
  characterSheetBannerEnabled: boolean;
  colorBlindMode: boolean;
  characterSheetBannerAvailable: boolean;
  characterSheetBannerLabel: string;
  characterSheetBannerHint: string;
  characterSheetBannerAriaLabel: string;
  colorBlindModeAriaLabel: string;
};

/**
 * Search result type filter rendered as one chip in the generated type rail.
 */
export type SearchTypeFilterViewModel = {
  label: string;
  value: string;
  active: boolean;
};

/**
 * Normalized result row for the search template.
 */
export type SearchResultViewModel = MobileSearchResult & {
  iconText: string;
  subtitle: string;
  actionLabel: string;
  focused: boolean;
};

/**
 * Transient search template state derived from the route and latest service run.
 */
export type SearchViewModel = {
  query: string;
  typeFilter: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES;
  typeFilters: SearchTypeFilterViewModel[];
  results: SearchResultViewModel[];
  errors: SearchAdapterError[];
  loading: boolean;
  hasUsableQuery: boolean;
};

/**
 * In-memory search UI state. It is intentionally not persisted to documents.
 */
export type SearchUiState = {
  query: string;
  typeFilter: SearchResultType | typeof ALL_SEARCH_RESULT_TYPES;
  loading: boolean;
  results: MobileSearchResult[];
  errors: SearchAdapterError[];
  completedKey: string;
  sequence: number;
  debounceTimer?: ReturnType<typeof globalThis.setTimeout>;
};

export type ConfirmationDialogOptions = {
  id: string;
  title: string;
  body: string;
  confirmLabel: string;
  confirmAction: string;
  cancelAction: string;
  danger?: boolean;
  data?: Record<string, string>;
};

export type JournalEntryRowViewModel = JournalEntrySummaryViewModel & {
  iconText: string;
  pageCountLabel: "page" | "pages";
};

export type JournalPageRowViewModel = JournalPageSummaryViewModel & {
  iconText: string;
  typeLabel: string;
};

export type JournalEntryTemplateModel = (JournalEntryViewModel & {
  hasPages: boolean;
  visiblePages: JournalPageRowViewModel[];
}) | UnavailableJournalViewModel;

export type JournalPageTemplateModel = (JournalPageViewModel & {
  textPage: boolean;
  imagePage: boolean;
  pdfPage: boolean;
  videoPage: boolean;
  unsupportedPage: boolean;
  unsupportedBody: string;
}) | UnavailableJournalViewModel;

export type JournalShellViewModel = {
  list?: {
    entries: JournalEntryRowViewModel[];
    hasEntries: boolean;
  };
  entry?: JournalEntryTemplateModel;
  page?: JournalPageTemplateModel;
};

export type RecentRouteListViewModel = RecentsViewModel;

/**
 * Root Handlebars view model for the mobile shell template.
 */
export type ShellViewModel = {
  activeDestination: ShellDestination;
  contentType: ShellContentType;
  canGoBack: boolean;
  characterSheetBannerImage: string | null;
  journalUpRoute?: MobileRoute;
  title: string;
  subtitle: string;
  portraitInitials: string;
  portraitImage?: string | null;
  colorBlindMode: boolean;
  bottomNav: {
    label: string;
    items: BottomNavItem[];
  };
  characterPicker?: CharacterPickerViewModel;
  actorSheet?: CharacterSheetNavigationModel & {
    canGoBack: boolean;
    showCharacterBanner: boolean;
    headerDetails?: Record<string, unknown>;
    paneTemplatePaths: CharacterSheetTemplatePaths;
    favorites?: FavoritesModel;
    [paneContext: string]: unknown;
  };
  journal?: JournalShellViewModel;
  combat?: CombatViewModel;
  recents?: RecentRouteListViewModel;
  search?: SearchViewModel;
  itemDetail?: ItemDetailViewModel;
  pendingDetail?: {
    title: string;
    body: string;
  };
  settings?: ShellSettingsViewModel;
};
