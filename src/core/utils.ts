/**
 * Returns array contents from Foundry collections, arrays, or collection-like
 * objects used by tests.
 */
export function getCollectionContents(value: unknown): unknown[] {
  if (!value) return [];
  if (isIterable(value)) return [...value];

  const contents = getObject(value)?.contents;
  return Array.isArray(contents) ? contents : [];
}

/**
 * Runtime-safe iterable guard for Foundry collections and fixture arrays.
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
  return Boolean(value && typeof value === "object" && Symbol.iterator in value);
}

/**
 * Narrows unknown runtime data to a plain object-like record.
 */
export function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Returns trimmed string values from Foundry system data.
 */
export function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Returns finite numeric values from Foundry system data.
 */
export function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Builds compact initials for character portrait fallbacks.
 */
export function getInitials(name: string, fallback = "C"): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase() ?? "")
    .join("");

  return initials || fallback;
}
