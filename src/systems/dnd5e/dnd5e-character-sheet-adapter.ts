import { RouteView } from "../../router/routes.ts";
import type { CharacterSheetAdapter } from "../character-sheet-adapter.ts";
import {
  buildActorSheetNavigationViewModel,
  buildCharacterSheetPaneViewModel,
  clearDnd5eTransientState,
  createCharacterPaneRoute,
  createOwnedDocumentRoute,
  DND5E_PANE_PARTIAL_PATHS,
  DND5E_PANE_SPECS,
  DND5E_PANE_TEMPLATE_PATHS,
  DND5E_STYLE_PATHS,
  DND5E_VISUAL_METADATA,
  getDnd5ePaneContext,
  getDnd5ePaneSearchDrawerPrefix,
  getPaneFromSwipe,
  isCharacterRoute,
  isInteractiveSwipeTarget,
  normalizeCharacterPane,
  rememberDnd5eShortRestRoll,
  runCharacterSheetPaneAction
} from "./actor-sheet-navigation.ts";
import {
  DND5E_DEFAULT_OWNED_ITEM_PARENT_PANE,
  DND5E_DEFAULT_PANE
} from "./character-panes.ts";
import {
  buildDnd5eFavoritesViewModel,
  DND5E_FAVORITES_GROUP_PARTIAL
} from "./favorites-view-model.ts";
import { DND5E_COMPENDIUM_SEARCH_CUSTOMIZATION } from "./search.ts";

/**
 * dnd5e character sheet adapter consumed by the system-agnostic shell.
 */
export const dnd5eCharacterSheetAdapter: CharacterSheetAdapter = {
  buildNavigationViewModel: buildActorSheetNavigationViewModel,
  getPaneSpecs: _options => DND5E_PANE_SPECS,
  buildPaneViewModel: options => buildCharacterSheetPaneViewModel(options),
  runPaneAction: options => runCharacterSheetPaneAction(options),
  onPaneActionResult: ({ actionContext, result }) => {
    if (actionContext.route.view !== RouteView.Character || !result.ok || actionContext.action !== "details-roll-hit-die") return;
    const roll = result.data?.shortRestRoll;
    if (roll === undefined) return;
    rememberDnd5eShortRestRoll(actionContext.actorUuid, roll);
  },
  clearTransientState: clearDnd5eTransientState,
  createPaneRoute: createCharacterPaneRoute,
  createOwnedDocumentRoute,
  getPaneTemplatePaths: () => DND5E_PANE_TEMPLATE_PATHS,
  getTemplatePaths: () => [...Object.values(DND5E_PANE_TEMPLATE_PATHS), ...DND5E_PANE_PARTIAL_PATHS],
  getStylePaths: () => [...DND5E_STYLE_PATHS],
  getPaneContext: pane => getDnd5ePaneContext(pane),
  getHeaderPaneContext: () => getDnd5ePaneContext("Details"),
  getPaneSearchDrawerPrefix: pane => getDnd5ePaneSearchDrawerPrefix(normalizeCharacterPane(pane)),
  getSearchAdapters: (_options) => [],
  getFavoritesCapability: () => ({
    context: "favorites",
    groupPartials: [DND5E_FAVORITES_GROUP_PARTIAL],
    buildViewModel: options => buildDnd5eFavoritesViewModel({ actor: options.actor, user: options.user })
  }),
  getCompendiumSearchCustomization: () => DND5E_COMPENDIUM_SEARCH_CUSTOMIZATION,
  getVisualMetadata: () => DND5E_VISUAL_METADATA,
  getDefaultPane: () => DND5E_DEFAULT_PANE,
  getDefaultOwnedItemParentPane: () => DND5E_DEFAULT_OWNED_ITEM_PARENT_PANE,
  getPaneFromSwipe,
  normalizePane: normalizeCharacterPane,
  isInteractiveSwipeTarget,
  isCharacterRoute
};
