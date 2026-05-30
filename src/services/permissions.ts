/**
 * Foundry document modification actions relevant to mobile permission checks.
 */
export type FoundryPermissionAction = "create" | "update" | "delete";

/**
 * Foundry permission level names used by document permission APIs.
 */
export type FoundryPermissionLevelName = "NONE" | "LIMITED" | "OBSERVER" | "OWNER";

/**
 * Numeric Foundry permission levels used when only getUserLevel is available.
 */
export const FOUNDRY_PERMISSION_LEVELS = {
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3
} as const satisfies Record<FoundryPermissionLevelName, number>;
const FOUNDRY_PERMISSION_LEVEL_NAMES = ["NONE", "LIMITED", "OBSERVER", "OWNER"] as const satisfies readonly FoundryPermissionLevelName[];

/**
 * User object passed through to Foundry permission methods.
 */
export type FoundryUserLike = unknown;

/**
 * Minimal Foundry document shape needed for permission checks.
 */
export type PermissionCheckedDocument = {
  uuid?: string;
  parent?: PermissionCheckedDocument | null;
  testUserPermission?: (user: FoundryUserLike, level: FoundryPermissionLevelName) => boolean;
  canUserModify?: (user: FoundryUserLike, action: FoundryPermissionAction) => boolean;
  getUserLevel?: (user: FoundryUserLike) => number;
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
      .some(candidate => document.testUserPermission?.(user, candidate) === true);
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
    return document.canUserModify(user, "update") === true;
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
  const level = document.getUserLevel(user);
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
