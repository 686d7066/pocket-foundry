import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { localize, localizeSystemKey, localizeSystemLabel } from "../core/localization.ts";

const runtime = globalThis as { game?: unknown };
const originalGame = runtime.game;
const fixtureAlignmentKey = ["FIXTURE", "Alignment"].join(".");
const fixtureUnknownKey = ["FIXTURE", "Unknown"].join(".");
const fixtureSpellcastingClassKey = ["FIXTURE", "SpellcastingClass"].join(".");

afterEach(() => {
  runtime.game = originalGame;
});

test("localize uses Foundry localization and interpolation for known keys", () => {
  const calls: Array<[string, boolean | undefined]> = [];
  runtime.game = {
    i18n: {
      has: (key: string, fallback?: boolean) => {
        calls.push([key, fallback]);
        return key === "POCKETFOUNDRY.Test.Greeting";
      },
      localize: (key: string, data?: Record<string, unknown>) => key === "POCKETFOUNDRY.Test.Greeting" ? `Hello ${data?.name}` : key
    }
  };

  assert.equal(localize("POCKETFOUNDRY.Test.Greeting", "Fallback {name}", { name: "Arlen" }), "Hello Arlen");
  assert.deepEqual(calls, [["POCKETFOUNDRY.Test.Greeting", true]]);
});

test("localize falls back to English when Foundry i18n is missing or does not know a key", () => {
  runtime.game = undefined;
  assert.equal(localize("POCKETFOUNDRY.Test.Unknown", "Fallback {name}", { name: "Arlen" }), "Fallback Arlen");

  runtime.game = {
    i18n: {
      has: () => false,
      localize: (key: string) => key
    }
  };
  assert.equal(localize("POCKETFOUNDRY.Test.Unknown", "Fallback {name}", { name: "Mira" }), "Fallback Mira");
});

test("localizeSystemLabel localizes known system keys and preserves literal labels", () => {
  const localizedKeys: string[] = [];
  runtime.game = {
    i18n: {
      has: (key: string) => key === fixtureAlignmentKey,
      localize: (key: string) => {
        localizedKeys.push(key);
        return key === fixtureAlignmentKey ? "Localized Alignment" : key;
      }
    }
  };

  assert.equal(localizeSystemLabel(fixtureAlignmentKey, "Alignment"), "Localized Alignment");
  assert.equal(localizeSystemLabel("Already Localized", "Fallback"), "Already Localized");
  assert.equal(localizeSystemLabel(fixtureUnknownKey, "Unknown"), "Unknown");
  assert.deepEqual(localizedKeys, [fixtureAlignmentKey]);
});

test("localizeSystemKey localizes active system keys and falls back with interpolation", () => {
  const calls: Array<[string, boolean | undefined]> = [];
  runtime.game = {
    i18n: {
      has: (key: string, fallback?: boolean) => {
        calls.push([key, fallback]);
        return key === fixtureSpellcastingClassKey;
      },
      localize: (key: string, data?: Record<string, unknown>) => key === fixtureSpellcastingClassKey ? `${data?.class} Spellcasting` : key
    }
  };

  assert.equal(localizeSystemKey(fixtureSpellcastingClassKey, "{class} Spellcasting", { class: "Wizard" }), "Wizard Spellcasting");
  assert.equal(localizeSystemKey(fixtureUnknownKey, "{name} fallback", { name: "English" }), "English fallback");
  assert.deepEqual(calls, [[fixtureSpellcastingClassKey, true], [fixtureUnknownKey, true]]);
});
