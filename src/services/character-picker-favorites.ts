import { createLocalStorageKey, readLocalStorage, writeLocalStorage, type LocalStorageCodec, type LocalStorageKey } from "./local-storage.ts";

export const characterPickerFavoritesCodec: LocalStorageCodec<string[]> = {
  parse: value => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return undefined;

      const actorUuids = parsed
        .map(entry => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
      return [...new Set(actorUuids)];
    } catch {
      return undefined;
    }
  },
  serialize: value => JSON.stringify([...new Set(value.map(actorUuid => actorUuid.trim()).filter(Boolean))])
};

export function createCharacterPickerFavoritesStorageKey(scope: Array<string | undefined> = []): LocalStorageKey<string[]> {
  return createLocalStorageKey({
    namespace: "characterPickerFavorites",
    scope,
    codec: characterPickerFavoritesCodec
  });
}

export function readCharacterPickerFavorites(storageKey: LocalStorageKey<string[]>): string[] {
  return readLocalStorage(storageKey) ?? [];
}

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
