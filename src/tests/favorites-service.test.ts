import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { FAVORITES_SETTING } from "../core/settings.ts";
import {
  favoriteIdsMatch,
  getFavoriteEntries,
  hasFavoriteEntryReference,
  setFavoriteEntry
} from "../services/favorites.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
});

test("generic favorites restore entries by current system, user, and actor", () => {
  installFoundrySettings(new Map<string, unknown>([
    [
      FAVORITES_SETTING,
      {
        fixtureSystem: {
          User1: {
            "Actor.arlen": [
              { type: "skill", id: "arc", sort: 2000 },
              { type: "item", id: ".Item.dagger", sort: 1000 }
            ],
            "Actor.mira": [{ type: "tool", id: "thieves", sort: 1000 }]
          },
          User2: {
            "Actor.arlen": [{ type: "skill", id: "ste", sort: 1000 }]
          }
        },
        otherFixture: {
          User1: {
            "Actor.arlen": [{ type: "skill", id: "athletics", sort: 1000 }]
          }
        }
      }
    ]
  ]));

  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }), [
    { type: "item", id: ".Item.dagger", sort: 1000 },
    { type: "skill", id: "arc", sort: 2000 }
  ]);

  (globalThis as typeof globalThis & { game: { user: { id: string }; system: { id: string } } }).game.user.id = "User2";
  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }), [{ type: "skill", id: "ste", sort: 1000 }]);

  (globalThis as typeof globalThis & { game: { user: { id: string }; system: { id: string } } }).game.user.id = "User1";
  (globalThis as typeof globalThis & { game: { user: { id: string }; system: { id: string } } }).game.system.id = "otherFixture";
  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }), [{ type: "skill", id: "athletics", sort: 1000 }]);
});

test("generic favorites add and remove while preserving existing sort order", async () => {
  const settingValues = installFoundrySettings(new Map<string, unknown>([
    [
      FAVORITES_SETTING,
      {
        fixtureSystem: {
          User1: {
            "Actor.arlen": [
              { type: "item", id: ".Item.dagger", sort: 1000 },
              { type: "skill", id: "arc", sort: 2000 }
            ]
          }
        }
      }
    ]
  ]));

  assert.equal(await setFavoriteEntry({ uuid: "Actor.arlen" }, "item", "Item.dagger", true), true);
  assert.equal(await setFavoriteEntry({ uuid: "Actor.arlen" }, "tool", "thieves", true), true);
  assert.equal(await setFavoriteEntry({ uuid: "Actor.arlen" }, "skill", "arc", false), true);

  assert.deepEqual(
    (((settingValues.get(FAVORITES_SETTING) as Record<string, unknown>).fixtureSystem as Record<string, unknown>).User1 as Record<string, unknown>)["Actor.arlen"],
    [
      { type: "item", id: "Item.dagger", sort: 1000 },
      { type: "tool", id: "thieves", sort: 102000 }
    ]
  );
});

test("concurrent favorite additions preserve both updates", async () => {
  const values = new Map<string, unknown>();
  const firstWriteStarted = deferred<void>();
  const releaseFirstWrite = deferred<void>();
  let writes = 0;
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { id: "User1" },
      system: { id: "fixtureSystem" },
      world: { id: "World1" },
      settings: {
        get: (_namespace: string, key: string) => values.get(key) ?? {},
        set: async (_namespace: string, key: string, value: unknown) => {
          writes += 1;
          if (writes === 1) {
            firstWriteStarted.resolve();
            await releaseFirstWrite.promise;
          }
          values.set(key, value);
        }
      }
    }
  });

  const first = setFavoriteEntry({ uuid: "Actor.arlen" }, "item", "Item.first", true);
  await firstWriteStarted.promise;
  const second = setFavoriteEntry({ uuid: "Actor.arlen" }, "item", "Item.second", true);
  releaseFirstWrite.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }).map(entry => entry.id), ["Item.first", "Item.second"]);
});

test("a rejected favorite write propagates without reporting success or changing stored state", async () => {
  const values = installFoundrySettings(new Map());
  const runtime = globalThis as typeof globalThis & {
    game: { settings: { set: (_namespace: string, key: string, value: unknown) => Promise<void> } };
  };
  runtime.game.settings.set = async () => {
    throw new Error("favorite setting denied");
  };

  await assert.rejects(setFavoriteEntry({ uuid: "Actor.arlen" }, "item", "Item.denied", true), /favorite setting denied/);
  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }), []);
  assert.equal(values.has(FAVORITES_SETTING), false);
});

test("generic favorites fall back to legacy entries and callbacks outside Foundry settings", async () => {
  const calls: Array<[boolean, unknown]> = [];
  const fallbackEntries = [
    { type: "item", item: ".Item.dagger", sort: 2000 },
    "Actor.arlen.Item.wand"
  ];

  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }, { fallbackEntries }), [
    { type: "item", id: "Actor.arlen.Item.wand", sort: 100000 },
    { type: "item", id: ".Item.dagger", sort: 2000 }
  ].sort((left, right) => left.sort - right.sort));

  assert.equal(await setFavoriteEntry({ uuid: "Actor.arlen" }, "item", ".Item.dagger", true, {
    legacyAddTarget: { id: ".Item.dagger" },
    legacyToggle: (favorite, target) => calls.push([favorite, target])
  }), true);
  assert.deepEqual(calls, [[true, { id: ".Item.dagger" }]]);

  assert.equal(await setFavoriteEntry({ uuid: "Actor.arlen" }, "item", ".Item.missing", true, {
    legacyToggle: () => false
  }), false);
});

test("generic favorite matching supports relative and absolute ids", () => {
  const entries = [{ type: "item", id: "Actor.arlen.Item.dagger", sort: 1000 }];

  assert.equal(favoriteIdsMatch("Actor.arlen.Item.dagger", ".Item.dagger"), true);
  assert.equal(hasFavoriteEntryReference(entries, [".Item.dagger"]), true);
  assert.equal(hasFavoriteEntryReference(entries, ["Actor.other.Item.dagger"]), false);
});

function installFoundrySettings(settingValues: Map<string, unknown>): Map<string, unknown> {
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: {
      user: { id: "User1" },
      system: { id: "fixtureSystem" },
      world: { id: "World1" },
      settings: {
        get: (_namespace: string, key: string) => settingValues.get(key) ?? {},
        set: async (_namespace: string, key: string, value: unknown) => {
          settingValues.set(key, value);
        }
      }
    }
  });
  return settingValues;
}

/** Creates an explicit promise gate without relying on timing delays. */
function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
