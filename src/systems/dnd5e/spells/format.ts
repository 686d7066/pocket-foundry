import type { FoundryUserLike } from "../../../services/permissions.ts";
import { getCollectionContents, getNumber, getObject, getString } from "../../../core/utils.ts";
import { hasDnd5eFavoriteReference } from "../favorites-storage.ts";
import {
  buildSignedAdjustmentOptions,
  canUpdateOwnedDocument,
  canViewOwnedDocument,
  clampNumber,
  formatAttackValue,
  formatNumber,
  formatPair,
  getEntityId,
  getEntityUuid,
  getRemainingUses,
  getUsesLabel,
  normalizeSearchQuery,
  titleCase,
  uniqueStrings
} from "../view-model-helpers.ts";
import {
  DEFAULT_SPELLCASTING,
  type Dnd5eSpellAdjustmentViewModel,
  type Dnd5eSpellActivity,
  type Dnd5eSpellcastingClass,
  type Dnd5eSpellItem,
  type Dnd5eSpellsActor,
  type Dnd5eSpellsConfig
} from "./types.ts";

export function getSpellItems(actor: Dnd5eSpellsActor, user: FoundryUserLike): Dnd5eSpellItem[] {
  const spells = actor.itemTypes?.spell ?? (getCollectionContents(actor.items) as Dnd5eSpellItem[]).filter(item => item.type === "spell");
  return spells.filter(item => canViewOwnedSpell(actor, item, user));
}

export function canViewOwnedSpell(actor: Dnd5eSpellsActor, item: Dnd5eSpellItem, user: FoundryUserLike): boolean {
  return canViewOwnedDocument(actor, item, user);
}

export function canUpdateOwnedSpell(actor: Dnd5eSpellsActor | null | undefined, item: Dnd5eSpellItem, user: FoundryUserLike): boolean {
  return canUpdateOwnedDocument(actor, item, user);
}

export function canPrepareSpell(item: Dnd5eSpellItem, config: Dnd5eSpellsConfig, canUpdate: boolean): boolean {
  if (!canUpdate) return false;
  const system = getObject(item.system) ?? {};
  const method = getString(system.method);
  const level = getNumber(system.level) ?? 0;
  const linkedActivity = getObject(system.linkedActivity);
  if (linkedActivity?.item) return false;
  const methodConfig = config.spellcasting?.[method] ?? DEFAULT_SPELLCASTING[method];
  if (methodConfig?.prepares !== true) return false;
  if (level < 1) return false;
  return !isAlwaysPrepared(item, config);
}

export function getUsableActivities(item: Dnd5eSpellItem): Dnd5eSpellActivity[] {
  const activities = getObject(item.system)?.activities;
  return (getCollectionContents(activities) as Dnd5eSpellActivity[]).filter(activity => activity && activity.canUse !== false);
}

export function findActivity(item: Dnd5eSpellItem, activityId: string): Dnd5eSpellActivity | null {
  return getUsableActivities(item).find(activity => activity.id === activityId || activity._id === activityId) ?? null;
}

export function findOwnedSpell(actor: Dnd5eSpellsActor | null | undefined, user: FoundryUserLike, itemId: string): Dnd5eSpellItem | null {
  if (!actor) return null;
  return getSpellItems(actor, user).find(item => item.id === itemId || item._id === itemId || item.uuid === itemId) ?? null;
}

export function normalizeConfig(config: Dnd5eSpellsConfig | undefined): Dnd5eSpellsConfig {
  const globalConfig = getObject((globalThis as { CONFIG?: { DND5E?: Dnd5eSpellsConfig } }).CONFIG?.DND5E);
  const dnd5eConfig = config ?? (globalConfig as Dnd5eSpellsConfig | undefined) ?? {};
  return {
    ...dnd5eConfig,
    spellcasting: { ...DEFAULT_SPELLCASTING, ...(dnd5eConfig.spellcasting ?? {}) }
  };
}

export function getItemId(item: Dnd5eSpellItem): string {
  return getEntityId(item);
}

export function getItemUuid(item: Dnd5eSpellItem): string {
  return getEntityUuid(item);
}

export function getItemName(item: Dnd5eSpellItem, fallback: string): string {
  return item.name?.trim() || fallback;
}

export function getClassLevels(item: Dnd5eSpellcastingClass): number {
  return getNumber(getObject(item.system)?.levels) ?? 0;
}

export function isPrepared(item: Dnd5eSpellItem): boolean {
  const system = getObject(item.system) ?? {};
  return system.prepared === true || getObject(system.preparation)?.prepared === true || isAlwaysPrepared(item);
}

export function isAlwaysPrepared(item: Dnd5eSpellItem, config?: Dnd5eSpellsConfig): boolean {
  const system = getObject(item.system) ?? {};
  const alwaysValue = config?.spellPreparationStates?.always?.value;
  return system.prepared === alwaysValue || getString(getObject(system.preparation)?.mode) === "always" || getString(system.prepared) === "always";
}

export function getPreparationLabel(item: Dnd5eSpellItem, config: Dnd5eSpellsConfig): string {
  if (isAlwaysPrepared(item, config)) return getString(config.spellPreparationStates?.always?.label) || "Always prepared";
  return isPrepared(item) ? getString(config.spellPreparationStates?.prepared?.label) || "Prepared" : getString(config.spellPreparationStates?.unprepared?.label) || "Unprepared";
}

export function getSchoolLabel(item: Dnd5eSpellItem, config: Dnd5eSpellsConfig): string {
  const labels = getObject(item.labels) ?? {};
  const system = getObject(item.system) ?? {};
  const schoolKey = getString(system.school);
  const schoolConfig = config.spellSchools?.[schoolKey];
  return getString(labels.school) || (typeof schoolConfig === "string" ? schoolConfig : getString(schoolConfig?.label)) || schoolKey.toUpperCase() || "-";
}

export function getComponentsLabel(item: Dnd5eSpellItem): string {
  const components = getObject(getObject(item.labels)?.components);
  const vsm = getString(components?.vsm);
  if (vsm) return vsm;
  return (getCollectionContents(components?.all) as Array<{ abbr?: string }>).map(component => getString(component.abbr)).filter(Boolean).join(",");
}

export function getActivationLabel(system: Record<string, unknown>): string {
  const activation = getObject(system.activation);
  const type = getString(activation?.type);
  const value = getNumber(activation?.value) ?? getNumber(activation?.cost);
  return abbreviateActivationType(type, value);
}

export function getActivityActivationLabel(activation: Record<string, unknown> | null): string {
  const type = getString(activation?.type);
  const value = getNumber(activation?.value);
  return abbreviateActivationType(type, value);
}

export function abbreviateActivationLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) return "";
  const lower = normalized.toLocaleLowerCase();
  if (lower === "action" || lower === "1 action") return "A";
  if (lower === "bonus action" || lower === "1 bonus action") return "BA";
  if (lower === "reaction" || lower === "1 reaction") return "R";
  if (lower === "minute" || lower === "1 minute") return "1m";
  if (lower === "hour" || lower === "1 hour") return "1h";
  if (lower === "day" || lower === "1 day") return "1d";

  const match = lower.match(/^(\d+(?:\.\d+)?)\s*(actions?|bonus actions?|reactions?|minutes?|hours?|days?|rounds?)$/);
  if (!match) return normalized;

  const amount = match[1] ?? "";
  const unit = match[2] ?? "";
  if (unit.startsWith("action")) return `${amount}A`;
  if (unit.startsWith("bonus")) return `${amount}BA`;
  if (unit.startsWith("reaction")) return `${amount}R`;
  if (unit.startsWith("minute")) return `${amount}m`;
  if (unit.startsWith("hour")) return `${amount}h`;
  if (unit.startsWith("day")) return `${amount}d`;
  if (unit.startsWith("round")) return `${amount}r`;
  return normalized;
}

function abbreviateActivationType(type: string, value: number | null): string {
  const normalizedType = type.toLocaleLowerCase();
  if (!normalizedType) return "-";

  if (normalizedType === "action") return value === null || value === 1 ? "A" : `${formatNumber(value)}A`;
  if (normalizedType === "bonus") return value === null || value === 1 ? "BA" : `${formatNumber(value)}BA`;
  if (normalizedType === "reaction") return value === null || value === 1 ? "R" : `${formatNumber(value)}R`;
  if (normalizedType === "minute") return `${formatNumber(value ?? 1)}m`;
  if (normalizedType === "hour") return `${formatNumber(value ?? 1)}h`;
  if (normalizedType === "day") return `${formatNumber(value ?? 1)}d`;
  if (normalizedType === "round") return `${formatNumber(value ?? 1)}r`;

  return [value === null || value === 1 ? "" : formatNumber(value), normalizedType].filter(Boolean).join(" ") || "-";
}

export function getRangeLabel(system: Record<string, unknown>): string {
  const range = getObject(system.range);
  const units = getString(range?.units);
  const value = getNumber(range?.value);
  if (!units || units === "none") return "-";
  if (units === "self" || units === "touch" || units === "spec") return units === "spec" ? "Special" : titleCase(units);
  return [value === null ? "" : formatNumber(value), units].filter(Boolean).join(" ");
}

export function getRollLabel(item: Dnd5eSpellItem): string {
  const labels = getObject(item.labels) ?? {};
  const modifier = formatAttackValue(getString(labels.modifier));
  if (modifier !== "-") return modifier;
  const saveActivity = (getCollectionContents(getObject(item.system)?.activities) as Dnd5eSpellActivity[]).find(activity => getObject(activity.save));
  const save = saveActivity ? getSaveLabel(getObject(saveActivity.save)) : "";
  return save || "-";
}

export function getSaveLabel(save: Record<string, unknown> | null): string {
  const dc = getNumber(save?.dc) ?? getNumber(getObject(save?.value)?.dc);
  const ability = getSetOrStringLabel(save?.ability);
  if (dc !== null && ability) return `${ability.toUpperCase()} ${dc}`;
  if (dc !== null) return `DC ${dc}`;
  return ability ? ability.toUpperCase() : "-";
}

export function getSetOrStringLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Set) return [...value].map(String).join("/");
  if (Array.isArray(value)) return value.map(String).join("/");
  return "";
}

export function getSpellSource(actor: Dnd5eSpellsActor, item: Dnd5eSpellItem): string {
  const system = getObject(item.system) ?? {};
  const linked = getObject(system.linkedActivity);
  const linkedItem = getObject(linked?.item);
  if (linkedItem) return getString(linkedItem.name);

  const sourceItem = getString(system.sourceItem);
  if (sourceItem) {
    const identifiedItems = getObject(actor)?.identifiedItems as { get?: (id: string) => { first?: () => Dnd5eSpellItem | undefined } } | undefined;
    const source = identifiedItems?.get?.(sourceItem)?.first?.();
    if (source?.name) return source.name;
  }

  const advancementOrigin = getString(item.getFlag?.("dnd5e", "advancementOrigin")) || getString(getObject(getObject(item.flags)?.dnd5e)?.advancementOrigin);
  const [itemId] = advancementOrigin.split(".");
  if (itemId) {
    const source = (getCollectionContents(actor.items) as Dnd5eSpellItem[]).find(candidate => getItemId(candidate) === itemId);
    if (source?.name) return source.name;
  }

  return getString(system.source) || "";
}

export function getSpellDescription(item: Dnd5eSpellItem): string {
  const description = getObject(getObject(item.system)?.description);
  return getString(description?.value) || getString(description?.unidentified);
}

export function isFavorite(actor: Dnd5eSpellsActor, item: Dnd5eSpellItem): boolean {
  const id = getItemId(item);
  const uuid = getItemUuid(item);
  return hasDnd5eFavoriteReference(actor, [id, uuid], ["id", "item", "uuid"]);
}

export function buildAdjustment(current: number, max: number, label: string): Dnd5eSpellAdjustmentViewModel {
  return {
    id: "uses",
    title: "Adjust Uses",
    label,
    value: label,
    current,
    max,
    options: buildSignedAdjustmentOptions(current, max)
  };
}

export function formatModifier(value: number): string {
  return value >= 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

export function ordinal(value: number): string {
  const abs = Math.abs(Math.trunc(value));
  const suffix = abs % 100 >= 11 && abs % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[abs % 10] ?? "th";
  return `${value}${suffix}`;
}

export function hasSetValue(value: unknown, key: string): boolean {
  return typeof (value as { has?: unknown })?.has === "function" && (value as Set<string>).has(key);
}

export { clampNumber, formatAttackValue, formatNumber, formatPair, getRemainingUses, getUsesLabel, normalizeSearchQuery, titleCase, uniqueStrings };

export function getFallbackSectionLabel(key: string, level: number | null | undefined): string {
  if (key === "spell0" || level === 0) return "Cantrips";
  if (key === "innate") return "Innate";
  if (key === "atwill") return "At-will";
  if (key === "pact") return "Pact Magic";
  return level ? `${ordinal(level)} Level` : "Spells";
}
