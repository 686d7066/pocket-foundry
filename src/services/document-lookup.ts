import {
  canViewDocument,
  canViewJournalPage,
  getNormalizedDocumentPermissions,
  type FoundryUserLike,
  type NormalizedDocumentPermissions,
  type PermissionCheckedDocument
} from "./permissions.ts";
import { getFoundryRuntime } from "../core/foundry-globals.ts";

/**
 * User-facing document categories supported by the mobile shell.
 */
export type MobileDocumentType = "character" | "item" | "journal-entry" | "journal-page" | "unknown";

/**
 * Non-leaking reasons a document lookup can fail.
 */
export type UnavailableDocumentReason = "invalid-uuid" | "missing" | "hidden" | "lookup-error";

/**
 * Minimal Foundry document shape normalized by the lookup service.
 */
export type FoundryDocumentLike = PermissionCheckedDocument & {
  uuid?: string;
  _id?: string;
  id?: string;
  name?: string;
  type?: string;
  img?: string | null;
  documentName?: string;
  parent?: FoundryDocumentLike | null;
};

/**
 * Async and optional sync UUID lookup functions supplied by Foundry or tests.
 *
 * Foundry and fixture resolvers can return either null or undefined for missing
 * documents, so both states are accepted at this boundary.
 */
export type FoundryUuidResolver = {
  fromUuid: (uuid: string) => Promise<FoundryDocumentLike | null | undefined>;
  fromUuidSync?: (uuid: string) => FoundryDocumentLike | null | undefined;
};

/**
 * Runtime dependencies required by the document lookup service.
 */
export type DocumentLookupEnvironment = FoundryUuidResolver & {
  user: FoundryUserLike;
};

/**
 * Permission-safe document lookup result for visible documents.
 */
export type AvailableDocumentLookupResult = {
  available: true;
  uuid: string;
  id: string | null;
  name: string;
  documentType: MobileDocumentType;
  displayType: string;
  foundryDocumentName: string | null;
  foundryType: string | null;
  icon: string | null;
  parent: NormalizedParentDocument | null;
  permissions: NormalizedDocumentPermissions;
};

/**
 * Permission-safe document lookup result for hidden, missing, or invalid documents.
 */
export type UnavailableDocumentLookupResult = {
  available: false;
  uuid: string;
  reason: UnavailableDocumentReason;
  documentType: "unknown";
  displayType: "Document";
  permissions: NormalizedDocumentPermissions;
};

/**
 * Normalized visible parent document data.
 */
export type NormalizedParentDocument = {
  uuid: string;
  id: string | null;
  name: string;
  documentType: MobileDocumentType;
  displayType: string;
};

/**
 * Union result returned from document lookup operations.
 */
export type DocumentLookupResult = AvailableDocumentLookupResult | UnavailableDocumentLookupResult;

/**
 * Template-safe unavailable state that intentionally omits hidden document details.
 */
export type NonLeakingUnavailableState = {
  available: false;
  uuid: string;
  reason: UnavailableDocumentReason;
  title: "Unavailable document";
  description: "This document is no longer available or you do not have permission to view it.";
};

/**
 * Service for resolving Foundry UUIDs into template-safe normalized data.
 */
export type DocumentLookupService = {
  lookupByUuid: (uuid: string) => Promise<DocumentLookupResult>;
  lookupByUuidSync: (uuid: string) => DocumentLookupResult;
};

/**
 * Creates a document lookup service from Foundry UUID and user dependencies.
 */
export function createDocumentLookupService(environment: DocumentLookupEnvironment): DocumentLookupService {
  return {
    lookupByUuid: uuid => lookupByUuid(environment, uuid),
    lookupByUuidSync: uuid => lookupByUuidSync(environment, uuid)
  };
}

/**
 * Resolves a UUID asynchronously and normalizes the visible document.
 */
export async function lookupByUuid(environment: DocumentLookupEnvironment, uuid: string): Promise<DocumentLookupResult> {
  if (!isUsableUuid(uuid)) return createUnavailableDocumentLookupResult(uuid, "invalid-uuid");

  try {
    const document = await environment.fromUuid(uuid);
    return normalizeLookupDocument(uuid, document, environment.user);
  } catch {
    return createUnavailableDocumentLookupResult(uuid, "lookup-error");
  }
}

/**
 * Resolves a UUID synchronously when Foundry sync lookup is available.
 */
export function lookupByUuidSync(environment: DocumentLookupEnvironment, uuid: string): DocumentLookupResult {
  if (!isUsableUuid(uuid)) return createUnavailableDocumentLookupResult(uuid, "invalid-uuid");
  if (!environment.fromUuidSync) return createUnavailableDocumentLookupResult(uuid, "missing");

  try {
    const document = environment.fromUuidSync(uuid);
    return normalizeLookupDocument(uuid, document, environment.user);
  } catch {
    return createUnavailableDocumentLookupResult(uuid, "lookup-error");
  }
}

/**
 * Converts an unavailable lookup into a non-leaking template state.
 */
export function createUnavailableDocumentState(result: UnavailableDocumentLookupResult): NonLeakingUnavailableState {
  return {
    available: false,
    uuid: result.uuid,
    reason: result.reason,
    title: "Unavailable document",
    description: "This document is no longer available or you do not have permission to view it."
  };
}

/**
 * Maps a Foundry document to the mobile shell's supported document categories.
 */
export function getMobileDocumentType(document: FoundryDocumentLike | null | undefined): MobileDocumentType {
  switch (document?.documentName) {
    case "Actor":
      return "character";
    case "Item":
      return "item";
    case "JournalEntry":
      return "journal-entry";
    case "JournalEntryPage":
      return "journal-page";
    default:
      return inferDocumentTypeFromUuid(document?.uuid);
  }
}

/**
 * Returns the user-facing label for a mobile document category.
 */
export function getDocumentDisplayType(documentType: MobileDocumentType): string {
  switch (documentType) {
    case "character":
      return "Character";
    case "item":
      return "Item";
    case "journal-entry":
      return "Journal Entry";
    case "journal-page":
      return "Journal Page";
    case "unknown":
      return "Document";
  }
}

function normalizeLookupDocument(uuid: string, document: FoundryDocumentLike | null | undefined, user: FoundryUserLike): DocumentLookupResult {
  if (!document) return createUnavailableDocumentLookupResult(uuid, "missing");

  const documentType = getMobileDocumentType(document);
  const canView = documentType === "journal-page" ? canViewJournalPage(document, user) : canViewDocument(document, user);
  if (!canView) return createUnavailableDocumentLookupResult(uuid, "hidden");

  const permissions = getNormalizedDocumentPermissions(document, user, { journalPage: documentType === "journal-page" });

  return {
    available: true,
    uuid: document.uuid ?? uuid,
    id: document.id ?? document._id ?? null,
    name: document.name ?? getDocumentDisplayType(documentType),
    documentType,
    displayType: getDocumentDisplayType(documentType),
    foundryDocumentName: document.documentName ?? null,
    foundryType: document.type ?? null,
    icon: document.img ?? null,
    parent: normalizeVisibleParent(document.parent, user),
    permissions
  };
}

function normalizeVisibleParent(parent: FoundryDocumentLike | null | undefined, user: FoundryUserLike): NormalizedParentDocument | null {
  if (!parent || !canViewDocument(parent, user)) return null;

  const documentType = getMobileDocumentType(parent);
  return {
    uuid: parent.uuid ?? "",
    id: parent.id ?? null,
    name: parent.name ?? getDocumentDisplayType(documentType),
    documentType,
    displayType: getDocumentDisplayType(documentType)
  };
}

function createUnavailableDocumentLookupResult(uuid: string, reason: UnavailableDocumentReason): UnavailableDocumentLookupResult {
  return {
    available: false,
    uuid,
    reason,
    documentType: "unknown",
    displayType: "Document",
    permissions: {
      canView: false,
      canUpdate: false,
      userLevel: null
    }
  };
}

function isUsableUuid(uuid: string): boolean {
  return uuid.trim().length > 0;
}

function inferDocumentTypeFromUuid(uuid: string | undefined): MobileDocumentType {
  if (!uuid) return "unknown";

  const parsedType = getParsedUuidDocumentType(uuid);
  if (parsedType) return getMobileDocumentTypeFromFoundryName(parsedType);

  const compendiumType = getCompendiumUuidDocumentType(uuid);
  if (compendiumType) return getMobileDocumentTypeFromFoundryName(compendiumType);

  if (uuid.startsWith("Actor.")) return "character";
  if (uuid.startsWith("Item.")) return "item";
  if (uuid.includes("JournalEntryPage.") || uuid.startsWith("JournalEntryPage.")) return "journal-page";
  if (uuid.startsWith("JournalEntry.") || uuid.startsWith("Journal.")) return "journal-entry";
  return "unknown";
}

function getCompendiumUuidDocumentType(uuid: string): string | null {
  if (!uuid.startsWith("Compendium.")) return null;

  const parts = uuid.split(".");
  return parts[3] ?? null;
}

function getParsedUuidDocumentType(uuid: string): string | null {
  try {
    const parsed = getFoundryRuntime().foundry?.utils?.parseUuid?.(uuid);
    return parsed?.type ?? parsed?.documentType ?? null;
  } catch {
    return null;
  }
}

function getMobileDocumentTypeFromFoundryName(documentName: string): MobileDocumentType {
  switch (documentName) {
    case "Actor":
      return "character";
    case "Item":
      return "item";
    case "JournalEntry":
      return "journal-entry";
    case "JournalEntryPage":
      return "journal-page";
    default:
      return "unknown";
  }
}
