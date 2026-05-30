import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../../core/utils.ts";
import {
    createCharacterRoute,
    RouteView,
    type ActorSheetPaneId,
    type CharacterRoute,
    type MobileRoute,
    type OwnedDocumentRoute
} from "../../router/routes.ts";
import { canViewDocument, type FoundryUserLike } from "../../services/permissions.ts";
import type {
    CharacterSheetActionContext,
    CharacterSheetActionResult,
    CharacterSheetHeaderStat, CharacterSheetNavigationActor, CharacterSheetNavigationViewModel, CharacterSheetPaneItem, CharacterSheetPaneSpec,
    CharacterSheetPaneTemplatePaths, CharacterSheetPaneViewModel, CharacterSheetVisualMetadata, PaneSwipeGesture, UnavailableCharacterSheetNavigationViewModel
} from "../character-sheet-adapter.ts";
import {
    buildDnd5eBiographyViewModel,
    type Dnd5eBiographyModel
} from "./biography-view-model.ts";
import {
    DND5E_CHARACTER_PANE_CONFIG,
    DND5E_CHARACTER_PANES,
    DND5E_DEFAULT_PANE,
    type Dnd5eCharacterPane
} from "./character-panes.ts";
import {
    applyDetailsDeathSavePip,
    applyDetailsExhaustionPip,
    applyDetailsHitDieRoll,
    applyDetailsHpDelta,
    applyDetailsRest,
    applyDetailsTempHpDelta,
    buildDnd5eDetailsViewModel,
    toggleDetailsInspiration,
    type Dnd5eDetailsModel,
    type Dnd5eDetailsRestConfig
} from "./details-view-model.ts";
import {
    buildDnd5eEffectsViewModel,
    deleteTemporaryEffect,
    endEffectConcentration,
    setEffectFavorite,
    toggleCondition,
    toggleEffectDisabled,
    type Dnd5eEffectsModel
} from "./effects-view-model.ts";
import {
    adjustFavoriteValue,
    buildDnd5eFavoritesViewModel,
    DND5E_FAVORITES_GROUP_PARTIAL,
    removeFavorite,
    setContextFavorite,
    useFavorite,
    type Dnd5eFavoritesModel
} from "./favorites-view-model.ts";
import {
    adjustFeatureRemainingUses,
    buildDnd5eFeaturesViewModel,
    endFeatureConcentration,
    rechargeFeature,
    setFeatureFavorite,
    useFeatureActivity,
    useFeatureItem,
    type Dnd5eFeaturesModel
} from "./features-view-model.ts";
import {
    adjustInventoryQuantity,
    adjustInventoryRemainingUses,
    buildDnd5eInventoryViewModel,
    rechargeInventoryItem,
    removeInventoryItemFromContainer,
    setInventoryCurrency,
    setInventoryFavorite,
    toggleInventoryAttuned,
    toggleInventoryEquipped,
    toggleInventoryPrepared,
    type Dnd5eInventoryModel
} from "./inventory-view-model.ts";
import {
    adjustSpellRemainingUses,
    buildDnd5eSpellsViewModel,
    rechargeSpell,
    setSpellcastingAbility,
    setSpellFavorite,
    toggleSpellPrepared,
    toggleSpellSlotPip,
    useSpellActivity,
    useSpellItem,
    type Dnd5eSpellsModel
} from "./spells-view-model.ts";

export type { Dnd5eCharacterPane };

export type ActorSheetNavigationActor = CharacterSheetNavigationActor;
export type ActorSheetPaneItem = CharacterSheetPaneItem & { id: Dnd5eCharacterPane; label: Dnd5eCharacterPane };
export type ActorSheetHeaderStat = CharacterSheetHeaderStat;
export type ActorSheetNavigationViewModel = CharacterSheetNavigationViewModel & {
  activePane: Dnd5eCharacterPane;
  activePaneLabel: Dnd5eCharacterPane;
  panes: ActorSheetPaneItem[];
};
export type UnavailableActorSheetNavigationViewModel = UnavailableCharacterSheetNavigationViewModel;
export type ActorSheetNavigationModel = ActorSheetNavigationViewModel | UnavailableActorSheetNavigationViewModel;

const MIN_SWIPE_DISTANCE = 54;
const MAX_VERTICAL_DOMINANCE_RATIO = 0.72;
const DND5E_SHEET_BANNER_IMAGE = "/systems/dnd5e/ui/official/banner-character-dark.webp";
const DND5E_SHORT_REST_ROLLS_BY_ACTOR = new Map<string, unknown>();

export const DND5E_PANE_TEMPLATE_PATHS: CharacterSheetPaneTemplatePaths = {
  details: "modules/pocket-foundry/systems/dnd5e/templates/details.hbs",
  inventory: "modules/pocket-foundry/systems/dnd5e/templates/inventory.hbs",
  features: "modules/pocket-foundry/systems/dnd5e/templates/features.hbs",
  spells: "modules/pocket-foundry/systems/dnd5e/templates/spells.hbs",
  effects: "modules/pocket-foundry/systems/dnd5e/templates/effects.hbs",
  biography: "modules/pocket-foundry/systems/dnd5e/templates/biography.hbs"
};
export const DND5E_PANE_PARTIAL_PATHS = [
  "modules/pocket-foundry/systems/dnd5e/templates/partials/details-skill-row.hbs",
  "modules/pocket-foundry/systems/dnd5e/templates/partials/details-tool-row.hbs",
  "modules/pocket-foundry/systems/dnd5e/templates/partials/effect-row.hbs",
  "modules/pocket-foundry/systems/dnd5e/templates/partials/feature-row.hbs",
  DND5E_FAVORITES_GROUP_PARTIAL,
  "modules/pocket-foundry/systems/dnd5e/templates/partials/inventory-list-row.hbs",
  "modules/pocket-foundry/systems/dnd5e/templates/partials/spell-row.hbs"
] as const;
export const DND5E_STYLE_PATHS = ["modules/pocket-foundry/systems/dnd5e/styles/pocket-foundry-dnd5e.css"] as const;

export const DND5E_VISUAL_METADATA: CharacterSheetVisualMetadata = {
  bannerImage: DND5E_SHEET_BANNER_IMAGE,
  bannerLabel: "Character Sheet Banner",
  bannerHint: "Show the character sheet banner texture at the top of mobile character sheets.",
  bannerAriaLabel: "Character Sheet Banner"
};

export const DND5E_PANE_SPECS: CharacterSheetPaneSpec[] = DND5E_CHARACTER_PANE_CONFIG.map(pane => ({
  ...pane,
  routeKey: pane.routeKey ?? pane.id,
  legacyRouteKeys: pane.legacyRouteKeys ?? [pane.id],
  context: pane.context,
  searchDrawerPrefix: pane.searchDrawerPrefix ?? null,
  railClass: pane.railClass
}));
const DND5E_PANE_BY_ROUTE_KEY: Record<string, Dnd5eCharacterPane> = DND5E_PANE_SPECS.reduce((acc, spec) => {
  for (const key of spec.legacyRouteKeys ?? [spec.id]) {
    acc[key] = spec.id as Dnd5eCharacterPane;
  }

  return acc;
}, {} as Record<string, Dnd5eCharacterPane>);

function getDnd5ePaneSpec(pane: ActorSheetPaneId | string | undefined): CharacterSheetPaneSpec {
  const canonical = pane ? DND5E_PANE_BY_ROUTE_KEY[pane] : undefined;
  const defaultPane = DND5E_PANE_BY_ROUTE_KEY[DND5E_DEFAULT_PANE] ?? "Details";
  const key = canonical ?? defaultPane;
  return DND5E_PANE_SPECS.find(config => config.id === key) as CharacterSheetPaneSpec;
}

/**
 * Builds the actor sheet navigation chrome for an observable dnd5e character.
 *
 * Hidden, missing, or non-character actors return an unavailable model so the
 * template can render without leaking names or other actor data.
 */
export function buildActorSheetNavigationViewModel(options: {
  actor: ActorSheetNavigationActor | null | undefined;
  user: FoundryUserLike;
  activePane: ActorSheetPaneId | undefined;
}): ActorSheetNavigationModel {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Character Unavailable",
      body: "This character is not available to the current user."
    };
  }

  const actorName = actor.name?.trim() || "Unnamed Character";
  const activePane = normalizeCharacterPane(options.activePane);

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    actorName,
    portraitInitials: getInitials(actorName),
    portraitImage: actor.img || null,
    classSummary: getCharacterSummary(actor) || "Character",
    activePane,
    activePaneLabel: activePane,
    panes: DND5E_CHARACTER_PANE_CONFIG.map(pane => ({
      id: pane.id,
      label: pane.label,
      compactLabel: pane.compactLabel,
      displayLabel: pane.displayLabel,
      railClass: pane.railClass,
      action: "navigate-character-pane",
      active: pane.id === activePane
    })),
    headerStats: getHeaderStats(actor)
  };
}

/**
 * Creates a dnd5e character pane route using canonical pane names.
 */
export function createCharacterPaneRoute(options: {
  actorUuid: string;
  pane: ActorSheetPaneId | undefined;
  scrollTop?: number;
}): CharacterRoute {
  const route = createCharacterRoute(options.actorUuid, normalizeCharacterPane(options.pane));
  return options.scrollTop === undefined ? route : { ...route, scrollTop: options.scrollTop };
}

/**
 * Creates a route for actor-owned document details while preserving the parent pane.
 */
export function createOwnedDocumentRoute(options: {
  actorUuid: string;
  documentUuid: string;
  parentPane: ActorSheetPaneId | undefined;
  scrollTop?: number;
}): OwnedDocumentRoute {
  return {
    view: RouteView.OwnedDocument,
    actorUuid: options.actorUuid,
    documentUuid: options.documentUuid,
    parentPane: normalizeCharacterPane(options.parentPane),
    ...(options.scrollTop === undefined ? {} : { scrollTop: options.scrollTop })
  };
}

/**
 * Converts compact or unknown pane input into a supported dnd5e pane id.
 */
export function normalizeCharacterPane(pane: ActorSheetPaneId | string | undefined): Dnd5eCharacterPane {
  return getDnd5ePaneSpec(pane).id as Dnd5eCharacterPane;
}

/**
 * Returns the next or previous pane in configured dnd5e pane order.
 */
export function getAdjacentCharacterPane(activePane: ActorSheetPaneId | undefined, direction: "next" | "previous"): Dnd5eCharacterPane {
  const normalized = normalizeCharacterPane(activePane);
  const currentIndex = DND5E_CHARACTER_PANES.indexOf(normalized);
  const nextIndex = direction === "next" ? Math.min(currentIndex + 1, DND5E_CHARACTER_PANES.length - 1) : Math.max(currentIndex - 1, 0);
  return DND5E_CHARACTER_PANES[nextIndex] ?? "Details";
}

/**
 * Maps a qualifying horizontal touch gesture to the target pane.
 *
 * Vertical-dominant gestures return null so normal page scrolling wins over
 * swipe navigation.
 */
export function getPaneFromSwipe(activePane: ActorSheetPaneId | undefined, gesture: PaneSwipeGesture): Dnd5eCharacterPane | null {
  const deltaX = gesture.endX - gesture.startX;
  const deltaY = gesture.endY - gesture.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < MIN_SWIPE_DISTANCE) return null;
  if (absY > absX * MAX_VERTICAL_DOMINANCE_RATIO) return null;

  const direction = deltaX < 0 ? "next" : "previous";
  const targetPane = getAdjacentCharacterPane(activePane, direction);
  return targetPane === normalizeCharacterPane(activePane) ? null : targetPane;
}

/**
 * Detects controls that should consume touch gestures instead of starting pane swipes.
 */
export function isInteractiveSwipeTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      [
        "button",
        "a",
        "input",
        "select",
        "textarea",
        "summary",
        "[role='button']",
        "[role='link']",
        "[role='menu']",
        "[role='slider']",
        "[data-swipe-ignore]",
        "[data-action]",
        ".drawer-handle"
      ].join(",")
    )
  );
}

/**
 * Narrows a mobile route to the character pane route shape.
 */
export function isCharacterRoute(route: MobileRoute): route is CharacterRoute {
  return route.view === RouteView.Character;
}

/**
 * Stores the latest short rest hit-die roll for the next dnd5e details render.
 */
export function rememberDnd5eShortRestRoll(actorUuid: string, roll: unknown): void {
  DND5E_SHORT_REST_ROLLS_BY_ACTOR.set(actorUuid, roll);
}

/**
 * Clears transient dnd5e render state for routes that own such state.
 */
export function clearDnd5eTransientState(route: MobileRoute): void {
  if (route.view === RouteView.Character) DND5E_SHORT_REST_ROLLS_BY_ACTOR.delete(route.actorUuid);
}

/**
 * Builds the user-facing class/species summary shown in the persistent header.
 */
function getCharacterSummary(actor: ActorSheetNavigationActor): string {
  const details = getObject(actor.system?.details);
  const species = getString(details?.species) || getString(details?.race);
  const classSummary = getClassSummary(actor);
  const level = getNumber(details?.level);

  const parts = [species, classSummary || (level !== null ? `Level ${level}` : "")].filter(Boolean);
  return parts.join(" ");
}

/**
 * Reads dnd5e class item levels for the compact class summary.
 */
function getClassSummary(actor: ActorSheetNavigationActor): string {
  const classItems = getActorItems(actor).filter(item => item.type === "class");
  if (classItems.length === 0) return "";

  return classItems
    .map(item => {
      const levels = getNumber(getObject(item.system)?.levels);
      return `${item.name?.trim() || "Class"}${levels === null ? "" : ` ${levels}`}`;
    })
    .join(" / ");
}

/**
 * Builds the small header stat strip from prepared actor attributes.
 */
function getHeaderStats(actor: ActorSheetNavigationActor): ActorSheetHeaderStat[] {
  const attributes = getObject(actor.system?.attributes);
  const hp = getObject(attributes?.hp);
  const ac = getObject(attributes?.ac);
  const tempHp = getNumber(hp?.temp) ?? 0;
  const stats: ActorSheetHeaderStat[] = [];

  const acValue = getNumber(ac?.value);
  if (acValue !== null) stats.push({ id: "ac", label: "AC", value: String(acValue) });

  const hpValue = getNumber(hp?.value);
  const hpMax = getNumber(hp?.max);
  if (hpValue !== null || hpMax !== null) {
    stats.push({ id: "hp", label: "HP", value: String(hpValue ?? "-"), suffix: hpMax === null ? undefined : `/${hpMax}` });
  }

  stats.push({ id: "temp", label: "Temp", value: String(tempHp) });

  return stats;
}

function getActorItems(actor: ActorSheetNavigationActor): Array<{ name?: string; type?: string; system?: Record<string, unknown> }> {
  return getCollectionContents(actor.items) as Array<{ name?: string; type?: string; system?: Record<string, unknown> }>;
}

export function runCharacterSheetPaneAction(options: CharacterSheetActionContext): CharacterSheetActionResult | Promise<CharacterSheetActionResult> {
  const actor = options.actor;
  const user = options.user;
  const data = options.data ?? {};

  switch (options.action) {
    case "details-toggle-inspiration":
      return toggleDetailsInspiration(actor, user);
    case "details-confirm-hp-delta":
      return applyDetailsHpDelta(actor, user, toNumber(data.delta));
    case "details-confirm-temp-hp-delta":
      return applyDetailsTempHpDelta(actor, user, toNumber(data.delta));
    case "details-death-save-pip":
      return applyDetailsDeathSavePip(
        actor,
        user,
        (data.blipKind ?? data.deathKind) === "failure" ? "failure" : "success",
        data.pipActive === "true",
        toNumber(data.pipValue),
        data.fillMode === "target" ? "target" : "step"
      );
    case "details-exhaustion-pip":
      return applyDetailsExhaustionPip(actor, user, toNumber(data.pipValue), data.pipActive === "true");
    case "details-confirm-rest":
      return applyDetailsRest(actor, user, buildDetailsRestConfig(data));
    case "details-roll-hit-die":
      return applyDetailsHitDieRoll(actor, user, data.denomination ?? "").then(result => {
        if (!result.roll) return result;
        return {
          ...result,
          data: {
            shortRestRoll: result.roll
          }
        };
      });
    case "inventory-confirm-quantity-delta":
      return adjustInventoryQuantity(actor, user, data.itemId ?? "", toNumber(data.delta));
    case "inventory-confirm-charges-delta":
      return adjustInventoryRemainingUses(actor, user, data.itemId ?? "", toNumber(data.delta));
    case "inventory-confirm-currency":
      return setInventoryCurrency(actor, user, {
        pp: toNumber(data.pp),
        gp: toNumber(data.gp),
        ep: toNumber(data.ep),
        sp: toNumber(data.sp),
        cp: toNumber(data.cp)
      });
    case "inventory-toggle-equipped":
      return toggleInventoryEquipped(actor, user, data.itemId ?? "");
    case "inventory-toggle-attuned":
      return toggleInventoryAttuned(actor, user, data.itemId ?? "");
    case "inventory-toggle-prepared":
      return toggleInventoryPrepared(actor, user, data.itemId ?? "");
    case "inventory-remove-container":
      return removeInventoryItemFromContainer(actor, user, data.itemId ?? "");
    case "inventory-recharge":
      return rechargeInventoryItem(actor, user, data.itemId ?? "");
    case "inventory-add-favorite":
      return setInventoryFavorite(actor, user, data.itemId ?? "", true);
    case "inventory-remove-favorite":
      return setInventoryFavorite(actor, user, data.itemId ?? "", false);
    case "features-confirm-uses-delta":
      return adjustFeatureRemainingUses(actor, user, data.itemId ?? "", toNumber(data.delta));
    case "features-use-item":
      return useFeatureItem(actor, user, data.itemId ?? "");
    case "features-use-activity":
      return useFeatureActivity(actor, user, data.itemId ?? "", data.activityId ?? "");
    case "features-recharge":
      return rechargeFeature(actor, user, data.itemId ?? "");
    case "features-add-favorite":
      return setFeatureFavorite(actor, user, data.itemId ?? "", true);
    case "features-remove-favorite":
      return setFeatureFavorite(actor, user, data.itemId ?? "", false);
    case "features-end-concentration":
      return endFeatureConcentration(actor, user, data.itemId ?? "");
    case "spells-toggle-slot-pip":
      return toggleSpellSlotPip(actor, user, data.slot ?? "", toNumber(data.pip));
    case "spells-set-primary":
      return setSpellcastingAbility(actor, user, data.ability ?? "");
    case "spells-confirm-uses-delta":
      return adjustSpellRemainingUses(actor, user, data.itemId ?? "", toNumber(data.delta));
    case "spells-use-item":
      return useSpellItem(actor, user, data.itemId ?? "");
    case "spells-use-activity":
      return useSpellActivity(actor, user, data.itemId ?? "", data.activityId ?? "");
    case "spells-toggle-prepared":
      return toggleSpellPrepared(actor, user, data.itemId ?? "");
    case "spells-recharge":
      return rechargeSpell(actor, user, data.itemId ?? "");
    case "spells-add-favorite":
      return setSpellFavorite(actor, user, data.itemId ?? "", true);
    case "spells-remove-favorite":
      return setSpellFavorite(actor, user, data.itemId ?? "", false);
    case "effects-toggle-disabled":
      return toggleEffectDisabled(actor, user, data.effectId ?? "");
    case "effects-toggle-condition":
      return toggleCondition(actor, user, data.conditionId ?? "");
    case "effects-delete-temporary":
      return deleteTemporaryEffect(actor, user, data.effectId ?? "");
    case "effects-add-favorite":
      return setEffectFavorite(actor, user, data.effectId ?? "", true);
    case "effects-remove-favorite":
      return setEffectFavorite(actor, user, data.effectId ?? "", false);
    case "effects-end-concentration":
      return endEffectConcentration(actor, user, data.effectId ?? "");
    case "favorites-confirm-value-delta":
      return adjustFavoriteValue(actor, user, data.favoriteId ?? "", data.favoriteType ?? "", toNumber(data.delta));
    case "favorites-use":
      return useFavorite(actor, user, data.favoriteId ?? "", data.favoriteType ?? "", options.event);
    case "favorites-remove-context":
      return removeFavorite(actor, user, data.favoriteId ?? "");
    case "context-add-favorite":
      return setContextFavorite(actor, user, data.favoriteType ?? "unknown", data.favoriteId ?? "", true);
    case "context-remove-favorite":
      return setContextFavorite(actor, user, data.favoriteType ?? "unknown", data.favoriteId ?? "", false);
    default:
      return { ok: false, reason: "unsupported" };
  }
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildDetailsRestConfig(data: Readonly<Record<string, string>>): Dnd5eDetailsRestConfig {
  const type = data.restType === "long" || data.type === "long" ? "long" : "short";
  if (type === "short") {
    return {
      type,
      dialog: false,
      autoHD: data.autoHD === "true"
    };
  }

  return {
    type,
    dialog: false,
    newDay: data.newDay !== "false",
    recoverTemp: data.recoverTemp !== "false",
    recoverTempMax: data.recoverTempMax !== "false"
  };
}

export async function buildCharacterSheetPaneViewModel(options: {
  pane: ActorSheetPaneId;
  actor: ActorSheetNavigationActor | null | undefined;
  user: FoundryUserLike;
  route: CharacterRoute | OwnedDocumentRoute | MobileRoute;
}): Promise<CharacterSheetPaneViewModel> {
  const normalized = normalizeCharacterPane(options.pane);
  const actor = options.actor;
  const actorUuid = options.route.view === RouteView.Character || options.route.view === RouteView.OwnedDocument ? options.route.actorUuid : undefined;
  const routeModel: CharacterSheetPaneViewModel = { pane: normalized, context: getDnd5ePaneContext(normalized), data: undefined };
  const searchQuery = getCharacterPaneSearchQuery(options.route, normalized);

  switch (normalized) {
    case "Details":
      routeModel.data = (await buildDnd5eDetailsViewModel({ actor, user: options.user })) as Dnd5eDetailsModel;
      break;
    case "Inventory":
      routeModel.data = (await buildDnd5eInventoryViewModel({
        actor,
        user: options.user,
        searchQuery
      })) as Dnd5eInventoryModel;
      break;
    case "Features":
      routeModel.data = (await buildDnd5eFeaturesViewModel({ actor, user: options.user, searchQuery })) as Dnd5eFeaturesModel;
      break;
    case "Spells":
      routeModel.data = (await buildDnd5eSpellsViewModel({ actor, user: options.user, searchQuery })) as Dnd5eSpellsModel;
      break;
    case "Effects":
      routeModel.data = (await buildDnd5eEffectsViewModel({ actor, user: options.user, searchQuery })) as Dnd5eEffectsModel;
      break;
    case "Biography":
      routeModel.data = (await buildDnd5eBiographyViewModel({ actor, user: options.user })) as Dnd5eBiographyModel;
      break;
    case "Favorites":
      routeModel.data = (await buildDnd5eFavoritesViewModel({ actor, user: options.user })) as Dnd5eFavoritesModel;
      break;
  }

  if (routeModel.context === "details") {
    routeModel.data = addDnd5eDetailsTemplateState(routeModel.data, actorUuid);
  }
  if (routeModel.context === "favorites") {
    routeModel.data = addDnd5eFavoritesTemplateState(routeModel.data);
  }

  return routeModel;
}

export function getDnd5ePaneContext(pane: ActorSheetPaneId): string {
  return getDnd5ePaneSpec(normalizeCharacterPane(pane)).context;
}

export function getDnd5ePaneSearchDrawerPrefix(pane: ActorSheetPaneId): string | null {
  return getDnd5ePaneSpec(normalizeCharacterPane(pane)).searchDrawerPrefix ?? null;
}

function getCharacterPaneSearchQuery(route: CharacterRoute | OwnedDocumentRoute | MobileRoute, pane: Dnd5eCharacterPane): string {
  const prefix = getDnd5ePaneSearchDrawerPrefix(pane);
  if (route.view !== RouteView.Character || !prefix) return "";
  return route.drawer?.startsWith(prefix) ? decodeURIComponent(route.drawer.slice(prefix.length)) : "";
}

function addDnd5eDetailsTemplateState(model: Dnd5eDetailsModel | unknown, actorUuid: string | undefined): Dnd5eDetailsModel | Record<string, unknown> | undefined {
  if (!model || actorUuid === undefined) return model as Dnd5eDetailsModel | undefined;
  const rawModel = model as Record<string, unknown>;
  if (rawModel.unavailable) return model as Dnd5eDetailsModel | Record<string, unknown>;
  const shortRestLastRoll = DND5E_SHORT_REST_ROLLS_BY_ACTOR.get(actorUuid);
  return shortRestLastRoll
    ? {
        ...rawModel,
        shortRestRoll: shortRestLastRoll
      }
    : model as Dnd5eDetailsModel | Record<string, unknown>;
}

function addDnd5eFavoritesTemplateState(model: Dnd5eFavoritesModel | unknown): Dnd5eFavoritesModel | Record<string, unknown> | undefined {
  if (!model) return model as Dnd5eFavoritesModel | undefined;
  const rawModel = model as Record<string, unknown>;
  if (rawModel.unavailable) return model as Dnd5eFavoritesModel | Record<string, unknown>;
  return {
    ...rawModel,
    helpText: `Use ${getFavoriteContextGestureLabel()} to add or remove favorites.`
  } as Dnd5eFavoritesModel | Record<string, unknown>;
}

function getFavoriteContextGestureLabel(): "long-press" | "right-click" {
  const runtime = globalThis as typeof globalThis & {
    matchMedia?: (query: string) => { matches: boolean };
    navigator?: { maxTouchPoints?: number };
  };
  const coarsePointer = runtime.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const noHover = runtime.matchMedia?.("(hover: none)")?.matches ?? false;
  const touchPoints = runtime.navigator?.maxTouchPoints ?? 0;
  return coarsePointer || noHover || touchPoints > 0 ? "long-press" : "right-click";
}
