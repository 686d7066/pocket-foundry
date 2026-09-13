import { MODULE_ID } from "../core/constants.ts";
import { getFoundryRuntime, type FoundrySettings } from "../core/foundry-globals.ts";

export type FoundrySettingValueCodec<T> = {
  parse: (value: unknown) => T | undefined;
  sanitize: (value: T) => T;
};

export type FoundryScopedSettingStorage<T> = {
  read: () => T;
  write: (value: T) => Promise<T>;
  update: (transform: (value: T) => T) => Promise<T>;
};

type FoundrySettingWriteContext = {
  settings: FoundrySettings;
  systemId: string;
  userId: string;
  worldId: string | undefined;
};

const settingWriteQueues = new WeakMap<object, Map<string, Promise<void>>>();

/**
 * Creates a hidden server-side user setting store partitioned by current system and user.
 */
export function createFoundrySystemUserSettingStorage<T>(options: {
  settingKey: string;
  codec: FoundrySettingValueCodec<T>;
  defaultValue: () => T;
}): FoundryScopedSettingStorage<T> {
  const storage: FoundryScopedSettingStorage<T> = {
    read: () => {
      const scope = getCurrentSystemUserScope();
      if (!scope) return options.defaultValue();

      const root = getSettingsRoot(options.settingKey);
      const systemBucket = getPlainRecord(root[scope.systemId]);
      return options.codec.parse(systemBucket?.[scope.userId]) ?? options.defaultValue();
    },
    write: value => storage.update(() => value),
    update: transform => updateFoundrySetting(options, transform)
  };

  return storage;
}

/** Serializes one scoped mutation against the latest persisted setting value. */
async function updateFoundrySetting<T>(
  options: {
    settingKey: string;
    codec: FoundrySettingValueCodec<T>;
    defaultValue: () => T;
  },
  transform: (value: T) => T
): Promise<T> {
  const context = getFoundrySettingWriteContext();
  if (!context) {
    throw new Error(`${MODULE_ID} cannot persist ${options.settingKey} without an active Foundry settings, system, and user scope.`);
  }

  return enqueueFoundrySettingWrite(context.settings, options.settingKey, async () => {
    assertCurrentFoundrySettingWriteContext(context, options.settingKey);
    const root = { ...getSettingsRootFrom(context.settings, options.settingKey) };
    const systemBucket = { ...(getPlainRecord(root[context.systemId]) ?? {}) };
    const currentValue = options.codec.parse(systemBucket[context.userId]) ?? options.defaultValue();
    const serializedCurrentValue = JSON.stringify(currentValue);
    const nextValue = options.codec.sanitize(transform(currentValue));
    if (serializedCurrentValue === JSON.stringify(nextValue)) return nextValue;
    systemBucket[context.userId] = nextValue;
    root[context.systemId] = systemBucket;

    assertCurrentFoundrySettingWriteContext(context, options.settingKey);
    await context.settings.set(MODULE_ID, options.settingKey, root);
    return nextValue;
  });
}

/** Queues writes sharing one Foundry settings backend and registered key. */
function enqueueFoundrySettingWrite<T>(settings: FoundrySettings, settingKey: string, task: () => Promise<T>): Promise<T> {
  let queues = settingWriteQueues.get(settings);
  if (!queues) {
    queues = new Map();
    settingWriteQueues.set(settings, queues);
  }

  const previous = queues.get(settingKey) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(task);
  const barrier = operation.then(() => undefined, () => undefined);
  queues.set(settingKey, barrier);
  void barrier.then(() => {
    if (queues?.get(settingKey) === barrier) queues.delete(settingKey);
  });
  return operation;
}

/** Captures the runtime identity that owns a queued scoped-setting write. */
function getFoundrySettingWriteContext(): FoundrySettingWriteContext | null {
  const runtime = getFoundryRuntime();
  const scope = getCurrentSystemUserScope();
  const settings = runtime.game?.settings;
  if (!scope || !settings) return null;

  return {
    settings,
    ...scope,
    worldId: runtime.game?.world?.id?.trim()
  };
}

/** Prevents a queued mutation from crossing a runtime user or world change. */
function assertCurrentFoundrySettingWriteContext(context: FoundrySettingWriteContext, settingKey: string): void {
  const runtime = getFoundryRuntime();
  if (
    runtime.game?.settings !== context.settings
    || runtime.game?.system?.id?.trim() !== context.systemId
    || runtime.game?.user?.id?.trim() !== context.userId
    || runtime.game?.world?.id?.trim() !== context.worldId
  ) {
    throw new Error(`${MODULE_ID} cancelled a queued ${settingKey} write because the active Foundry scope changed.`);
  }
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
  return settings ? getSettingsRootFrom(settings, settingKey) : {};
}

/** Reads and narrows one complete persisted setting root. */
function getSettingsRootFrom(settings: FoundrySettings, settingKey: string): Record<string, unknown> {
  return getPlainRecord(settings.get(MODULE_ID, settingKey)) ?? {};
}

function getPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
