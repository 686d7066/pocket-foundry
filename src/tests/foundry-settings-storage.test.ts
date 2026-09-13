import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createFoundrySystemUserSettingStorage } from "../services/foundry-settings-storage.ts";

const stringListCodec = {
  parse: (value: unknown): string[] | undefined => Array.isArray(value) && value.every(entry => typeof entry === "string") ? [...value] : undefined,
  sanitize: (value: string[]): string[] => [...new Set(value)]
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
});

test("separate storage wrappers serialize updates against the latest setting value", async () => {
  const firstWrite = deferred<void>();
  const fixture = installSettings({ delayFirstWrite: firstWrite.promise });
  const firstStorage = createStorage();
  const secondStorage = createStorage();

  const first = firstStorage.update(current => [...current, "first"]);
  await fixture.firstWriteStarted.promise;
  const second = secondStorage.update(current => [...current, "second"]);

  firstWrite.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(readScopedValue(fixture.values), ["first", "second"]);
  assert.equal(fixture.writeCount(), 2);
});

test("a failed setting write rejects and does not poison the next queued update", async () => {
  const fixture = installSettings({ failFirstWrite: true });
  const firstStorage = createStorage();
  const secondStorage = createStorage();

  const first = firstStorage.update(current => [...current, "lost"]);
  const firstRejection = assert.rejects(first, /setting write failed/);
  await fixture.firstWriteStarted.promise;
  const second = secondStorage.update(current => [...current, "saved"]);
  await Promise.all([firstRejection, second]);

  assert.deepEqual(readScopedValue(fixture.values), ["saved"]);
  assert.equal(fixture.writeCount(), 2);
});

test("a queued update rejects rather than crossing into a different user scope", async () => {
  const firstWrite = deferred<void>();
  const fixture = installSettings({ delayFirstWrite: firstWrite.promise });
  const firstStorage = createStorage();
  const queuedStorage = createStorage();

  const first = firstStorage.update(current => [...current, "first-user"]);
  await fixture.firstWriteStarted.promise;
  const queued = queuedStorage.update(current => [...current, "wrong-user"]);
  const queuedRejection = assert.rejects(queued, /active Foundry scope changed/);
  fixture.game.user.id = "User2";
  firstWrite.resolve();

  await first;
  await queuedRejection;
  assert.deepEqual(readScopedValue(fixture.values), ["first-user"]);
  assert.equal(fixture.writeCount(), 1);
});

test("updates persist in-place transforms and skip unchanged values", async () => {
  const fixture = installSettings({ initialValue: ["first"] });
  const storage = createStorage();

  await storage.update(current => {
    current.push("second");
    return current;
  });
  await storage.update(current => [...current]);

  assert.deepEqual(readScopedValue(fixture.values), ["first", "second"]);
  assert.equal(fixture.writeCount(), 1);
});

test("writes reject when there is no active Foundry setting scope", async () => {
  const storage = createStorage();

  await assert.rejects(storage.write(["value"]), /without an active Foundry settings, system, and user scope/);
});

/** Creates the string-list setting wrapper used by the serializer regressions. */
function createStorage() {
  return createFoundrySystemUserSettingStorage({
    settingKey: "testValues",
    codec: stringListCodec,
    defaultValue: () => []
  });
}

/** Installs one mutable Foundry settings backend with controllable first-write behavior. */
function installSettings(options: {
  initialValue?: string[];
  delayFirstWrite?: Promise<void>;
  failFirstWrite?: boolean;
} = {}) {
  const values = new Map<string, unknown>();
  if (options.initialValue) {
    values.set("testValues", { fixtureSystem: { User1: options.initialValue } });
  }
  let writes = 0;
  const firstWriteStarted = deferred<void>();
  const game = {
    user: { id: "User1" },
    system: { id: "fixtureSystem" },
    world: { id: "World1" },
    settings: {
      get: (_namespace: string, key: string) => values.get(key) ?? {},
      set: async (_namespace: string, key: string, value: unknown) => {
        writes += 1;
        if (writes === 1) {
          firstWriteStarted.resolve();
          if (options.delayFirstWrite) await options.delayFirstWrite;
          if (options.failFirstWrite) throw new Error("setting write failed");
        }
        values.set(key, value);
      }
    }
  };
  Object.defineProperty(globalThis, "game", { configurable: true, value: game });
  return { values, game, firstWriteStarted, writeCount: () => writes };
}

/** Reads the test user's scoped list from the complete setting root. */
function readScopedValue(values: Map<string, unknown>): unknown {
  const root = values.get("testValues") as Record<string, Record<string, unknown>> | undefined;
  return root?.fixtureSystem?.User1;
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
