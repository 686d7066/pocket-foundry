import { FAVORITES_SETTING } from "../core/settings.ts";
import { getFoundryRuntime } from "../core/foundry-globals.ts";
import { getCollectionContents, getNumber, getObject, getString } from "../core/utils.ts";
import { createFoundrySystemUserSettingStorage } from "./foundry-settings-storage.ts";

export type FavoriteEntry = {
  id: string;
  type: string;
  sort: number;
};

export type FavoriteActorReference = {
  uuid?: string;
  id?: string;
};

export type FavoriteBasicRowViewModel = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  icon: string | null;
  iconText: string;
  favorite: boolean;
  canToggleFavorite: boolean;
  addAction: string;
  removeAction: string;
  addLabel: "Add to Favorites";
  removeLabel: "Remove from Favorites";
};

export type FavoriteGroupViewModel = {
  id: string;
  label: string;
  kind: string;
  partial?: string;
  rows?: unknown[];
  empty: boolean;
  [key: string]: unknown;
};

export type FavoritesViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  helpText: string;
  emptyTitle: string;
  emptyBody: string;
  groups: FavoriteGroupViewModel[];
  empty: boolean;
};

export type UnavailableFavoritesViewModel = {
  unavailable: true;
  title: "Favorites Unavailable";
  body: "These favorites are not available to the current user.";
};

export type FavoritesModel = FavoritesViewModel | UnavailableFavoritesViewModel;

export type FavoriteStorageOptions = {
  fallbackEntries?: unknown;
};

export type SetFavoriteEntryOptions = FavoriteStorageOptions & {
  legacyAddTarget?: unknown;
  legacyRemoveTarget?: unknown;
  legacyToggle?: (favorite: boolean, target: unknown) => Promise<unknown> | unknown;
};

const SORT_DENSITY = 100000;

const favoritesByActorCodec = {
  parse: parseFavoritesByActor,
  sanitize: normalizeFavoritesByActor
};

/**
 * Reads persisted favorite entries for one actor in the current Foundry system/user scope.
 */
export function getFavoriteEntries(actor: FavoriteActorReference, options: FavoriteStorageOptions = {}): FavoriteEntry[] {
  const actorUuid = getActorUuid(actor);
  if (!actorUuid) return normalizeFavoriteEntries(getCollectionContents(options.fallbackEntries));

  const entries = createFavoritesByActorStorage().read()[actorUuid];
  return entries ?? normalizeFavoriteEntries(getCollectionContents(options.fallbackEntries));
}

/**
 * Checks whether a favorite entry references any supplied identifiers.
 */
export function hasFavoriteEntryReference(
  entries: FavoriteEntry[],
  identifiers: Array<string | undefined>,
  keys: string[] = ["id", "item", "uuid"]
): boolean {
  const ids = new Set(identifiers.map(value => getString(value)).filter(Boolean));
  if (ids.size === 0) return false;

  return entries.some(favorite => keys.some(key => {
    const candidate = getString((favorite as Record<string, unknown>)[key]);
    return Boolean(candidate) && [...ids].some(id => favoriteIdsMatch(candidate, id));
  }));
}

/**
 * Adds or removes a favorite entry in server-side Foundry settings for the current user.
 */
export async function setFavoriteEntry(
  actor: FavoriteActorReference | null | undefined,
  type: string,
  favoriteId: string,
  favorite: boolean,
  options: SetFavoriteEntryOptions = {}
): Promise<boolean> {
  const actorUuid = actor ? getActorUuid(actor) : "";
  const normalizedId = favoriteId.trim();
  const normalizedType = type.trim() || inferFavoriteType(normalizedId);
  if (!actor || !actorUuid || !normalizedId) return false;
  if (!hasFoundryFavoriteSettingScope()) return setLegacyFavoriteEntry(normalizedType, normalizedId, favorite, options);

  const storage = createFavoritesByActorStorage();
  const byActor = storage.read();
  const entries = byActor[actorUuid] ?? normalizeFavoriteEntries(getCollectionContents(options.fallbackEntries));
  const remaining = entries.filter(entry => !favoriteIdsMatch(entry.id, normalizedId));

  byActor[actorUuid] = favorite
    ? [
        ...remaining,
        {
          id: normalizedId,
          type: normalizedType,
          sort: entries.find(entry => favoriteIdsMatch(entry.id, normalizedId))?.sort ?? getNextSort(entries)
        }
      ].sort((left, right) => left.sort - right.sort)
    : remaining;

  await storage.write(byActor);
  return true;
}

/**
 * Returns whether favorite toggling is available through Foundry settings or a legacy callback.
 */
export function canToggleFavorites(options: { legacyAvailable?: boolean } = {}): boolean {
  return hasFoundryFavoriteSettingScope() || options.legacyAvailable === true;
}

/**
 * Compares favorite identifiers while allowing relative and absolute UUID forms.
 */
export function favoriteIdsMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const normalizedLeft = left.replace(/^\./, "");
  const normalizedRight = right.replace(/^\./, "");
  return normalizedLeft === normalizedRight || normalizedLeft.endsWith(`.${normalizedRight}`) || normalizedRight.endsWith(`.${normalizedLeft}`);
}

function createFavoritesByActorStorage() {
  return createFoundrySystemUserSettingStorage<Record<string, FavoriteEntry[]>>({
    settingKey: FAVORITES_SETTING,
    codec: favoritesByActorCodec,
    defaultValue: () => ({})
  });
}

function hasFoundryFavoriteSettingScope(): boolean {
  const runtime = getFoundryRuntime();
  return Boolean(runtime.game?.settings && runtime.game.system?.id?.trim() && runtime.game.user?.id?.trim());
}

async function setLegacyFavoriteEntry(
  type: string,
  favoriteId: string,
  favorite: boolean,
  options: SetFavoriteEntryOptions
): Promise<boolean> {
  if (typeof options.legacyToggle !== "function") return false;

  const target = favorite
    ? options.legacyAddTarget ?? { type, id: favoriteId }
    : options.legacyRemoveTarget ?? favoriteId;
  const result = await options.legacyToggle(favorite, target);
  return result !== false;
}

function getActorUuid(actor: FavoriteActorReference): string {
  return actor.uuid?.trim() || (actor.id ? `Actor.${actor.id}` : "");
}

function parseFavoritesByActor(value: unknown): Record<string, FavoriteEntry[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return normalizeFavoritesByActor(value as Record<string, unknown>);
}

function normalizeFavoritesByActor(value: Record<string, unknown>): Record<string, FavoriteEntry[]> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([actorUuid, entries]) => [actorUuid.trim(), normalizeFavoriteEntries(getCollectionContents(entries))] as const)
      .filter(([actorUuid]) => actorUuid)
  );
}

function normalizeFavoriteEntries(entries: unknown[]): FavoriteEntry[] {
  return entries
    .map((entry, index) => normalizeFavoriteEntry(entry, index))
    .filter((entry): entry is FavoriteEntry => entry !== null)
    .sort((left, right) => left.sort - right.sort);
}

function normalizeFavoriteEntry(entry: unknown, index: number): FavoriteEntry | null {
  if (typeof entry === "string") return { id: entry, type: inferFavoriteType(entry), sort: index * SORT_DENSITY };
  const object = getObject(entry);
  const id = getString(object?.id) || getString(object?.item) || getString(object?.uuid);
  const type = getString(object?.type) || inferFavoriteType(id);
  if (!id || !type) return null;
  return { id, type, sort: getNumber(object?.sort) ?? index * SORT_DENSITY };
}

function getNextSort(entries: FavoriteEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.sort), 0) + SORT_DENSITY;
}

function inferFavoriteType(id: string): string {
  if (id.startsWith("resources.")) return "resource";
  if (id.includes("ActiveEffect.")) return "effect";
  if (id.includes("Activity.")) return "activity";
  return id.includes(".") ? "item" : "";
}
