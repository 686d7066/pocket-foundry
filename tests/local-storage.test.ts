import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  booleanLocalStorageCodec,
  createLocalStorageKey,
  nonEmptyStringLocalStorageCodec,
  readLocalStorage,
  writeLocalStorage
} from "../src/services/local-storage.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("typed local storage keys include module namespace and scope parts", () => {
  const key = createLocalStorageKey({
    namespace: "selectedCharacterUuid",
    scope: ["World1", "User1"],
    codec: nonEmptyStringLocalStorageCodec
  });

  assert.equal(key.key, "pocket-foundry.selectedCharacterUuid.World1.User1");
});

test("typed local storage reads and writes values through codecs", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      }
    }
  });

  const key = createLocalStorageKey({
    namespace: "mobileViewPrompted",
    scope: ["World1", "User1"],
    codec: booleanLocalStorageCodec
  });

  writeLocalStorage(key, true);

  assert.equal(values.get("pocket-foundry.mobileViewPrompted.World1.User1"), "true");
  assert.equal(readLocalStorage(key), true);
});

test("typed local storage returns undefined for invalid or unavailable values", () => {
  const values = new Map<string, string>([["pocket-foundry.selectedCharacterUuid.World1.User1", "  "]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => undefined
    }
  });

  const key = createLocalStorageKey({
    namespace: "selectedCharacterUuid",
    scope: ["World1", "User1"],
    codec: nonEmptyStringLocalStorageCodec
  });

  assert.equal(readLocalStorage(key), undefined);
});

