import type { foundry } from "fvtt-types";
import { getFoundryTextEditor, getFoundryRuntime } from "../core/foundry-globals.ts";
import { localize } from "../core/localization.ts";
import { getInitials, getObject, getString } from "../core/utils.ts";
import type {
  CharacterSheetItemDetailCapability,
  CharacterSheetItemDetailDocument,
  CharacterSheetItemDetailPresentation
} from "../systems/character-sheet-adapter.ts";
import { enrichHtml } from "./rich-text-enrichment.ts";
import { canViewDocument, type FoundryUserLike } from "./permissions.ts";

/**
 * Minimal resolved item document shape used by mobile search detail routes.
 */
export type ItemDetailDocumentLike = CharacterSheetItemDetailDocument;

/**
 * Non-leaking unavailable state for item detail routes.
 */
export type ItemDetailUnavailableViewModel = {
  available: false;
  title: string;
  description: string;
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
  fromUuid: ((uuid: Parameters<typeof foundry.utils.fromUuid>[0]) => Promise<unknown>) | undefined;
  enrichHTML?: typeof foundry.applications.ux.TextEditor.enrichHTML;
};

/**
 * Resolves and prepares a mobile-native read-only item detail model.
 */
export async function buildItemDetailViewModel(
  documentUuid: string,
  options: { source?: string; presentation?: CharacterSheetItemDetailCapability | null } = {},
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

  const presentation = options.presentation?.buildPresentation({ document, source: options.source })
    ?? buildIdentityItemDetailPresentation(document, options.source);
  const descriptionHtml = presentation.description
    ? await enrichItemDescription(presentation.description, document, environment)
    : "";

  return {
    available: true,
    uuid: document.uuid ?? documentUuid,
    name: getString(document.name) || localize("POCKETFOUNDRY.Document.Item", "Item"),
    typeLabel: presentation.typeLabel,
    source: presentation.source,
    icon: document.img ?? null,
    iconText: getInitials(document.name ?? "", "I"),
    descriptionHtml,
    chips: presentation.chips,
    fields: presentation.fields
  };
}

function canViewItemDetailDocument(document: ItemDetailDocumentLike, user: FoundryUserLike): boolean {
  if (canViewDocument(document, user)) return true;
  return Boolean(document.parent && canViewDocument(document.parent, user));
}

function createFoundryItemDetailEnvironment(): ItemDetailEnvironment {
  const runtime = getFoundryRuntime();
  const textEditor = getFoundryTextEditor();
  return {
    user: runtime.game?.user,
    fromUuid: runtime.foundry?.utils?.fromUuid,
    enrichHTML: textEditor?.enrichHTML?.bind(textEditor)
  };
}

function createUnavailableItemDetailViewModel(): ItemDetailUnavailableViewModel {
  return {
    available: false,
    title: localize("POCKETFOUNDRY.Document.Unavailable.Title", "Unavailable document"),
    description: localize("POCKETFOUNDRY.Document.Unavailable.Body", "This document is no longer available or you do not have permission to view it.")
  };
}

function normalizeItemDocument(value: unknown): ItemDetailDocumentLike | null {
  const object = getObject(value);
  return object ? (object as ItemDetailDocumentLike) : null;
}

function getItemDocumentType(document: ItemDetailDocumentLike): string {
  return getString(document.documentName) || inferDocumentNameFromUuid(document.uuid);
}

function inferDocumentNameFromUuid(uuid: string | null | undefined): string {
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

/** Builds the neutral identity presentation used when an adapter has no item capability. */
function buildIdentityItemDetailPresentation(
  document: ItemDetailDocumentLike,
  source: string | undefined
): CharacterSheetItemDetailPresentation {
  const resolvedSource = source ?? document.pack ?? null;
  const typeLabel = getDocumentTypeLabel(document.type);
  return {
    description: "",
    typeLabel,
    source: resolvedSource,
    chips: [
      { id: "type", label: localize("POCKETFOUNDRY.Table.Type", "Type"), value: typeLabel },
      resolvedSource
        ? {
            id: "source",
            label: document.uuid?.startsWith("Compendium.")
              ? localize("POCKETFOUNDRY.ItemDetail.Pack", "Pack")
              : localize("POCKETFOUNDRY.Table.Source", "Source"),
            value: resolvedSource
          }
        : null
    ].filter((chip): chip is { id: string; label: string; value: string } => Boolean(chip?.value)),
    fields: []
  };
}

/** Formats a generic document type without interpreting system data. */
function getDocumentTypeLabel(type: string | undefined): string {
  const value = getString(type);
  if (!value) return localize("POCKETFOUNDRY.Document.Item", "Item");
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
