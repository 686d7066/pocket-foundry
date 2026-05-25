import { getCollectionContents, getNumber, getObject, getString } from "../../core/utils.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function formatPair(value: number | null, max: number | null): string {
  if (value === null && max === null) return "-";
  return `${value ?? "-"}/${max ?? "-"}`;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function normalizeSearchQuery(value: string | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function toSearchTerms(value: string): string[] {
  return value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

export function isGmUser(user: FoundryUserLike): boolean {
  return getObject(user)?.isGM === true;
}

export function getRemainingUses(uses: Record<string, unknown> | null): number | null {
  const max = getNumber(uses?.max);
  const spent = getNumber(uses?.spent);
  if (max === null || spent === null) return null;
  return Math.max(max - spent, 0);
}

export function getUsesLabel(uses: Record<string, unknown> | null): string {
  const value = getNumber(uses?.value) ?? getRemainingUses(uses);
  const max = getNumber(uses?.max);
  return formatPair(value, max);
}

export function formatAttackValue(value: string, emptyValue = "-"): string {
  const trimmed = value.trim();
  if (!trimmed) return emptyValue;
  if (trimmed.startsWith("+") || trimmed.startsWith("-")) return trimmed;
  return /^(\d+|\d+\.\d+)$/.test(trimmed) ? `+${trimmed}` : trimmed;
}

export type LinkIdentity = {
  uuid?: string;
  id?: string;
  name?: string;
};

export type Dnd5eConfigLabelDictionary = Record<string, unknown>;
export type Dnd5eEntityWithIdentity = {
  id?: string;
  _id?: string;
  uuid?: string;
  parent?: { uuid?: string } | null;
};

export type Dnd5eSignedAdjustmentOption = {
  value: number;
  label: string;
  center: boolean;
};

/**
 * Generic suppression rule for expandable-detail link pills:
 * if target resolves to the same visible/current entity, do not render a pill.
 */
export function isExpandableDetailLinkPillLinkable(current: LinkIdentity, target: LinkIdentity): boolean {
  const targetUuid = target.uuid?.trim() ?? "";
  const targetName = target.name?.trim() ?? "";
  if (!targetUuid || !targetName) return false;

  const currentUuid = current.uuid?.trim() ?? "";
  const currentId = current.id?.trim() ?? "";
  const currentName = current.name?.trim() ?? "";

  if (currentUuid && targetUuid === currentUuid) return false;
  if (currentId && targetUuid === currentId) return false;
  if (currentName && targetName.localeCompare(currentName, undefined, { sensitivity: "accent" }) === 0) return false;
  return true;
}

export function isExpandableDetailEntityLinkPillLinkable(current: unknown, target: unknown): boolean {
  return isExpandableDetailLinkPillLinkable(toLinkIdentity(current), toLinkIdentity(target));
}

export function getEntityId(entity: Dnd5eEntityWithIdentity, options: { includeUuidFallback?: boolean } = {}): string {
  const includeUuidFallback = options.includeUuidFallback ?? true;
  return entity.id ?? entity._id ?? (includeUuidFallback ? entity.uuid ?? "" : "");
}

export function getEntityUuid(entity: Dnd5eEntityWithIdentity): string {
  const id = getEntityId(entity);
  return entity.uuid ?? (entity.parent?.uuid && id ? `${entity.parent.uuid}.Item.${id}` : id);
}

export function canViewOwnedDocument(actor: PermissionCheckedDocument, document: PermissionCheckedDocument, user: FoundryUserLike): boolean {
  if (!canViewDocument(actor, user)) return false;
  if (typeof document.testUserPermission === "function" || typeof document.getUserLevel === "function") return canViewDocument(document, user);
  return true;
}

export function canUpdateOwnedDocument(
  actor: PermissionCheckedDocument | null | undefined,
  document: PermissionCheckedDocument,
  user: FoundryUserLike,
  options: { parentFallback?: boolean; ownerFallback?: boolean } = {}
): boolean {
  if (!actor || !canUpdateDocument(actor, user)) return false;

  if (options.parentFallback && document.parent && (typeof document.parent.canUserModify === "function" || typeof document.parent.getUserLevel === "function")) {
    return canUpdateDocument(document.parent, user);
  }

  if (typeof document.canUserModify === "function" || typeof document.getUserLevel === "function") return canUpdateDocument(document, user);

  return options.ownerFallback ? (document as { isOwner?: boolean }).isOwner !== false : true;
}

export function hasFavoriteReference(
  favorites: unknown,
  identifiers: Array<string | undefined>,
  keys: string[] = ["id", "item", "uuid"]
): boolean {
  const ids = new Set(identifiers.map(value => getString(value)).filter(Boolean));
  if (ids.size === 0) return false;

  return getCollectionContents(favorites).some(favorite => {
    if (typeof favorite === "string") return ids.has(favorite);
    const object = getObject(favorite);
    return keys.some(key => ids.has(getString(object?.[key])));
  });
}

export function buildSignedAdjustmentOptions(current: number, max: number | null, limit = 50): Dnd5eSignedAdjustmentOption[] {
  const positiveLimit = Math.trunc(max === null ? limit : Math.min(limit, Math.max(0, max - current)));
  const negativeLimit = Math.trunc(Math.min(limit, Math.max(0, current)));
  const values = Array.from({ length: positiveLimit + negativeLimit + 1 }, (_unused, index) => positiveLimit - index);
  return values.map(option => ({
    value: option,
    label: option > 0 ? `+${option}` : String(option),
    center: option === 0
  }));
}

export function titleCase(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}` : "";
}

export function toTitleCaseWords(value: string): string {
  return value
    .split(".")
    .filter(Boolean)
    .map(part => part.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
    .map(part => part.replace(/[-_]/g, " "))
    .map(part => titleCase(part))
    .join(" ");
}

export function getConfigLabel(labels: Dnd5eConfigLabelDictionary | undefined, key: string, fallback: string): string {
  const value = labels?.[key];
  if (typeof value === "string") return getString(value) || fallback;

  const labelObject = getObject(value);
  return getString(labelObject?.label) || getString(labelObject?.name) || fallback;
}

export function mapLabeledValueList(value: string, labels: Dnd5eConfigLabelDictionary | undefined): string {
  const parts = value.split(/([,;|]\s*)/);
  return parts
    .map(part => {
      if (!part) return part;
      if (/^[,;|]\s*$/.test(part)) return part;
      const trimmed = part.trim();
      if (!trimmed) return part;
      return mapLabeledValue(trimmed, labels);
    })
    .join("");
}

export function mapLabeledValue(value: string, labels: Dnd5eConfigLabelDictionary | undefined): string {
  const match = value.match(/^([!+\-]*)(.*)$/);
  const prefix = match?.[1] ?? "";
  const token = (match?.[2] ?? value).trim();
  if (!token) return value;
  const label = getConfigLabel(labels, token, token);
  return `${prefix}${label}`;
}

function toLinkIdentity(value: unknown): LinkIdentity {
  const object = getObject(value);
  return {
    uuid: getString(object?.uuid),
    id: getString(object?.id),
    name: getString(object?.name)
  };
}
