import { MODULE_ID } from "./constants.ts";
import { getFoundryRuntime } from "./foundry-globals.ts";
import type { MobileShellController } from "./mobile-shell/controller.ts";

/**
 * User-scoped Foundry setting key controlling whether the mobile shell is active.
 */
export const MOBILE_VIEW_ENABLED_SETTING = "mobileViewEnabled";

/**
 * User-scoped Foundry setting key controlling the character-sheet banner.
 */
export const CHARACTER_SHEET_BANNER_ENABLED_SETTING = "characterSheetBannerEnabled";

/**
 * User-scoped Foundry setting key controlling color-blind mode.
 */
export const COLOR_BLIND_MODE_SETTING = "colorBlindMode";

/**
 * Hidden user-scoped setting key storing mobile sheet favorites for this world.
 */
export const FAVORITES_SETTING = "favorites";

/**
 * Hidden user-scoped setting key storing character picker favorites for this world.
 */
export const CHARACTER_PICKER_FAVORITES_SETTING = "characterPickerFavorites";

/**
 * Hidden user-scoped setting key storing recent mobile routes for this world.
 */
export const RECENT_ROUTES_SETTING = "recentRoutes";

/**
 * Registers Pocket Foundry settings and binds user-facing preferences to shell state.
 */
export function registerMobileViewSetting(shell: MobileShellController): void {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) {
    throw new Error(`${MODULE_ID} cannot register settings before Foundry game settings are available.`);
  }

  runtime.game.settings.register(MODULE_ID, MOBILE_VIEW_ENABLED_SETTING, {
    name: "Mobile View",
    hint: "Use the mobile-optimized Foundry interface for this user.",
    scope: "user",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      void shell.setMobileViewEnabled(Boolean(value));
    }
  });

  runtime.game.settings.register(MODULE_ID, CHARACTER_SHEET_BANNER_ENABLED_SETTING, {
    name: "Character Sheet Banner",
    hint: "Show a character sheet banner texture at the top of mobile character sheets.",
    scope: "user",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      void shell.refresh();
    }
  });

  runtime.game.settings.register(MODULE_ID, COLOR_BLIND_MODE_SETTING, {
    name: "Color-Blind Mode",
    hint: "Use color-blind-friendly colors for success and failure blips.",
    scope: "user",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      void shell.refresh();
    }
  });

  runtime.game.settings.register(MODULE_ID, CHARACTER_PICKER_FAVORITES_SETTING, {
    name: "Pocket Foundry Character Favorites",
    hint: "Server-side storage for this user's system-specific character favorites in this world.",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  runtime.game.settings.register(MODULE_ID, FAVORITES_SETTING, {
    name: "Pocket Foundry Favorites",
    hint: "Server-side storage for this user's system-specific mobile sheet favorites in this world.",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  runtime.game.settings.register(MODULE_ID, RECENT_ROUTES_SETTING, {
    name: "Pocket Foundry Recent Views",
    hint: "Server-side storage for this user's system-scoped recent mobile views in this world.",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });
}

/**
 * Reads whether the current user has enabled the Pocket Foundry mobile view.
 */
export function getMobileViewEnabled(): boolean {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) return false;

  return Boolean(runtime.game.settings.get(MODULE_ID, MOBILE_VIEW_ENABLED_SETTING));
}

/**
 * Reads whether the current user wants the character sheet banner in mobile sheets.
 */
export function getCharacterSheetBannerEnabled(): boolean {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) return true;

  return Boolean(runtime.game.settings.get(MODULE_ID, CHARACTER_SHEET_BANNER_ENABLED_SETTING));
}

/**
 * Reads whether the current user wants color-blind mode colors.
 */
export function getColorBlindMode(): boolean {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) return false;

  return Boolean(runtime.game.settings.get(MODULE_ID, COLOR_BLIND_MODE_SETTING));
}

/**
 * Updates the current user's mobile view setting through Foundry settings.
 */
export async function setMobileViewEnabled(enabled: boolean): Promise<void> {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) {
    throw new Error(`${MODULE_ID} cannot change settings before Foundry game settings are available.`);
  }

  await runtime.game.settings.set(MODULE_ID, MOBILE_VIEW_ENABLED_SETTING, enabled);
}

/**
 * Updates the current user's mobile character sheet banner preference.
 */
export async function setCharacterSheetBannerEnabled(enabled: boolean): Promise<void> {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) {
    throw new Error(`${MODULE_ID} cannot change settings before Foundry game settings are available.`);
  }

  await runtime.game.settings.set(MODULE_ID, CHARACTER_SHEET_BANNER_ENABLED_SETTING, enabled);
}

/**
 * Updates the current user's color-blind mode preference.
 */
export async function setColorBlindMode(enabled: boolean): Promise<void> {
  const runtime = getFoundryRuntime();
  if (!runtime.game?.settings) {
    throw new Error(`${MODULE_ID} cannot change settings before Foundry game settings are available.`);
  }

  await runtime.game.settings.set(MODULE_ID, COLOR_BLIND_MODE_SETTING, enabled);
}
