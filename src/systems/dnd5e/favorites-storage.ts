import { getObject } from "../../core/utils.ts";
import {
  canToggleFavorites,
  getFavoriteEntries,
  hasFavoriteEntryReference,
  setFavoriteEntry,
  type FavoriteEntry,
  type FavoriteActorReference
} from "../../services/favorites.ts";

export type Dnd5eFavoriteEntry = FavoriteEntry;

export type Dnd5eFavoriteActorReference = FavoriteActorReference & {
  system?: Record<string, unknown>;
};

/**
 * Reads dnd5e favorite entries through the generic favorites service.
 *
 * Legacy actor system favorites are used only as a fallback when no server-side
 * setting exists for the current user/system/actor scope.
 */
export function getDnd5eFavoriteEntries(actor: Dnd5eFavoriteActorReference): Dnd5eFavoriteEntry[] {
  return getFavoriteEntries(actor, { fallbackEntries: getObject(actor.system)?.favorites });
}

/**
 * Checks whether a dnd5e favorite references any of the supplied identifiers.
 */
export function hasDnd5eFavoriteReference(
  actor: Dnd5eFavoriteActorReference | null | undefined,
  identifiers: Array<string | undefined>,
  keys: string[] = ["id", "item", "uuid"]
): boolean {
  if (!actor) return false;
  return hasFavoriteEntryReference(getDnd5eFavoriteEntries(actor), identifiers, keys);
}

/**
 * Adds or removes a dnd5e favorite entry through the generic favorites service.
 */
export async function setDnd5eFavoriteEntry(
  actor: Dnd5eFavoriteActorReference | null | undefined,
  type: string,
  favoriteId: string,
  favorite: boolean,
  options: { legacyAddTarget?: unknown; legacyRemoveTarget?: unknown } = {}
): Promise<boolean> {
  return setFavoriteEntry(actor, type, favoriteId, favorite, {
    fallbackEntries: actor ? getObject(actor.system)?.favorites : undefined,
    legacyAddTarget: options.legacyAddTarget,
    legacyRemoveTarget: options.legacyRemoveTarget,
    legacyToggle: actor ? (nextFavorite, target) => setLegacyDnd5eFavoriteEntry(actor, nextFavorite, target) : undefined
  });
}

/**
 * Checks whether favorites can be toggled in Foundry settings or legacy dnd5e fixtures.
 */
export function canToggleDnd5eFavorites(actor: Dnd5eFavoriteActorReference | null | undefined): boolean {
  if (!actor) return false;
  return canToggleFavorites({ legacyAvailable: hasLegacyFavoriteApi(actor) });
}

async function setLegacyDnd5eFavoriteEntry(
  actor: Dnd5eFavoriteActorReference,
  favorite: boolean,
  target: unknown
): Promise<boolean> {
  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return false;

  await (action as (favoriteTarget: unknown) => Promise<unknown>).call(system, target);
  return true;
}

function hasLegacyFavoriteApi(actor: Dnd5eFavoriteActorReference): boolean {
  const system = getObject(actor.system);
  return typeof system?.addFavorite === "function" || typeof system?.removeFavorite === "function";
}
