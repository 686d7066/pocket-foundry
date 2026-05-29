import { CHARACTER_PICKER_FAVORITES_SETTING } from "../core/settings.ts";
import { createFoundrySystemUserSettingStorage, type FoundryScopedSettingStorage } from "./foundry-settings-storage.ts";
import { createLocalStorageKey, readLocalStorage, writeLocalStorage, type LocalStorageCodec, type LocalStorageKey } from "./local-storage.ts";

export const characterPickerFavoritesCodec: LocalStorageCodec<string[]> = {
  parse: value => {
    try {
      return parseCharacterPickerFavorites(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  },
  serialize: value => JSON.stringify(normalizeCharacterPickerFavorites(value))
};

export type CharacterPickerFavoritesStorage = FoundryScopedSettingStorage<string[]>;

export const characterPickerFavoritesSettingCodec = {
  parse: parseCharacterPickerFavorites,
  sanitize: normalizeCharacterPickerFavorites
};

/**
 * Creates a localStorage key for legacy tests and browser-local fallbacks.
 */
export function createCharacterPickerFavoritesStorageKey(scope: Array<string | undefined> = []): LocalStorageKey<string[]> {
  return createLocalStorageKey({
    namespace: "characterPickerFavorites",
    scope,
    codec: characterPickerFavoritesCodec
  });
}

/**
 * Creates the Foundry world-setting backed favorites storage for the current system and user.
 */
export function createFoundryCharacterPickerFavoritesStorage(): CharacterPickerFavoritesStorage {
  return createFoundrySystemUserSettingStorage({
    settingKey: CHARACTER_PICKER_FAVORITES_SETTING,
    codec: characterPickerFavoritesSettingCodec,
    defaultValue: () => []
  });
}

/**
 * Reads character picker favorites from a localStorage key.
 */
export function readCharacterPickerFavorites(storageKey: LocalStorageKey<string[]>): string[] {
  return readLocalStorage(storageKey) ?? [];
}

/**
 * Reads character picker favorites from the provided storage adapter.
 */
export function readCharacterPickerFavoritesFromStorage(storage: CharacterPickerFavoritesStorage): string[] {
  return storage.read();
}

/**
 * Updates a character picker favorite in a localStorage key.
 */
export function setCharacterPickerFavorite(storageKey: LocalStorageKey<string[]>, actorUuid: string, favorite: boolean): string[] {
  const normalizedActorUuid = actorUuid.trim();
  if (!normalizedActorUuid) return readCharacterPickerFavorites(storageKey);

  const favorites = new Set(readCharacterPickerFavorites(storageKey));
  if (favorite) favorites.add(normalizedActorUuid);
  else favorites.delete(normalizedActorUuid);

  const nextFavorites = [...favorites];
  writeLocalStorage(storageKey, nextFavorites);
  return nextFavorites;
}

/**
 * Updates a character picker favorite in the provided storage adapter.
 */
export async function setCharacterPickerFavoriteInStorage(storage: CharacterPickerFavoritesStorage, actorUuid: string, favorite: boolean): Promise<string[]> {
  const normalizedActorUuid = actorUuid.trim();
  if (!normalizedActorUuid) return readCharacterPickerFavoritesFromStorage(storage);

  const favorites = new Set(readCharacterPickerFavoritesFromStorage(storage));
  if (favorite) favorites.add(normalizedActorUuid);
  else favorites.delete(normalizedActorUuid);

  const nextFavorites = normalizeCharacterPickerFavorites([...favorites]);
  await storage.write(nextFavorites);
  return nextFavorites;
}

function parseCharacterPickerFavorites(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return normalizeCharacterPickerFavorites(value);
}

function normalizeCharacterPickerFavorites(value: unknown[]): string[] {
  const actorUuids = value
    .map(entry => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return [...new Set(actorUuids)];
}
