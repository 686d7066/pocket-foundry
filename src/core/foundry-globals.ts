/**
 * Supported Foundry setting scopes used by this module.
 */
export type FoundrySettingScope = "client" | "user" | "world";

/**
 * Minimal game.settings.register configuration used by Pocket Foundry settings.
 */
export type FoundrySettingConfig<T> = {
  name: string;
  hint: string;
  scope: FoundrySettingScope;
  config: boolean;
  type: BooleanConstructor;
  default: T;
  onChange?: (value: T) => void | Promise<void>;
};

/**
 * Minimal Foundry settings API surface used by the module.
 */
export type FoundrySettings = {
  register<T>(namespace: string, key: string, config: FoundrySettingConfig<T>): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
};

/**
 * Minimal Foundry actor collection shape used by character picker fixtures and runtime wiring.
 */
export type FoundryActorCollection = Iterable<unknown> & {
  contents?: unknown[];
  filter?: (condition: (actor: unknown, index: number) => unknown) => unknown[];
};

/**
 * Minimal Foundry game object shape consumed by this module.
 */
export type FoundryGame = {
  settings: FoundrySettings;
  actors?: FoundryActorCollection;
  folders?: FoundryActorCollection;
  items?: FoundryActorCollection;
  journal?: FoundryActorCollection;
  packs?: Iterable<unknown> & { contents?: unknown[] };
  user?: {
    id?: string;
  };
  system?: {
    id?: string;
  };
  world?: {
    id?: string;
  };
};

/**
 * Foundry Handlebars rendering function.
 */
export type FoundryRenderTemplate = (path: string, data: object) => Promise<string>;

/**
 * Minimal text enrichment API used by mobile-native read-only detail views.
 */
export type FoundryTextEditor = {
  enrichHTML?: (content: string, options?: Record<string, unknown>) => Promise<string> | string;
};

/**
 * Narrowed global runtime shape for Foundry APIs used by Pocket Foundry.
 */
export type FoundryRuntime = typeof globalThis & {
  game?: FoundryGame;
  foundry?: {
    utils?: {
      fromUuid?: (uuid: string) => Promise<unknown>;
      fromUuidSync?: (uuid: string) => unknown;
      parseUuid?: (uuid: string, options?: { relative?: unknown }) => {
        type?: string;
        documentType?: string;
        primaryType?: string;
        uuid: string;
      } | null;
    };
  };
  TextEditor?: FoundryTextEditor;
  renderTemplate?: FoundryRenderTemplate;
};

/**
 * Returns globalThis narrowed to the Foundry APIs this module uses.
 */
export function getFoundryRuntime(): FoundryRuntime {
  return globalThis as FoundryRuntime;
}
