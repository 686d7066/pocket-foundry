import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { FAVORITES_SETTING } from "../src/core/settings.ts";
import {
  favoriteIdsMatch,
  getFavoriteEntries,
  hasFavoriteEntryReference,
  setFavoriteEntry
} from "../src/services/favorites.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
});

test("generic favorites restore entries by current system, user, and actor", () => {
  installFoundrySettings(new Map<string, unknown>([
    [
      FAVORITES_SETTING,
      {
        dnd5e: {
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
        pf2e: {
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
  (globalThis as typeof globalThis & { game: { user: { id: string }; system: { id: string } } }).game.system.id = "pf2e";
  assert.deepEqual(getFavoriteEntries({ uuid: "Actor.arlen" }), [{ type: "skill", id: "athletics", sort: 1000 }]);
});

test("generic favorites add and remove while preserving existing sort order", async () => {
  const settingValues = installFoundrySettings(new Map<string, unknown>([
    [
      FAVORITES_SETTING,
      {
        dnd5e: {
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
    (((settingValues.get(FAVORITES_SETTING) as Record<string, unknown>).dnd5e as Record<string, unknown>).User1 as Record<string, unknown>)["Actor.arlen"],
    [
      { type: "item", id: "Item.dagger", sort: 1000 },
      { type: "tool", id: "thieves", sort: 102000 }
    ]
  );
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
      system: { id: "dnd5e" },
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
