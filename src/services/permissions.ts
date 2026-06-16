import type { foundry } from "fvtt-types";

/**
 * Foundry permission level names used by document permission APIs.
 */
export type FoundryPermissionLevelName = Exclude<keyof typeof foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS, "INHERIT">;
type FoundryPermissionUser = Parameters<foundry.abstract.Document["testUserPermission"]>[0];

export type FoundryDocumentIdentity = {
  documentName?: string;
  id?: Exclude<foundry.abstract.Document["id"], null>;
  uuid?: Exclude<foundry.abstract.Document["uuid"], null>;
};

export type FoundryDocumentMutationApi = {
  delete?: (operation?: Parameters<foundry.abstract.Document["delete"]>[0]) => Promise<unknown>;
  getFlag?: (...args: Parameters<foundry.abstract.Document["getFlag"]>) => unknown;
  update?: (data: Record<string, unknown>, operation?: Parameters<foundry.abstract.Document["update"]>[1]) => Promise<unknown>;
  updateEmbeddedDocuments?: (
    embeddedName: "Item",
    updates: Array<Record<string, unknown>>,
    operation?: Parameters<foundry.abstract.Document["updateEmbeddedDocuments"]>[2]
  ) => Promise<unknown>;
};

/**
 * Numeric Foundry permission levels used when only getUserLevel is available.
 */
export const FOUNDRY_PERMISSION_LEVELS = {
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3
} as const satisfies Record<FoundryPermissionLevelName, foundry.CONST.DocumentOwnershipNumber>;
const FOUNDRY_PERMISSION_LEVEL_NAMES = ["NONE", "LIMITED", "OBSERVER", "OWNER"] as const satisfies readonly FoundryPermissionLevelName[];

/**
 * User object passed through to Foundry permission methods.
 */
export type FoundryUserLike = FoundryPermissionUser | Record<string, unknown> | null | undefined;

/**
 * Minimal Foundry document shape needed for permission checks.
 */
export type PermissionCheckedDocument = FoundryDocumentIdentity & {
  parent?: PermissionCheckedDocument | null;
  testUserPermission?: (user: FoundryUserLike, level: foundry.CONST.DocumentOwnershipLevel) => boolean;
  canUserModify?: (user: FoundryUserLike, action: Parameters<foundry.abstract.Document["canUserModify"]>[1], data?: object) => boolean;
  getUserLevel?: (user?: FoundryUserLike) => number;
};

/**
 * Normalized view/update permission summary for a Foundry document.
 */
export type NormalizedDocumentPermissions = {
  canView: boolean;
  canUpdate: boolean;
  userLevel: number | null;
};

/**
 * Checks whether a user has at least the requested Foundry permission level.
 */
export function hasDocumentPermission(
  document: PermissionCheckedDocument | null | undefined,
  user: FoundryUserLike,
  level: FoundryPermissionLevelName
): boolean {
  if (!document) return false;

  if (typeof document.testUserPermission === "function") {
    const minimumLevel = FOUNDRY_PERMISSION_LEVELS[level];
    return FOUNDRY_PERMISSION_LEVEL_NAMES
      .filter(candidate => FOUNDRY_PERMISSION_LEVELS[candidate] >= minimumLevel)
      .some(candidate => document.testUserPermission?.(user as FoundryPermissionUser, candidate) === true);
  }

  const userLevel = getDocumentUserLevel(document, user);
  if (userLevel === null && isCompendiumDocument(document)) return true;
  return userLevel !== null && userLevel >= FOUNDRY_PERMISSION_LEVELS[level];
}

/**
 * Checks whether a user can observe a document.
 */
export function canViewDocument(document: PermissionCheckedDocument | null | undefined, user: FoundryUserLike): boolean {
  return hasDocumentPermission(document, user, "OBSERVER");
}

/**
 * Checks whether a user has at least Foundry's limited visibility for a document.
 */
export function canViewLimitedDocument(document: PermissionCheckedDocument | null | undefined, user: FoundryUserLike): boolean {
  return hasDocumentPermission(document, user, "LIMITED");
}

/**
 * Checks whether a user can update a document.
 */
export function canUpdateDocument(document: PermissionCheckedDocument | null | undefined, user: FoundryUserLike): boolean {
  if (!document) return false;

  if (typeof document.canUserModify === "function") {
    return document.canUserModify(user as FoundryPermissionUser, "update") === true;
  }

  const level = getDocumentUserLevel(document, user);
  return level !== null && level >= FOUNDRY_PERMISSION_LEVELS.OWNER;
}

/**
 * Checks page visibility while also respecting the parent journal entry.
 */
export function canViewJournalPage(page: PermissionCheckedDocument | null | undefined, user: FoundryUserLike): boolean {
  if (!page) return false;
  if (page.parent && !canViewDocument(page.parent, user)) return false;
  return canViewDocument(page, user);
}

/**
 * Reads a user's numeric Foundry permission level from a document.
 */
export function getDocumentUserLevel(document: PermissionCheckedDocument | null | undefined, user: FoundryUserLike): number | null {
  if (!document || typeof document.getUserLevel !== "function") return null;
  const level = document.getUserLevel(user as FoundryPermissionUser);
  return Number.isFinite(level) ? level : null;
}

function isCompendiumDocument(document: PermissionCheckedDocument): boolean {
  return typeof document.uuid === "string" && document.uuid.startsWith("Compendium.");
}

/**
 * Builds a consistent permission summary for templates and route guards.
 */
export function getNormalizedDocumentPermissions(
  document: PermissionCheckedDocument,
  user: FoundryUserLike,
  options: { journalPage?: boolean } = {}
): NormalizedDocumentPermissions {
  return {
    canView: options.journalPage ? canViewJournalPage(document, user) : canViewDocument(document, user),
    canUpdate: canUpdateDocument(document, user),
    userLevel: getDocumentUserLevel(document, user)
  };
}
