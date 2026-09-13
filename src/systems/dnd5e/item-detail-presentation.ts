import { localize, localizeSystemKey } from "../../core/localization.ts";
import { getObject, getString } from "../../core/utils.ts";
import type {
  CharacterSheetItemDetailDocument,
  CharacterSheetItemDetailPresentation
} from "../character-sheet-adapter.ts";

/**
 * Builds the dnd5e-specific item fields used by the shared read-only detail view.
 */
export function buildDnd5eItemDetailPresentation(options: {
  document: CharacterSheetItemDetailDocument;
  source?: string;
}): CharacterSheetItemDetailPresentation {
  const { document } = options;
  const system = getObject(document.system);
  const source = options.source ?? getString(document.pack) ?? getString(getPath(system, ["source", "book"])) ?? null;
  const typeLabel = getItemTypeLabel(document.type);
  const chips = [
    { id: "type", label: localizeSystemKey("DND5E.Type", "Type"), value: typeLabel },
    source
      ? {
          id: "source",
          label: isCompendiumUuid(document.uuid) ? localize("POCKETFOUNDRY.ItemDetail.Pack", "Pack") : localizeSystemKey("DND5E.SOURCE.FIELDS.source.label", "Source"),
          value: source
        }
      : null
  ].filter((chip): chip is { id: string; label: string; value: string } => Boolean(chip?.value));

  return {
    description: getItemDescription(system),
    typeLabel,
    source,
    chips,
    fields: buildItemFields(system)
  };
}

/** Reads the preferred visible dnd5e description field. */
function getItemDescription(system: Record<string, unknown> | null): string {
  return getString(getPath(system, ["description", "value"]))
    || getString(getPath(system, ["description", "chat"]))
    || getString(getPath(system, ["description"]));
}

/** Builds the ordered facts shown for dnd5e items. */
function buildItemFields(system: Record<string, unknown> | null): Array<{ label: string; value: string }> {
  return [
    { label: localizeSystemKey("DND5E.Level", "Level"), value: getSpellLevelLabel(getPath(system, ["level"])) },
    { label: localizeSystemKey("DND5E.School", "School"), value: getString(getPath(system, ["school"])) },
    { label: localizeSystemKey("DND5E.ItemActivation", "Activation"), value: getActivityLabel(getPath(system, ["activation"])) },
    { label: localizeSystemKey("DND5E.Range", "Range"), value: getActivityLabel(getPath(system, ["range"])) },
    { label: localizeSystemKey("DND5E.Target", "Target"), value: getActivityLabel(getPath(system, ["target"])) },
    { label: localizeSystemKey("DND5E.Duration", "Duration"), value: getActivityLabel(getPath(system, ["duration"])) },
    { label: localizeSystemKey("DND5E.Uses", "Uses"), value: getUsesLabel(getPath(system, ["uses"])) },
    { label: localizeSystemKey("DND5E.Quantity", "Quantity"), value: getDisplayValue(getPath(system, ["quantity"])) },
    { label: localizeSystemKey("DND5E.Weight", "Weight"), value: getDisplayValue(getPath(system, ["weight"])) },
    { label: localizeSystemKey("DND5E.Price", "Price"), value: getPriceLabel(getPath(system, ["price"])) }
  ].filter(field => Boolean(field.value));
}

/** Formats a dnd5e spell level value. */
function getSpellLevelLabel(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value === 0 ? localizeSystemKey("DND5E.SpellCantrip", "Cantrip") : String(value);
}

/** Formats a structured dnd5e activity value. */
function getActivityLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return getString(value);
  return [getString(object.label), getDisplayValue(object.value), getString(object.units), getString(object.type)].filter(Boolean).join(" ");
}

/** Formats a dnd5e uses structure. */
function getUsesLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return "";
  const spent = getString(object.spent);
  const max = getString(object.max);
  return spent || max ? `${spent || "0"} / ${max || "-"}` : getDisplayValue(object.value);
}

/** Formats a dnd5e price structure. */
function getPriceLabel(value: unknown): string {
  const object = getObject(value);
  if (!object) return getString(value);
  return [getDisplayValue(object.value), getString(object.denomination)].filter(Boolean).join(" ");
}

/** Formats primitive item field values for display. */
function getDisplayValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? localize("POCKETFOUNDRY.Common.Yes", "Yes") : localize("POCKETFOUNDRY.Common.No", "No");
  return getString(value);
}

/** Formats the document item type as a readable label. */
function getItemTypeLabel(type: string | undefined): string {
  const value = getString(type);
  if (!value) return localize("POCKETFOUNDRY.Document.Item", "Item");
  return value.split(/[-_\s]+/).filter(Boolean).map(part => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

/** Returns whether the item UUID belongs to a compendium. */
function isCompendiumUuid(uuid: string | undefined): boolean {
  return Boolean(uuid?.startsWith("Compendium."));
}

/** Safely reads a nested system data path. */
function getPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const part of path) {
    const object = getObject(current);
    if (!object || !(part in object)) return undefined;
    current = object[part];
  }
  return current;
}
