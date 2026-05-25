import { MODULE_ID } from "../core/constants.ts";

/**
 * Parser and serializer pair for typed localStorage values.
 */
export type LocalStorageCodec<T> = {
  parse: (value: string) => T | undefined;
  serialize: (value: T) => string;
};

/**
 * Typed localStorage key definition with a fully-qualified storage key.
 */
export type LocalStorageKey<T> = LocalStorageCodec<T> & {
  key: string;
};

/**
 * Creates a module-scoped localStorage key from a feature namespace and optional scope parts.
 */
export function createLocalStorageKey<T>(options: {
  namespace: string;
  scope?: Array<string | undefined>;
  codec: LocalStorageCodec<T>;
}): LocalStorageKey<T> {
  const scopeParts = options.scope?.map(normalizeScopePart).filter(Boolean) ?? [];

  return {
    key: [MODULE_ID, options.namespace, ...scopeParts].join("."),
    parse: options.codec.parse,
    serialize: options.codec.serialize
  };
}

/**
 * Reads and parses a typed localStorage value.
 */
export function readLocalStorage<T>(definition: LocalStorageKey<T>): T | undefined {
  try {
    const value = globalThis.localStorage?.getItem(definition.key);
    return value === null || value === undefined ? undefined : definition.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Serializes and writes a typed localStorage value.
 */
export function writeLocalStorage<T>(definition: LocalStorageKey<T>, value: T): void {
  try {
    globalThis.localStorage?.setItem(definition.key, definition.serialize(value));
  } catch {
    // Browser privacy modes and embedded webviews can reject localStorage writes.
  }
}

/**
 * Boolean codec for localStorage feature flags.
 */
export const booleanLocalStorageCodec: LocalStorageCodec<boolean> = {
  parse: value => (value === "true" ? true : value === "false" ? false : undefined),
  serialize: value => (value ? "true" : "false")
};

/**
 * Non-empty string codec for UUIDs and other exact identifiers.
 */
export const nonEmptyStringLocalStorageCodec: LocalStorageCodec<string> = {
  parse: value => {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  serialize: value => value
};

function normalizeScopePart(value: string | undefined): string {
  return value?.trim() || "unknown";
}
