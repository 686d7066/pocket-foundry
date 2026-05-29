import { getInitials, getNumber, getObject, getString } from "../../core/utils.ts";
import {
  favoriteIdsMatch,
  getFavoriteEntries as getStoredFavoriteEntries,
  setFavoriteEntry,
  type FavoriteEntry,
  type FavoritesViewModel
} from "../../services/favorites.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";
import { buildDnd5eDetailsViewModel, type Dnd5eDetailsSkillViewModel, type Dnd5eDetailsToolViewModel } from "./details-view-model.ts";
import { buildDnd5eEffectsViewModel, type Dnd5eEffectRowViewModel } from "./effects-view-model.ts";
import { buildDnd5eFeaturesViewModel, type Dnd5eFeatureItemViewModel } from "./features-view-model.ts";
import { buildDnd5eInventoryViewModel, type Dnd5eInventoryItemViewModel } from "./inventory-view-model.ts";
import { buildDnd5eSpellsViewModel, type Dnd5eSpellRowViewModel, type Dnd5eSpellSlotTrackViewModel } from "./spells-view-model.ts";
import { canViewOwnedDocument, clampNumber, formatNumber, getConfigLabel } from "./view-model-helpers.ts";

export type Dnd5eFavoritesActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  type?: string;
  name?: string;
  _source?: { system?: Record<string, unknown> };
  system?: Record<string, unknown>;
  items?: unknown;
  effects?: unknown;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  rollSkill?: (options: { event?: unknown; skill: string }) => Promise<unknown>;
  rollToolCheck?: (options: { event?: unknown; tool: string }) => Promise<unknown>;
};

export type Dnd5eFavoriteDocument = PermissionCheckedDocument & {
  id?: string;
  _id?: string;
  uuid?: string;
  name?: string;
  type?: string;
  img?: string | null;
  parent?: Dnd5eFavoritesActor | Dnd5eFavoriteDocument | null;
  item?: Dnd5eFavoriteDocument;
  target?: Dnd5eFavoritesActor | Dnd5eFavoriteDocument | null;
  system?: Record<string, unknown> & {
    getFavoriteData?: () => Promise<Dnd5ePreparedFavoriteData | null | undefined> | Dnd5ePreparedFavoriteData | null | undefined;
  };
  dependentOrigin?: { active?: boolean };
  disabled?: boolean;
  canUse?: boolean;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  use?: (data?: unknown, options?: unknown) => Promise<unknown>;
  getFavoriteData?: () => Promise<Dnd5ePreparedFavoriteData | null | undefined> | Dnd5ePreparedFavoriteData | null | undefined;
  getRelativeUUID?: (document: Dnd5eFavoritesActor) => string;
};

export type Dnd5ePreparedFavoriteData = {
  img?: string | null;
  title?: string;
  subtitle?: string | string[];
  uses?: Record<string, unknown>;
  modifier?: string | number;
  passive?: string | number;
  save?: Record<string, unknown>;
  value?: string | number;
  quantity?: string | number;
  toggle?: boolean;
  resource?: Record<string, unknown>;
  range?: Record<string, unknown>;
  reference?: string;
  suppressed?: boolean;
  level?: string | number;
};

export type Dnd5eFavoriteEntry = FavoriteEntry;

export type Dnd5eFavoritesConfig = {
  abilities?: Record<string, { label?: string; abbreviation?: string } | string>;
  skills?: Record<string, { label?: string; icon?: string; reference?: string } | string>;
  tools?: Record<string, { id?: string; label?: string; name?: string; img?: string; reference?: string } | string>;
  spellcasting?: Record<string, { img?: string; isSR?: boolean; isSingleLevel?: boolean }>;
};

export type FavoriteResolver = (uuid: string, options: { relative: Dnd5eFavoritesActor }) => Promise<Dnd5eFavoriteDocument | null | undefined>;

export type Dnd5eFavoritePrimaryViewModel = {
  kind: "uses" | "modifier" | "save" | "value" | "quantity" | "toggle" | "resource" | "empty";
  label: string;
  value: string;
  max: string;
  active: boolean;
};

export type Dnd5eFavoriteRowViewModel = {
  id: string;
  type: string;
  sort: number;
  title: string;
  subtitle: string;
  icon: string | null;
  iconText: string;
  primary: Dnd5eFavoritePrimaryViewModel;
  secondary: string;
  reference: string;
  suppressed: boolean;
  level: string;
  itemId: string;
  itemUuid: string;
  effectId: string;
  activityId: string;
  key: string;
  css: string;
  canUse: boolean;
  canInspect: boolean;
  canAdjustValue: boolean;
  canRemoveFavorite: boolean;
  removeContextLabel: "Remove from Favorites";
  detailFacts: Array<{ label: string; value: string }>;
  adjustment: Dnd5eFavoriteAdjustmentViewModel | null;
};

export type Dnd5eFavoriteAdjustmentViewModel = {
  id: string;
  title: string;
  value: string;
  options: Dnd5eFavoriteDeltaOption[];
};

export type Dnd5eFavoriteDeltaOption = {
  value: number;
  label: string;
  center: boolean;
};

export type Dnd5eFavoritesViewModel = Omit<FavoritesViewModel, "groups"> & {
  groups: Dnd5eFavoriteSourceSectionViewModel[];
  rows: Dnd5eFavoriteRowViewModel[];
  sections: Dnd5eFavoriteSourceSectionViewModel[];
};

export type Dnd5eFavoriteSourceSectionViewModel =
  | { id: "skills"; label: "Skills"; kind: "skills"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; skills: Dnd5eDetailsSkillViewModel[]; empty: boolean }
  | { id: "tools"; label: "Tools"; kind: "tools"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; tools: Dnd5eDetailsToolViewModel[]; empty: boolean }
  | { id: "inventory"; label: "Inventory"; kind: "inventory"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; items: Dnd5eInventoryItemViewModel[]; empty: boolean }
  | { id: "spells"; label: "Spells"; kind: "spells"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; spells: Dnd5eSpellRowViewModel[]; empty: boolean }
  | { id: "spell-slots"; label: "Spell Slots"; kind: "spell-slots"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; slotTracks: Dnd5eSpellSlotTrackViewModel[]; empty: boolean }
  | { id: "features"; label: "Features"; kind: "features"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; features: Dnd5eFeatureItemViewModel[]; empty: boolean }
  | { id: "effects"; label: "Effects"; kind: "effects"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; effects: Dnd5eEffectRowViewModel[]; empty: boolean }
  | { id: "legacy-resources"; label: "Resources"; kind: "legacy-resources"; partial: typeof DND5E_FAVORITES_GROUP_PARTIAL; rows: Dnd5eFavoriteRowViewModel[]; empty: boolean };

export type UnavailableDnd5eFavoritesViewModel = {
  unavailable: true;
  title: "Favorites Unavailable";
  body: "These favorites are not available to the current user.";
};

export type Dnd5eFavoritesModel = Dnd5eFavoritesViewModel | UnavailableDnd5eFavoritesViewModel;

export type Dnd5eFavoritesControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden" | "unsupported";
};

const SORT_DENSITY = 100000;
export const DND5E_FAVORITES_GROUP_PARTIAL = "modules/pocket-foundry/systems/dnd5e/templates/partials/favorites-group.hbs";

export async function buildDnd5eFavoritesViewModel(options: {
  actor: Dnd5eFavoritesActor | null | undefined;
  user: FoundryUserLike;
  config?: Dnd5eFavoritesConfig;
  fromUuid?: FavoriteResolver;
}): Promise<Dnd5eFavoritesModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Favorites Unavailable",
      body: "These favorites are not available to the current user."
    };
  }

  const config = normalizeConfig(options.config);
  const canUpdate = canUpdateDocument(actor, options.user);
  const resources = buildLegacyResourceRows(actor, canUpdate);
  const favoriteRows = await buildPreparedFavoriteRows(actor, options.user, canUpdate, config, options.fromUuid ?? getFoundryUuidResolver());
  const groups = await buildSourceSections(actor, options.user, resources);
  const rows = [...resources, ...favoriteRows];

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate,
    helpText: "Use long-press or right-click to add or remove favorites.",
    emptyTitle: "No Favorites",
    emptyBody: "Add favorites from supported skills, tools, inventory, spells, features, effects, and resources.",
    groups,
    sections: groups,
    rows,
    empty: groups.every(group => group.empty)
  };
}

async function buildSourceSections(actor: Dnd5eFavoritesActor, user: FoundryUserLike, resources: Dnd5eFavoriteRowViewModel[]): Promise<Dnd5eFavoriteSourceSectionViewModel[]> {
  const favorites = getFavoriteEntries(actor);
  const itemFavoriteIds = new Set(favorites.filter(favorite => favorite.type === "item").map(favorite => favorite.id));
  const spellFavoriteIds = new Set(favorites.filter(favorite => favorite.type === "spell").map(favorite => favorite.id));
  const featureFavoriteIds = new Set(favorites.filter(favorite => favorite.type === "feature").map(favorite => favorite.id));
  const skillIds = new Set(favorites.filter(favorite => favorite.type === "skill").map(favorite => favorite.id));
  const toolIds = new Set(favorites.filter(favorite => favorite.type === "tool").map(favorite => favorite.id));
  const slotIds = new Set(favorites.filter(favorite => favorite.type === "slots").map(favorite => favorite.id));
  const effectIds = favorites.filter(favorite => favorite.type === "effect").map(favorite => favorite.id);

  const details = await buildDnd5eDetailsViewModel({ actor, user });
  const inventory = await buildDnd5eInventoryViewModel({ actor, user });
  const spells = await buildDnd5eSpellsViewModel({ actor, user });
  const features = await buildDnd5eFeaturesViewModel({ actor, user });
  const effects = await buildDnd5eEffectsViewModel({ actor, user });

  const skills = details.unavailable ? [] : details.skills.filter(skill => skillIds.has(skill.id));
  const tools = details.unavailable ? [] : details.tools.filter(tool => toolIds.has(tool.id));
  const inventoryItems = inventory.unavailable ? [] : inventory.sections.flatMap(section => section.items).filter(item => matchesAnyFavoriteId([...itemFavoriteIds], item.id, item.uuid));
  const spellRows = spells.unavailable ? [] : spells.sections.flatMap(section => section.spells).filter(spell => matchesAnyFavoriteId([...itemFavoriteIds, ...spellFavoriteIds], spell.id, spell.uuid));
  const slotTracks = spells.unavailable ? [] : spells.slotTracks.filter(track => slotIds.has(track.id));
  const featureRows = features.unavailable ? [] : features.sections.flatMap(section => section.items).filter(feature => matchesAnyFavoriteId([...itemFavoriteIds, ...featureFavoriteIds], feature.id, feature.uuid));
  const effectRows = effects.unavailable ? [] : effects.sections.flatMap(section => section.effects).filter(effect => matchesAnyFavoriteId(effectIds, effect.id, effect.uuid, effect.favoriteId));

  const sections: Dnd5eFavoriteSourceSectionViewModel[] = [
    { id: "skills", label: "Skills", kind: "skills", partial: DND5E_FAVORITES_GROUP_PARTIAL, skills, empty: skills.length === 0 },
    { id: "tools", label: "Tools", kind: "tools", partial: DND5E_FAVORITES_GROUP_PARTIAL, tools, empty: tools.length === 0 },
    { id: "inventory", label: "Inventory", kind: "inventory", partial: DND5E_FAVORITES_GROUP_PARTIAL, items: inventoryItems, empty: inventoryItems.length === 0 },
    { id: "spells", label: "Spells", kind: "spells", partial: DND5E_FAVORITES_GROUP_PARTIAL, spells: spellRows, empty: spellRows.length === 0 },
    { id: "spell-slots", label: "Spell Slots", kind: "spell-slots", partial: DND5E_FAVORITES_GROUP_PARTIAL, slotTracks, empty: slotTracks.length === 0 },
    { id: "features", label: "Features", kind: "features", partial: DND5E_FAVORITES_GROUP_PARTIAL, features: featureRows, empty: featureRows.length === 0 },
    { id: "effects", label: "Effects", kind: "effects", partial: DND5E_FAVORITES_GROUP_PARTIAL, effects: effectRows, empty: effectRows.length === 0 },
    { id: "legacy-resources", label: "Resources", kind: "legacy-resources", partial: DND5E_FAVORITES_GROUP_PARTIAL, rows: resources, empty: resources.length === 0 }
  ];
  return sections.filter(section => !section.empty);
}

function matchesAnyFavoriteId(favoriteIds: string[], ...rowIds: string[]): boolean {
  return favoriteIds.some(favoriteId => rowIds.some(rowId => idsMatch(favoriteId, rowId)));
}

function idsMatch(favoriteId: string, rowId: string): boolean {
  if (!favoriteId || !rowId) return false;
  return favoriteIdsMatch(favoriteId, rowId);
}

export async function useFavorite(
  actor: Dnd5eFavoritesActor | null | undefined,
  user: FoundryUserLike,
  favoriteId: string,
  type: string,
  event?: unknown,
  fromUuid: FavoriteResolver = getFoundryUuidResolver()
): Promise<Dnd5eFavoritesControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  if (type === "skill") {
    if (typeof actor.rollSkill !== "function") return { ok: false, reason: "unsupported" };
    await actor.rollSkill({ event, skill: favoriteId });
    return { ok: true };
  }

  if (type === "tool") {
    if (typeof actor.rollToolCheck !== "function") return { ok: false, reason: "unsupported" };
    await actor.rollToolCheck({ event, tool: favoriteId });
    return { ok: true };
  }

  if (type === "slots" || type === "resource") return { ok: false, reason: "unsupported" };

  const target = await fromUuid(favoriteId, { relative: actor });
  if (!target || !canViewFavoriteTarget(actor, target, user)) return { ok: false, reason: "unavailable" };
  if (type === "effect") {
    if (typeof target.update !== "function") return { ok: false, reason: "unsupported" };
    await target.update({ disabled: !target.disabled });
    return { ok: true };
  }

  const usable = type === "activity" ? target : target;
  if (usable.canUse === false || typeof usable.use !== "function") return { ok: false, reason: "unsupported" };
  await usable.use({ event }, { options: { sheet: null } });
  return { ok: true };
}

export async function adjustFavoriteValue(
  actor: Dnd5eFavoritesActor | null | undefined,
  user: FoundryUserLike,
  favoriteId: string,
  type: string,
  delta: number,
  fromUuid: FavoriteResolver = getFoundryUuidResolver()
): Promise<Dnd5eFavoritesControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  if (type === "resource" && favoriteId.startsWith("resources.")) {
    const resourceKey = favoriteId.slice("resources.".length);
    const resource = getObject(getObject(actor.system)?.resources)?.[resourceKey];
    const resourceObject = getObject(resource);
    const max = getNumber(resourceObject?.max);
    const value = getNumber(resourceObject?.value);
    if (max === null || value === null || typeof actor.update !== "function") return { ok: false, reason: "unsupported" };
    await actor.update({ [`system.resources.${resourceKey}.value`]: clampNumber(Math.trunc(value + delta), 0, max) });
    return { ok: true };
  }

  const target = await fromUuid(favoriteId, { relative: actor });
  if (!target || !canViewFavoriteTarget(actor, target, user)) return { ok: false, reason: "unavailable" };
  const data = await getPreparedData(type, target, actor, normalizeConfig());
  const uses = getObject(data?.uses);
  const name = getString(uses?.name);
  const max = getNumber(uses?.max);
  const value = getNumber(uses?.value);
  if (!name || max === null || value === null) return { ok: false, reason: "unsupported" };

  const updater = type === "activity" ? target.item ?? target : target;
  if (typeof updater.update !== "function") return { ok: false, reason: "unsupported" };
  await updater.update({ [name]: clampNumber(Math.trunc(value + delta), 0, max) });
  return { ok: true };
}

export async function removeFavorite(
  actor: Dnd5eFavoritesActor | null | undefined,
  user: FoundryUserLike,
  favoriteId: string
): Promise<Dnd5eFavoritesControlResult> {
  return setContextFavorite(actor, user, "unknown", favoriteId, false);
}

export async function setContextFavorite(
  actor: Dnd5eFavoritesActor | null | undefined,
  user: FoundryUserLike,
  type: string,
  favoriteId: string,
  favorite: boolean
): Promise<Dnd5eFavoritesControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  return (await setFavoriteEntry(actor, type, favoriteId, favorite, {
    fallbackEntries: getObject(actor.system)?.favorites,
    legacyToggle: (nextFavorite, target) => toggleLegacyFavorite(actor, nextFavorite, target)
  })) ? { ok: true } : { ok: false, reason: "unsupported" };
}

function buildLegacyResourceRows(actor: Dnd5eFavoritesActor, canUpdate: boolean): Dnd5eFavoriteRowViewModel[] {
  const resources = getObject(getObject(actor.system)?.resources) ?? {};
  const sourceResources = getObject(getObject(actor._source?.system)?.resources) ?? {};
  const rows: Dnd5eFavoriteRowViewModel[] = [];
  let index = 0;

  for (const [key, value] of Object.entries(resources)) {
    const resource = getObject(value);
    const label = getString(resource?.label);
    const max = getNumber(resource?.max);
    if (!label || !max) continue;

    const favoriteId = `resources.${key}`;
    const prepared: Dnd5ePreparedFavoriteData = {
      img: "icons/svg/upgrade.svg",
      title: label,
      subtitle: [resource?.sr ? "SR" : "", resource?.lr ? "LR" : ""].filter(Boolean),
      resource: {
        value: getNumber(resource?.value) ?? 0,
        max,
        source: getObject(sourceResources[key]) ?? resource
      }
    };
    rows.push(buildFavoriteRow({
      id: favoriteId,
      type: "resource",
      sort: index++ - SORT_DENSITY,
      data: prepared,
      canUpdate,
      target: null
    }));
  }

  return rows;
}

async function buildPreparedFavoriteRows(
  actor: Dnd5eFavoritesActor,
  user: FoundryUserLike,
  canUpdate: boolean,
  config: Dnd5eFavoritesConfig,
  fromUuid: FavoriteResolver
): Promise<Dnd5eFavoriteRowViewModel[]> {
  const entries = getFavoriteEntries(actor);
  const rows: Dnd5eFavoriteRowViewModel[] = [];

  for (const entry of entries) {
    let target: Dnd5eFavoriteDocument | null = null;
    if (entry.type === "item" || entry.type === "activity" || entry.type === "effect") {
      target = (await fromUuid(entry.id, { relative: actor })) ?? null;
      if (!target || target.dependentOrigin?.active === false || !canViewFavoriteTarget(actor, target, user)) continue;
    }

    const data = await getPreparedData(entry.type, target, actor, config, entry.id);
    if (!data) continue;
    rows.push(buildFavoriteRow({ id: entry.id, type: entry.type, sort: entry.sort, data, canUpdate, target }));
  }

  return rows.sort((left, right) => left.sort - right.sort);
}

function buildFavoriteRow(options: {
  id: string;
  type: string;
  sort: number;
  data: Dnd5ePreparedFavoriteData;
  canUpdate: boolean;
  target: Dnd5eFavoriteDocument | null;
}): Dnd5eFavoriteRowViewModel {
  const { id, type, sort, data, canUpdate, target } = options;
  const title = getString(data.title) || target?.name || "Favorite";
  const subtitle = normalizeSubtitle(data.subtitle);
  const primary = buildPrimary(data);
  const secondary = buildSecondary(data);
  const item = type === "activity" ? target?.item : type === "item" ? target : null;
  const itemId = item?.id ?? item?._id ?? "";
  const effectId = type === "effect" ? target?.id ?? target?._id ?? "" : "";
  const activityId = type === "activity" ? target?.id ?? target?._id ?? "" : "";
  const itemUuid = item?.uuid ?? "";
  const adjustment = canUpdate && (primary.kind === "uses" || primary.kind === "resource") && primary.max ? buildAdjustment(id, title, Number(primary.value), Number(primary.max)) : null;

  return {
    id,
    type,
    sort,
    title,
    subtitle,
    icon: getString(data.img) || target?.img || null,
    iconText: getInitials(title, "F"),
    primary,
    secondary,
    reference: getString(data.reference),
    suppressed: data.suppressed === true,
    level: formatLooseValue(data.level),
    itemId,
    itemUuid,
    effectId,
    activityId,
    key: type === "skill" || type === "tool" ? id : "",
    css: primary.kind,
    canUse: canUpdate && ["item", "activity", "effect", "skill", "tool"].includes(type),
    canInspect: Boolean(itemUuid || getString(data.reference) || effectId),
    canAdjustValue: adjustment !== null,
    canRemoveFavorite: canUpdate,
    removeContextLabel: "Remove from Favorites",
    detailFacts: buildDetailFacts(type, data, target, primary, secondary),
    adjustment
  };
}

async function getPreparedData(
  type: string,
  target: Dnd5eFavoriteDocument | null,
  actor: Dnd5eFavoritesActor,
  config: Dnd5eFavoritesConfig,
  id = ""
): Promise<Dnd5ePreparedFavoriteData | null> {
  if (type === "item") return normalizePreparedData(await target?.system?.getFavoriteData?.());
  if (type === "activity" || type === "effect") return normalizePreparedData(await target?.getFavoriteData?.());
  if (type === "skill" || type === "tool") return buildSkillToolFavoriteData(actor, config, type, id);
  if (type === "slots") return buildSlotFavoriteData(actor, config, id);
  return null;
}

function buildSkillToolFavoriteData(actor: Dnd5eFavoritesActor, config: Dnd5eFavoritesConfig, type: string, id: string): Dnd5ePreparedFavoriteData | null {
  const data = getObject(getObject(actor.system)?.[`${type}s`])?.[id];
  const entry = getObject(data);
  if (!entry) return null;

  const ability = getString(entry.ability);
  const abilityLabel = getAbilityLabel(config, ability);
  if (type === "skill") {
    const skill = config.skills?.[id];
    const skillObject = getObject(skill);
    return {
      img: getString(skillObject?.icon),
      title: getString(skillObject?.label) || (typeof skill === "string" ? skill : id.toUpperCase()),
      subtitle: abilityLabel ? `${abilityLabel} Ability Check` : "Ability Check",
      modifier: getNumber(entry.total) ?? getString(entry.total),
      passive: getNumber(entry.passive) ?? getString(entry.passive),
      reference: getString(skillObject?.reference)
    };
  }

  const tool = config.tools?.[id];
  const toolObject = getObject(tool);
  return {
    img: getString(toolObject?.img),
    title: getString(toolObject?.label) || getString(toolObject?.name) || (typeof tool === "string" ? tool : id),
    subtitle: abilityLabel ? `${abilityLabel} Tool Check` : "Tool Check",
    modifier: getNumber(entry.total) ?? getString(entry.total),
    passive: getNumber(entry.passive) ?? getString(entry.passive),
    reference: getString(toolObject?.reference)
  };
}

function buildSlotFavoriteData(actor: Dnd5eFavoritesActor, config: Dnd5eFavoritesConfig, id: string): Dnd5ePreparedFavoriteData | null {
  const slot = getObject(getObject(getObject(actor.system)?.spells)?.[id]);
  if (!slot) return null;

  const level = getNumber(slot.level) ?? Number(id.replace(/\D+/g, ""));
  const method = getString(slot.type) || "spell";
  const model = getObject(config.spellcasting?.[method]);
  const max = getNumber(slot.max);
  const value = getNumber(slot.value);
  if (max === null || value === null) return null;

  return {
    img: getString(model?.img).replace("{id}", id),
    title: method === "pact" ? "Pact Magic Slots" : level ? `${ordinal(level)} Level Slots` : "Spell Slots",
    subtitle: [level ? `${ordinal(level)} Level` : "", model?.isSR === true ? "SR" : "LR"].filter(Boolean),
    uses: { value, max, name: `system.spells.${id}.value` },
    level,
    value: method
  };
}

function buildPrimary(data: Dnd5ePreparedFavoriteData): Dnd5eFavoritePrimaryViewModel {
  const uses = getObject(data.uses);
  const usesMax = getNumber(uses?.max);
  if (usesMax !== null) {
    return { kind: "uses", label: "Uses", value: formatLooseValue(uses?.value), max: formatNumber(usesMax), active: true };
  }

  if (data.modifier !== undefined) return { kind: "modifier", label: "Modifier", value: formatModifier(data.modifier), max: "", active: true };

  const save = getObject(data.save);
  const saveDc = getObject(save?.dc);
  const saveDcValue = getNumber(saveDc?.value) ?? getNumber(save?.dc);
  if (saveDcValue !== null) return { kind: "save", label: "Save", value: `DC ${formatNumber(saveDcValue)}`, max: "", active: true };

  if (data.value !== undefined) return { kind: "value", label: "Value", value: formatLooseValue(data.value), max: "", active: true };
  if (data.quantity !== undefined && formatLooseValue(data.quantity)) return { kind: "quantity", label: "Qty", value: `x${formatLooseValue(data.quantity)}`, max: "", active: true };
  if (data.toggle !== undefined) return { kind: "toggle", label: "Toggle", value: data.toggle ? "on" : "off", max: "", active: data.toggle };

  const resource = getObject(data.resource);
  const resourceMax = getNumber(resource?.max);
  if (resourceMax !== null) return { kind: "resource", label: "Resource", value: formatLooseValue(resource?.value), max: formatNumber(resourceMax), active: true };

  return { kind: "empty", label: "", value: "", max: "", active: false };
}

function buildSecondary(data: Dnd5ePreparedFavoriteData): string {
  const uses = getObject(data.uses);
  const quantity = formatLooseValue(data.quantity);
  if (uses && quantity && quantity !== "1") return `x ${quantity}`;

  const range = getObject(data.range);
  const value = formatLooseValue(range?.value);
  const long = formatLooseValue(range?.long);
  const reach = formatLooseValue(range?.reach);
  const units = getString(range?.units);
  if (value) return `${value}${long ? `/${long}` : ""}${units ? ` ${units}` : ""}`;
  if (reach) return `${reach}${units ? ` ${units}` : ""}`;

  const passive = formatLooseValue(data.passive);
  if (passive) return `passive ${passive}`;
  return "";
}

function buildDetailFacts(
  type: string,
  data: Dnd5ePreparedFavoriteData,
  target: Dnd5eFavoriteDocument | null,
  primary: Dnd5eFavoritePrimaryViewModel,
  secondary: string
): Array<{ label: string; value: string }> {
  return [
    { label: "Type", value: type },
    { label: "Source", value: target?.name ?? "" },
    { label: primary.label, value: primary.max ? `${primary.value}/${primary.max}` : primary.value },
    { label: "Secondary", value: secondary },
    { label: "Reference", value: getString(data.reference) }
  ].filter(fact => fact.label && fact.value);
}

function buildAdjustment(id: string, title: string, value: number, max: number): Dnd5eFavoriteAdjustmentViewModel | null {
  if (!Number.isFinite(value) || !Number.isFinite(max)) return null;
  const positiveLimit = Math.trunc(Math.min(50, Math.max(0, max - value)));
  const negativeLimit = Math.trunc(Math.min(50, Math.max(0, value)));
  const values = Array.from({ length: positiveLimit + negativeLimit + 1 }, (_unused, index) => positiveLimit - index);
  return {
    id,
    title: `Adjust ${title}`,
    value: `${formatNumber(value)}/${formatNumber(max)}`,
    options: values.map(option => ({ value: option, label: option > 0 ? `+${option}` : String(option), center: option === 0 }))
  };
}

function getFavoriteEntries(actor: Dnd5eFavoritesActor): Dnd5eFavoriteEntry[] {
  return getStoredFavoriteEntries(actor, { fallbackEntries: getObject(actor.system)?.favorites });
}

async function toggleLegacyFavorite(actor: Dnd5eFavoritesActor, favorite: boolean, target: unknown): Promise<unknown> {
  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return false;
  return (action as (favoriteTarget: unknown) => Promise<unknown>).call(system, target);
}

function canViewFavoriteTarget(actor: Dnd5eFavoritesActor, target: Dnd5eFavoriteDocument, user: FoundryUserLike): boolean {
  return canViewOwnedDocument(actor, target, user);
}

function normalizePreparedData(value: Dnd5ePreparedFavoriteData | null | undefined): Dnd5ePreparedFavoriteData | null {
  return getObject(value) as Dnd5ePreparedFavoriteData | null;
}

function normalizeSubtitle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.map(part => getString(part)).filter(Boolean).join(" - ");
  return getString(value);
}

function normalizeConfig(config: Dnd5eFavoritesConfig | undefined = getDnd5eConfig()): Dnd5eFavoritesConfig {
  return config ?? {};
}

function getDnd5eConfig(): Dnd5eFavoritesConfig {
  const runtime = globalThis as { CONFIG?: { DND5E?: Dnd5eFavoritesConfig } };
  return runtime.CONFIG?.DND5E ?? {};
}

function getFoundryUuidResolver(): FavoriteResolver {
  const runtime = globalThis as { fromUuid?: FavoriteResolver; foundry?: { utils?: { fromUuid?: FavoriteResolver } } };
  return runtime.fromUuid ?? runtime.foundry?.utils?.fromUuid ?? (async () => null);
}

function getAbilityLabel(config: Dnd5eFavoritesConfig, ability: string): string {
  return getConfigLabel(config.abilities, ability, ability.toUpperCase());
}

function formatModifier(value: string | number | undefined): string {
  if (typeof value === "number") return value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);
  const stringValue = getString(value);
  if (!stringValue) return "";
  return stringValue.startsWith("+") || stringValue.startsWith("-") ? stringValue : `+${stringValue}`;
}

function formatLooseValue(value: unknown): string {
  const number = getNumber(value);
  if (number !== null) return formatNumber(number);
  return getString(value);
}

function ordinal(value: number): string {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}
