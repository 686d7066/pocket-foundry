import { getFoundryRuntime } from "../core/foundry-globals.ts";
import { getObject, getString } from "../core/utils.ts";
import { enrichHtml } from "./rich-text-enrichment.ts";
import { canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "./permissions.ts";

/**
 * Minimal resolved item document shape used by mobile search detail routes.
 */
export type ItemDetailDocumentLike = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  name?: string;
  documentName?: string;
  type?: string;
  img?: string | null;
  pack?: string | null;
  parent?: PermissionCheckedDocument | null;
  system?: unknown;
};

/**
 * Non-leaking unavailable state for item detail routes.
 */
export type ItemDetailUnavailableViewModel = {
  available: false;
  title: "Unavailable document";
  description: "This document is no longer available or you do not have permission to view it.";
};

/**
 * Read-only mobile-native detail model for world and compendium Item documents.
 */
export type ItemDetailAvailableViewModel = {
  available: true;
  uuid: string;
  name: string;
  typeLabel: string;
  source: string | null;
  icon: string | null;
  iconText: string;
  descriptionHtml: string;
  chips: Array<{ id: string; label: string; value: string }>;
  fields: Array<{ label: string; value: string }>;
};

export type ItemDetailViewModel = ItemDetailAvailableViewModel | ItemDetailUnavailableViewModel;

export type ItemDetailEnvironment = {
  user: FoundryUserLike | null | undefined;
  fromUuid: ((uuid: string) => Promise<unknown>) | undefined;
  enrichHTML?: (content: string, options?: Record<string, unknown>) => Promise<string> | string;
};

/**
 * Resolves and prepares a mobile-native read-only item detail model.
 */
export async function buildItemDetailViewModel(
  documentUuid: string,
  options: { source?: string } = {},
  environment: ItemDetailEnvironment = createFoundryItemDetailEnvironment()
): Promise<ItemDetailViewModel> {
  if (!documentUuid.trim() || !environment.fromUuid || !environment.user) return createUnavailableItemDetailViewModel();

  let document: ItemDetailDocumentLike | null;
  try {
    document = normalizeItemDocument(await environment.fromUuid(documentUuid));
  } catch {
    return createUnavailableItemDetailViewModel();
  }

  if (!document || getItemDocumentType(document) !== "Item" || !canViewItemDetailDocument(document, environment.user)) {
    return createUnavailableItemDetailViewModel();
  }

  const system = getObject(document.system);
  const description = getItemDescription(system);
  const descriptionHtml = description ? await enrichItemDescription(description, document, environment) : "";
  const source = options.source ?? getString(document.pack) ?? getString(getPath(system, ["source", "book"])) ?? null;

  return {
    available: true,
    uuid: document.uuid ?? documentUuid,
    name: getString(document.name) || "Item",
    typeLabel: getItemTypeLabel(document.type),
    source,
    icon: document.img ?? null,
    iconText: getItemInitials(document.name),
    descriptionHtml,
    chips: buildItemChips(document, source),
    fields: buildItemFields(system)
  };
}

function canViewItemDetailDocument(document: ItemDetailDocumentLike, user: FoundryUserLike): boolean {
  if (canViewDocument(document, user)) return true;
  return Boolean(document.parent && canViewDocument(document.parent, user));
}

function createFoundryItemDetailEnvironment(): ItemDetailEnvironment {
  const runtime = getFoundryRuntime();
  return {
    user: runtime.game?.user,
    fromUuid: runtime.foundry?.utils?.fromUuid,
    enrichHTML: runtime.TextEditor?.enrichHTML?.bind(runtime.TextEditor)
  };
}

function createUnavailableItemDetailViewModel(): ItemDetailUnavailableViewModel {
  return {
    available: false,
    title: "Unavailable document",
    description: "This document is no longer available or you do not have permission to view it."
  };
}

function normalizeItemDocument(value: unknown): ItemDetailDocumentLike | null {
  const object = getObject(value);
  return object ? (object as ItemDetailDocumentLike) : null;
}

function getItemDocumentType(document: ItemDetailDocumentLike): string {
  return getString(document.documentName) || inferDocumentNameFromUuid(document.uuid);
}

function inferDocumentNameFromUuid(uuid: string | undefined): string {
  if (!uuid) return "";
  if (uuid.startsWith("Item.") || uuid.includes(".Item.")) return "Item";
  return "";
}

async function enrichItemDescription(
  description: string,
  document: ItemDetailDocumentLike,
  environment: ItemDetailEnvironment
): Promise<string> {
  return enrichHtml(description, {
    enrichHtml: environment.enrichHTML,
    relativeTo: document,
    secrets: false
  });
}

function getItemDescription(system: Record<string, unknown> | null): string {
  return (
    getString(getPath(system, ["description", "value"])) ||
    getString(getPath(system, ["description", "chat"])) ||
    getString(getPath(system, ["description"]))
  );
}

function buildItemChips(document: ItemDetailDocumentLike, source: string | null): Array<{ id: string; label: string; value: string }> {
  const chips = [
    { id: "type", label: "Type", value: getItemTypeLabel(document.type) },
    source ? { id: "source", label: isCompendiumUuid(document.uuid) ? "Pack" : "Source", value: source } : null
  ];

  return chips.filter((chip): chip is { id: string; label: string; value: string } => Boolean(chip?.value));
}

function buildItemFields(system: Record<string, unknown> | null): Array<{ label: string; value: string }> {
  const fields = [
    { label: "Level", value: getSpellLevelLabel(getPath(system, ["level"])) },
    { label: "School", value: getString(getPath(system, ["school"])) },
    { label: "Activation", value: getActivityLabel(getPath(system, ["activation"])) },
    { label: "Range", value: getActivityLabel(getPath(system, ["range"])) },
    { label: "Target", value: getActivityLabel(getPath(system, ["target"])) },
    { label: "Duration", value: getActivityLabel(getPath(system, ["duration"])) },
    { label: "Uses", value: getUsesLabel(getPath(system, ["uses"])) },
    { label: "Quantity", value: getDisplayValue(getPath(system, ["quantity"])) },
    { label: "Weight", value: getDisplayValue(getPath(system, ["weight"])) },
    { label: "Price", value: getPriceLabel(getPath(system, ["price"])) }
  ];

  return fields.filter(field => Boolean(field.value));
}

function getSpellLevelLabel(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value === 0 ? "Cantrip" : String(value);
}

function getActivityLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return getString(value);

  const labels = [
    getString(object.label),
    getDisplayValue(object.value),
    getString(object.units),
    getString(object.type)
  ].filter(Boolean);

  return labels.join(" ");
}

function getUsesLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return "";

  const spent = getString(object.spent);
  const max = getString(object.max);
  if (spent || max) return `${spent || "0"} / ${max || "-"}`;
  return getDisplayValue(object.value);
}

function getPriceLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return getString(value);

  const denomination = getString(object.denomination);
  const amount = getDisplayValue(object.value);
  return [amount, denomination].filter(Boolean).join(" ");
}

function getDisplayValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return getString(value);
}

function getItemTypeLabel(type: string | undefined): string {
  const value = getString(type);
  if (!value) return "Item";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function getItemInitials(name: string | undefined): string {
  const words = getString(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return words.map(word => word[0]?.toLocaleUpperCase() ?? "").join("") || "I";
}

function isCompendiumUuid(uuid: string | undefined): boolean {
  return Boolean(uuid?.startsWith("Compendium."));
}

function getPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;

  for (const part of path) {
    const object = getObject(current);
    if (!object || !(part in object)) return undefined;
    current = object[part];
  }

  return current;
}
