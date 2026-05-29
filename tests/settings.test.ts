import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "vitest";
import { handleReadyMobileLifecycle } from "../src/core/mobile-startup.ts";
import {
  COLOR_BLIND_MODE_SETTING,
  CHARACTER_SHEET_BANNER_ENABLED_SETTING,
  FAVORITES_SETTING,
  CHARACTER_PICKER_FAVORITES_SETTING,
  MOBILE_VIEW_ENABLED_SETTING,
  RECENT_ROUTES_SETTING,
  getCharacterSheetBannerEnabled,
  getMobileViewEnabled,
  registerMobileViewSetting
} from "../src/core/settings.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "confirm");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "matchMedia");
});

test("mobile view setting is user scoped and opt-in by default", () => {
  const registrations: Array<{ namespace: string; key: string; config: { scope: string; config: boolean; default: unknown; type: unknown } }> = [];
  const shell = {
    isMounted: () => false,
    mount: async () => undefined,
    unmount: () => undefined,
    setMobileViewEnabled: async () => undefined,
    refresh: async () => undefined
  };

  (globalThis as typeof globalThis & { game?: unknown }).game = {
    settings: {
      register: (namespace: string, key: string, config: { scope: string; config: boolean; default: unknown; type: unknown }) => registrations.push({ namespace, key, config }),
      get: () => false,
      set: async () => undefined
    }
  };

  registerMobileViewSetting(shell);

  assert.equal(registrations.length, 6);
  assert.equal(registrations[0]?.namespace, "pocket-foundry");
  assert.equal(registrations[0]?.key, MOBILE_VIEW_ENABLED_SETTING);
  assert.equal(registrations[0]?.config.scope, "user");
  assert.equal(registrations[0]?.config.default, false);
  assert.equal(registrations[1]?.namespace, "pocket-foundry");
  assert.equal(registrations[1]?.key, CHARACTER_SHEET_BANNER_ENABLED_SETTING);
  assert.equal(registrations[1]?.config.scope, "user");
  assert.equal(registrations[1]?.config.default, true);
  assert.equal(registrations[2]?.namespace, "pocket-foundry");
  assert.equal(registrations[2]?.key, COLOR_BLIND_MODE_SETTING);
  assert.equal(registrations[2]?.config.scope, "user");
  assert.equal(registrations[2]?.config.default, false);
  assert.equal(registrations[3]?.namespace, "pocket-foundry");
  assert.equal(registrations[3]?.key, CHARACTER_PICKER_FAVORITES_SETTING);
  assert.equal(registrations[3]?.config.scope, "user");
  assert.equal(registrations[3]?.config.config, false);
  assert.equal(registrations[3]?.config.type, Object);
  assert.deepEqual(registrations[3]?.config.default, {});
  assert.equal(registrations[4]?.namespace, "pocket-foundry");
  assert.equal(registrations[4]?.key, FAVORITES_SETTING);
  assert.equal(registrations[4]?.config.scope, "user");
  assert.equal(registrations[4]?.config.config, false);
  assert.equal(registrations[4]?.config.type, Object);
  assert.deepEqual(registrations[4]?.config.default, {});
  assert.equal(registrations[5]?.namespace, "pocket-foundry");
  assert.equal(registrations[5]?.key, RECENT_ROUTES_SETTING);
  assert.equal(registrations[5]?.config.scope, "user");
  assert.equal(registrations[5]?.config.config, false);
  assert.equal(registrations[5]?.config.type, Object);
  assert.deepEqual(registrations[5]?.config.default, {});
});

test("mobile view is disabled when Foundry settings are not available", () => {
  assert.equal(getMobileViewEnabled(), false);
});

test("character sheet banner is enabled when Foundry settings are not available", () => {
  assert.equal(getCharacterSheetBannerEnabled(), true);
});

test("mobile startup prompt and setting value are isolated by Foundry user", async () => {
  const settingValuesByUser = new Map<string, boolean>();
  const localStorageValues = new Map<string, string>();
  const shellStates: boolean[] = [];
  const promptAnswers = [true, false];
  const runtime = globalThis as typeof globalThis & {
    game?: {
      settings: {
        get: () => boolean;
        set: (_namespace: string, _key: string, value: unknown) => Promise<void>;
      };
      user: { id: string };
      world: { id: string };
    };
  };

  Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
  Object.defineProperty(globalThis, "confirm", { configurable: true, value: () => promptAnswers.shift() ?? false });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageValues.set(key, value);
      }
    }
  });
  runtime.game = {
    settings: {
      get: () => settingValuesByUser.get(runtime.game?.user.id ?? "") ?? false,
      set: async (_namespace, _key, value) => {
        settingValuesByUser.set(runtime.game?.user.id ?? "", Boolean(value));
      }
    },
    user: { id: "Testuser1" },
    system: { id: "dnd5e", title: "dnd5e" },
    world: { id: "World1" }
  } as typeof runtime.game;
  const shell = {
    isMounted: () => false,
    mount: async () => undefined,
    unmount: () => undefined,
    setMobileViewEnabled: async (enabled: boolean) => {
      shellStates.push(enabled);
    },
    refresh: async () => undefined
  };

  await handleReadyMobileLifecycle(shell);
  if (!runtime.game) throw new Error("Expected runtime.game test fixture");
  runtime.game.user.id = "Testuser2";
  await handleReadyMobileLifecycle(shell);

  assert.deepEqual(shellStates, [false, false]);
  assert.equal(settingValuesByUser.get("Testuser1"), false);
  assert.equal(settingValuesByUser.get("Testuser2"), false);
  assert.equal(localStorageValues.has("pocket-foundry.mobileViewPrompted.World1.Testuser1"), true);
  assert.equal(localStorageValues.has("pocket-foundry.mobileViewPrompted.World1.Testuser2"), true);
});

test("settings templates expose a clear Recents action", () => {
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const settingsTemplate = readFileSync(new URL("../src/templates/settings.hbs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8");

  assert.match(shellTemplate, /data-action="clear-recents"/);
  assert.match(settingsTemplate, /data-action="clear-recents"/);
  assert.match(shellTemplate + settingsTemplate, /Clear Recent Views/);
  assert.match(css, /\.pocket-foundry-root \.setting-action/);
});

test("settings templates expose the character sheet banner toggle", () => {
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const settingsTemplate = readFileSync(new URL("../src/templates/settings.hbs", import.meta.url), "utf8");

  assert.match(shellTemplate, /action="toggle-character-banner"/);
  assert.match(settingsTemplate, /action="toggle-character-banner"/);
  assert.match(shellTemplate + settingsTemplate, /characterSheetBannerLabel/);
});

test("settings templates expose the color-blind mode toggle", () => {
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const settingsTemplate = readFileSync(new URL("../src/templates/settings.hbs", import.meta.url), "utf8");

  assert.match(shellTemplate, /action="toggle-color-blind-mode"/);
  assert.match(settingsTemplate, /action="toggle-color-blind-mode"/);
  assert.match(shellTemplate + settingsTemplate, /Color-Blind Mode/);
});

test("actor sheet template supports the dnd5e-style character banner layer", () => {
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /showCharacterBanner/);
  assert.match(actorShellTemplate, /character-banner-enabled/);
  assert.match(css, /--pf-character-banner-image/);
  assert.match(css, /mask-image: linear-gradient\(to bottom, black 0 28%, rgb\(0 0 0 \/ \.72\) 46%, transparent 100%\)/);
});

test("bottom navigation renders Search and Settings as compact icons", () => {
  const bottomNavTemplate = readFileSync(new URL("../src/templates/partials/bottom-nav.hbs", import.meta.url), "utf8");
  const navigationHelperSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-navigation.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8");

  assert.match(bottomNavTemplate, /{{#if icon}}/);
  assert.match(bottomNavTemplate, /<i class="{{icon}}"/);
  assert.match(bottomNavTemplate, /class="sr-only"/);
  assert.match(navigationHelperSource, /icon: "fa-solid fa-magnifying-glass"/);
  assert.match(navigationHelperSource, /icon: "fa-solid fa-cog"/);
  assert.match(css, /\.bottom-nav button\[data-route="search"\]/);
  assert.match(css, /\.bottom-nav button\[data-route="settings"\]/);
});

