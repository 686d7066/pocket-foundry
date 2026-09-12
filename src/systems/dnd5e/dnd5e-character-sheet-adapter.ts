import { RouteView } from "../../router/routes.ts";
import { localizeSystemKey } from "../../core/localization.ts";
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

/**
 * dnd5e character sheet adapter consumed by the system-agnostic shell.
 */
export const dnd5eCharacterSheetAdapter: CharacterSheetAdapter = {
  buildNavigationViewModel: buildActorSheetNavigationViewModel,
  getPaneSpecs: _options => DND5E_PANE_SPECS,
  buildPaneViewModel: options => buildCharacterSheetPaneViewModel(options),
  buildHeaderViewModel: options => buildDnd5eHeaderViewModel(options),
  handleShellAction: options => handleDnd5eShellAction(options),
  shouldCloseDialogsAfterAction: action => shouldCloseDnd5eDialogsAfterAction(action),
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
  getCompendiumSearchCustomization: () => DND5E_COMPENDIUM_SEARCH_CUSTOMIZATION,
  getVisualMetadata: () => DND5E_VISUAL_METADATA,
  getSystemTermLabel: (term, data = {}) => {
    switch (term) {
      case "armorClass":
        return localizeSystemKey("DND5E.ArmorClass", "AC");
      case "activation":
        return localizeSystemKey("DND5E.ItemActivation", "Activation");
      case "cantrip":
        return localizeSystemKey("DND5E.SpellCantrip", "Cantrip");
      case "charges":
        return localizeSystemKey("DND5E.Charges", "Charges");
      case "characterLevel":
        return localizeSystemKey("DND5E.LevelNumber", "Level {level}", data);
      case "hitPoints":
        return localizeSystemKey("DND5E.HitPoints", "HP");
      case "duration":
        return localizeSystemKey("DND5E.Duration", "Duration");
      case "enemy":
        return localizeSystemKey("DND5E.TARGET.Type.Enemy.Label", "Enemy");
      case "formula":
        return localizeSystemKey("DND5E.Formula", "Formula");
      case "initiative":
        return localizeSystemKey("DND5E.Initiative", "Initiative");
      case "initiativeAbbreviation":
        return localizeSystemKey("DND5E.InitiativeAbbr", "Init");
      case "characterClass":
        return localizeSystemKey("TYPES.Item.class", "Class");
      case "itemType":
        return localizeSystemKey("DND5E.Type", "Type");
      case "level":
        return localizeSystemKey("DND5E.Level", "Level");
      case "passive":
        return localizeSystemKey("DND5E.Passive", "Passive");
      case "price":
        return localizeSystemKey("DND5E.Price", "Price");
      case "quantity":
        return localizeSystemKey("DND5E.Quantity", "Quantity");
      case "range":
        return localizeSystemKey("DND5E.Range", "Range");
      case "recovery":
        return localizeSystemKey("DND5E.Recovery", "Recovery");
      case "roll":
        return localizeSystemKey("DND5E.Roll", "Roll");
      case "school":
        return localizeSystemKey("DND5E.School", "School");
      case "skill":
        return localizeSystemKey("DND5E.Skill", "Skill");
      case "source":
        return localizeSystemKey("DND5E.SOURCE.FIELDS.source.label", "Source");
      case "target":
        return localizeSystemKey("DND5E.Target", "Target");
      case "time":
        return localizeSystemKey("DND5E.DurationTime", "Time");
      case "tool":
        return localizeSystemKey("TYPES.Item.tool", "Tool");
      case "total":
        return localizeSystemKey("DND5E.PropertyTotal", "Total");
      case "uses":
        return localizeSystemKey("DND5E.Uses", "Uses");
      case "weight":
        return localizeSystemKey("DND5E.Weight", "Weight");
    }
  },
  getDefaultPane: () => DND5E_DEFAULT_PANE,
  getDefaultOwnedItemParentPane: () => DND5E_DEFAULT_OWNED_ITEM_PARENT_PANE,
  getPaneFromSwipe,
  normalizePane: normalizeCharacterPane,
  isInteractiveSwipeTarget,
  isCharacterRoute
};
