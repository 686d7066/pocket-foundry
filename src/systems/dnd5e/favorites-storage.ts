import { FAVORITES_SETTING } from "../../core/settings.ts";
import { getCollectionContents, getNumber, getObject, getString } from "../../core/utils.ts";
import { getFoundryRuntime } from "../../core/foundry-globals.ts";
import { createFoundrySystemUserSettingStorage } from "../../services/foundry-settings-storage.ts";
import { hasFavoriteReference } from "./view-model-helpers.ts";

export type Dnd5eFavoriteEntry = {
  id: string;
  type: string;
  sort: number;
};

export type Dnd5eFavoriteActorReference = {
  uuid?: string;
  id?: string;
  system?: Record<string, unknown>;
};

const SORT_DENSITY = 100000;

const favoritesByActorCodec = {
  parse: parseFavoritesByActor,
  sanitize: normalizeFavoritesByActor
};

/**
 * Reads module-owned dnd5e favorite entries for the actor in the current world/system/user scope.
 */
export function getDnd5eFavoriteEntries(actor: Dnd5eFavoriteActorReference): Dnd5eFavoriteEntry[] {
  const actorUuid = getActorUuid(actor);
  if (!actorUuid) return normalizeFavoriteEntries(getCollectionContents(getObject(actor.system)?.favorites));

  const entries = createFavoritesByActorStorage().read()[actorUuid];
  return entries ?? normalizeFavoriteEntries(getCollectionContents(getObject(actor.system)?.favorites));
}

/**
 * Checks whether a module-owned dnd5e favorite references any of the supplied identifiers.
 */
export function hasDnd5eFavoriteReference(
  actor: Dnd5eFavoriteActorReference | null | undefined,
  identifiers: Array<string | undefined>,
  keys: string[] = ["id", "item", "uuid"]
): boolean {
  if (!actor) return false;
  return hasFavoriteReference(getDnd5eFavoriteEntries(actor), identifiers, keys);
}

/**
 * Adds or removes a dnd5e favorite entry in Foundry server-side settings for the current user.
 */
export async function setDnd5eFavoriteEntry(
  actor: Dnd5eFavoriteActorReference | null | undefined,
  type: string,
  favoriteId: string,
  favorite: boolean,
  options: { legacyAddTarget?: unknown; legacyRemoveTarget?: unknown } = {}
): Promise<boolean> {
  const actorUuid = actor ? getActorUuid(actor) : "";
  const normalizedId = favoriteId.trim();
  const normalizedType = type.trim() || inferFavoriteType(normalizedId);
  if (!actor || !actorUuid || !normalizedId) return false;
  if (!hasFoundryFavoriteSettingScope()) return setLegacyDnd5eFavoriteEntry(actor, normalizedType, normalizedId, favorite, options);

  const storage = createFavoritesByActorStorage();
  const byActor = storage.read();
  const entries = byActor[actorUuid] ?? normalizeFavoriteEntries(getCollectionContents(getObject(actor.system)?.favorites));
  const remaining = entries.filter(entry => !idsMatch(entry.id, normalizedId));

  byActor[actorUuid] = favorite
    ? [
        ...remaining,
        {
          id: normalizedId,
          type: normalizedType,
          sort: entries.find(entry => idsMatch(entry.id, normalizedId))?.sort ?? getNextSort(entries)
        }
      ].sort((left, right) => left.sort - right.sort)
    : remaining;

  await storage.write(byActor);
  return true;
}

/**
 * Checks whether favorites can be toggled in Foundry settings or legacy dnd5e fixtures.
 */
export function canToggleDnd5eFavorites(actor: Dnd5eFavoriteActorReference | null | undefined): boolean {
  if (!actor) return false;
  return hasFoundryFavoriteSettingScope() || hasLegacyFavoriteApi(actor);
}

function createFavoritesByActorStorage() {
  return createFoundrySystemUserSettingStorage<Record<string, Dnd5eFavoriteEntry[]>>({
    settingKey: FAVORITES_SETTING,
    codec: favoritesByActorCodec,
    defaultValue: () => ({})
  });
}

function hasFoundryFavoriteSettingScope(): boolean {
  const runtime = getFoundryRuntime();
  return Boolean(runtime.game?.settings && runtime.game.system?.id?.trim() && runtime.game.user?.id?.trim());
}

async function setLegacyDnd5eFavoriteEntry(
  actor: Dnd5eFavoriteActorReference,
  type: string,
  favoriteId: string,
  favorite: boolean,
  options: { legacyAddTarget?: unknown; legacyRemoveTarget?: unknown }
): Promise<boolean> {
  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return false;

  const payload = favorite
    ? options.legacyAddTarget ?? { type, id: favoriteId }
    : options.legacyRemoveTarget ?? favoriteId;
  await (action as (target: unknown) => Promise<unknown>).call(system, payload);
  return true;
}

function hasLegacyFavoriteApi(actor: Dnd5eFavoriteActorReference): boolean {
  const system = getObject(actor.system);
  return typeof system?.addFavorite === "function" || typeof system?.removeFavorite === "function";
}

function getActorUuid(actor: Dnd5eFavoriteActorReference): string {
  return actor.uuid?.trim() || (actor.id ? `Actor.${actor.id}` : "");
}

function parseFavoritesByActor(value: unknown): Record<string, Dnd5eFavoriteEntry[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return normalizeFavoritesByActor(value as Record<string, unknown>);
}

function normalizeFavoritesByActor(value: Record<string, unknown>): Record<string, Dnd5eFavoriteEntry[]> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([actorUuid, entries]) => [actorUuid.trim(), normalizeFavoriteEntries(getCollectionContents(entries))] as const)
      .filter(([actorUuid]) => actorUuid)
  );
}

function normalizeFavoriteEntries(entries: unknown[]): Dnd5eFavoriteEntry[] {
  return entries
    .map((entry, index) => normalizeFavoriteEntry(entry, index))
    .filter((entry): entry is Dnd5eFavoriteEntry => entry !== null)
    .sort((left, right) => left.sort - right.sort);
}

function normalizeFavoriteEntry(entry: unknown, index: number): Dnd5eFavoriteEntry | null {
  if (typeof entry === "string") return { id: entry, type: inferFavoriteType(entry), sort: index * SORT_DENSITY };
  const object = getObject(entry);
  const id = getString(object?.id);
  const type = getString(object?.type) || inferFavoriteType(id);
  if (!id || !type) return null;
  return { id, type, sort: getNumber(object?.sort) ?? index * SORT_DENSITY };
}

function getNextSort(entries: Dnd5eFavoriteEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.sort), 0) + SORT_DENSITY;
}

function inferFavoriteType(id: string): string {
  if (id.startsWith("resources.")) return "resource";
  if (id.includes("ActiveEffect.")) return "effect";
  if (id.includes("Activity.")) return "activity";
  return id.includes(".") ? "item" : "";
}

function idsMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const normalizedLeft = left.replace(/^\./, "");
  const normalizedRight = right.replace(/^\./, "");
  return normalizedLeft === normalizedRight || normalizedLeft.endsWith(`.${normalizedRight}`) || normalizedRight.endsWith(`.${normalizedLeft}`);
}
