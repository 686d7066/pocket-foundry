import { MODULE_ID } from "../core/constants.ts";
import { getFoundryRuntime } from "../core/foundry-globals.ts";

export type FoundrySettingValueCodec<T> = {
  parse: (value: unknown) => T | undefined;
  sanitize: (value: T) => T;
};

export type FoundryScopedSettingStorage<T> = {
  read: () => T;
  write: (value: T) => Promise<T>;
};

/**
 * Creates a hidden server-side user setting store partitioned by current system and user.
 */
export function createFoundrySystemUserSettingStorage<T>(options: {
  settingKey: string;
  codec: FoundrySettingValueCodec<T>;
  defaultValue: () => T;
}): FoundryScopedSettingStorage<T> {
  return {
    read: () => {
      const scope = getCurrentSystemUserScope();
      if (!scope) return options.defaultValue();

      const root = getSettingsRoot(options.settingKey);
      const systemBucket = getPlainRecord(root[scope.systemId]);
      return options.codec.parse(systemBucket?.[scope.userId]) ?? options.defaultValue();
    },
    write: async value => {
      const sanitized = options.codec.sanitize(value);
      const scope = getCurrentSystemUserScope();
      const settings = getFoundryRuntime().game?.settings;
      if (!scope || !settings) return sanitized;

      const root = { ...getSettingsRoot(options.settingKey) };
      const systemBucket = { ...(getPlainRecord(root[scope.systemId]) ?? {}) };
      systemBucket[scope.userId] = sanitized;
      root[scope.systemId] = systemBucket;

      try {
        await settings.set(MODULE_ID, options.settingKey, root);
      } catch (error) {
        globalThis.console?.warn?.(`${MODULE_ID} could not persist ${options.settingKey} to Foundry settings.`, error);
      }

      return sanitized;
    }
  };
}

function getCurrentSystemUserScope(): { systemId: string; userId: string } | null {
  const runtime = getFoundryRuntime();
  const systemId = runtime.game?.system?.id?.trim();
  const userId = runtime.game?.user?.id?.trim();
  if (!systemId || !userId) return null;

  return { systemId, userId };
}

function getSettingsRoot(settingKey: string): Record<string, unknown> {
  const settings = getFoundryRuntime().game?.settings;
  return getPlainRecord(settings?.get(MODULE_ID, settingKey)) ?? {};
}

function getPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
