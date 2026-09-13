import { RouteView } from "../../router/routes.ts";
import { localizeSystemKey } from "../../core/localization.ts";
import type { CharacterSheetAdapter } from "../character-sheet-adapter.ts";
import {
  buildActorSheetNavigationViewModel,
  buildCharacterSheetPaneViewModel,
  clearDnd5eTransientState,
  createCharacterPaneRoute,
  createOwnedDocumentRoute,
  describeDnd5ePaneAction,
  DND5E_PANE_PARTIAL_PATHS,
  DND5E_PANE_SPECS,
  DND5E_PANE_TEMPLATE_PATHS,
  DND5E_STYLE_PATHS,
  DND5E_VISUAL_METADATA,
  buildDnd5eHeaderViewModel,
  getDnd5ePaneContext,
  getDnd5ePaneSearchDrawerPrefix,
  getPaneFromSwipe,
  handleDnd5eShellAction,
  isCharacterRoute,
  isInteractiveSwipeTarget,
  normalizeCharacterPane,
  rememberDnd5eShortRestRoll,
  runCharacterSheetPaneAction,
  shouldCloseDnd5eDialogsAfterAction
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
import { buildDnd5eCharacterPickerPresentation, isDnd5eCharacterPickerActor } from "./character-picker-presentation.ts";
import { buildDnd5eItemDetailPresentation } from "./item-detail-presentation.ts";

/**
 * dnd5e character sheet adapter consumed by the system-agnostic shell.
 */
export const dnd5eCharacterSheetAdapter: CharacterSheetAdapter = {
  isCharacterPickerActor: isDnd5eCharacterPickerActor,
  buildCharacterPickerPresentation: ({ actor }) => buildDnd5eCharacterPickerPresentation(actor),
  buildNavigationViewModel: buildActorSheetNavigationViewModel,
  getPaneSpecs: _options => DND5E_PANE_SPECS,
  buildPaneViewModel: options => buildCharacterSheetPaneViewModel(options),
  buildHeaderViewModel: options => buildDnd5eHeaderViewModel(options),
  handleShellAction: options => handleDnd5eShellAction(options),
  shouldCloseDialogsAfterAction: action => shouldCloseDnd5eDialogsAfterAction(action),
  runPaneAction: options => runCharacterSheetPaneAction(options),
  describePaneAction: options => describeDnd5ePaneAction(options),
  onPaneActionResult: ({ actionContext, result }) => {
    if (actionContext.route.view !== RouteView.Character || !result.ok || actionContext.action !== "details-roll-hit-die") return;
    const roll = result.data?.shortRestRoll;
    if (roll === undefined) return;
    rememberDnd5eShortRestRoll(actionContext.actorUuid, roll);
  },
  clearTransientState: clearDnd5eTransientState,
  createPaneRoute: createCharacterPaneRoute,
  createOwnedDocumentRoute,
  getTemplatePaths: () => [...Object.values(DND5E_PANE_TEMPLATE_PATHS), ...DND5E_PANE_PARTIAL_PATHS],
  getStylePaths: () => [...DND5E_STYLE_PATHS],
  getPaneContext: pane => getDnd5ePaneContext(pane),
  getPaneSearchDrawerPrefix: pane => getDnd5ePaneSearchDrawerPrefix(normalizeCharacterPane(pane)),
  getSearchAdapters: (_options) => [],
  getFavoritesCapability: () => ({
    context: "favorites",
    groupPartials: [DND5E_FAVORITES_GROUP_PARTIAL],
    buildViewModel: options => buildDnd5eFavoritesViewModel({ actor: options.actor, user: options.user })
  }),
  getItemDetailCapability: () => ({
    buildPresentation: buildDnd5eItemDetailPresentation
  }),
  getCompendiumSearchCustomization: () => DND5E_COMPENDIUM_SEARCH_CUSTOMIZATION,
  getVisualMetadata: () => DND5E_VISUAL_METADATA,
  getSystemTermLabel: term => {
    switch (term) {
      case "enemy":
        return localizeSystemKey("DND5E.TARGET.Type.Enemy.Label", "Enemy");
      case "initiative":
        return localizeSystemKey("DND5E.Initiative", "Initiative");
    }
  },
  getDefaultPane: () => DND5E_DEFAULT_PANE,
  getDefaultOwnedItemParentPane: () => DND5E_DEFAULT_OWNED_ITEM_PARENT_PANE,
  getPaneFromSwipe,
  normalizePane: normalizeCharacterPane,
  isInteractiveSwipeTarget,
  isCharacterRoute
};
