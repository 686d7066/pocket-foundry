import { getFoundryRuntime } from "./foundry-globals.ts";

export type LocalizationData = Record<string, unknown>;

/**
 * Localizes a Pocket Foundry-owned string through Foundry, falling back to the
 * canonical English text when translations are unavailable in tests or startup
 * contexts outside the Foundry client.
 */
export function localize(key: string, fallback: string, data: LocalizationData = {}): string {
  const i18n = getFoundryRuntime().game?.i18n;
  if (i18n) {
    const known = typeof i18n.has === "function" ? i18n.has(key, true) : true;
    const localized = known ? i18n.localize(key, data) : key;
    if (localized && localized !== key) return localized;
  }

  return formatFallback(fallback, data);
}

/**
 * Localizes a known system-owned key, falling back to English when the active
 * Foundry context does not expose that system translation.
 */
export function localizeSystemKey(key: string, fallback: string, data: LocalizationData = {}): string {
  const i18n = getFoundryRuntime().game?.i18n;
  const known = typeof i18n?.has === "function" ? i18n.has(key, true) : typeof i18n?.localize === "function";
  if (known && i18n) {
    const localized = i18n.localize(key, data);
    if (localized && localized !== key) return localized;
  }

  return formatFallback(fallback, data);
}

/**
 * Localizes a game-system-owned label only when the system exposes a known
 * translation key. Literal labels supplied by systems or documents pass through.
 */
export function localizeSystemLabel(label: string, fallback: string): string {
  const trimmed = label.trim();
  if (!trimmed) return fallback;
  if (!isLocalizationKey(trimmed)) return trimmed;

  const i18n = getFoundryRuntime().game?.i18n;
  const known = typeof i18n?.has === "function" ? i18n.has(trimmed, true) : typeof i18n?.localize === "function";
  if (known && i18n) {
    const localized = i18n.localize(trimmed);
    if (localized && localized !== trimmed) return localized;
  }

  return fallback;
}

/**
 * Detects Foundry-style localization keys while leaving literal labels alone.
 */
function isLocalizationKey(value: string): boolean {
  return /^[A-Z][A-Z0-9]*(?:\.[A-Za-z0-9_-]+)+$/.test(value);
}

/**
 * Applies Foundry-style named replacement data to fallback English strings.
 */
function formatFallback(template: string, data: LocalizationData): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const value = data[key.trim()];
    return value === undefined || value === null ? match : String(value);
  });
}
