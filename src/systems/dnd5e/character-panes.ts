import type { CharacterSheetPaneSpec } from "../character-sheet-adapter.ts";

type Dnd5eCharacterPaneConfig = CharacterSheetPaneSpec & {
  /** Canonical pane used when opening actor-owned items from search and links. */
  defaultOwnedItemParentPane?: boolean;
  isDefault?: boolean;
};

/**
 * DnD5e-specific character sheet panes and their shell metadata.
 *
 * The shell reads this as the single source of truth for pane ordering,
 * navigation labels, route keys, and pane contexts.
 */
export const DND5E_CHARACTER_PANE_CONFIG: readonly Dnd5eCharacterPaneConfig[] = [
  {
    id: "Favorites",
    routeKey: "Favorites",
    label: "Favorites",
    compactLabel: "Starred",
    displayLabel: "★",
    context: "favorites",
    railClass: "icon-only",
    legacyRouteKeys: ["Favorites"],
    searchDrawerPrefix: null
  },
  {
    id: "Details",
    routeKey: "Details",
    label: "Details",
    compactLabel: "Details",
    displayLabel: "Details",
    context: "details",
    railClass: "",
    legacyRouteKeys: ["Details"],
    isDefault: true,
    defaultOwnedItemParentPane: false,
    searchDrawerPrefix: null
  },
  {
    id: "Inventory",
    routeKey: "Inventory",
    label: "Inventory",
    compactLabel: "Inventory",
    displayLabel: "Inventory",
    context: "inventory",
    railClass: "",
    legacyRouteKeys: ["Inventory"],
    defaultOwnedItemParentPane: true,
    searchDrawerPrefix: "inventory:search:"
  },
  {
    id: "Features",
    routeKey: "Features",
    label: "Features",
    compactLabel: "Features",
    displayLabel: "Features",
    context: "features",
    railClass: "",
    legacyRouteKeys: ["Features"],
    searchDrawerPrefix: "features:search:"
  },
  {
    id: "Spells",
    routeKey: "Spells",
    label: "Spells",
    compactLabel: "Spells",
    displayLabel: "Spells",
    context: "spells",
    railClass: "",
    legacyRouteKeys: ["Spells"],
    searchDrawerPrefix: "spells:search:"
  },
  {
    id: "Effects",
    routeKey: "Effects",
    label: "Effects",
    compactLabel: "Effects",
    displayLabel: "Effects",
    context: "effects",
    railClass: "",
    legacyRouteKeys: ["Effects"],
    searchDrawerPrefix: "effects:search:"
  },
  {
    id: "Biography",
    routeKey: "Biography",
    label: "Biography",
    compactLabel: "Bio",
    displayLabel: "Bio",
    context: "biography",
    railClass: "",
    legacyRouteKeys: ["Biography", "Bio"],
    searchDrawerPrefix: null
  }
] as const;

/**
 * Canonical dnd5e pane identifiers supported by the mobile shell.
 */
export type Dnd5eCharacterPane = (typeof DND5E_CHARACTER_PANE_CONFIG)[number]["id"];

/**
 * Ordered list of canonical pane identifiers used for swipe and fallback behavior.
 */
export const DND5E_CHARACTER_PANES = DND5E_CHARACTER_PANE_CONFIG.map(pane => pane.id) as Dnd5eCharacterPane[];

/**
 * Canonical pane to fall back to for newly created character routes.
 */
export const DND5E_DEFAULT_PANE = DND5E_CHARACTER_PANE_CONFIG.find(pane => pane.isDefault)?.id ?? "Details";

/**
 * Canonical parent pane used when owned item routes are created without an explicit
 * owning pane context.
 */
export const DND5E_DEFAULT_OWNED_ITEM_PARENT_PANE = DND5E_CHARACTER_PANE_CONFIG.find(pane => pane.defaultOwnedItemParentPane)?.id ?? "Inventory";
