import type { foundry } from "fvtt-types";

/**
 * Optional field surface keyed from a Foundry data type while allowing this
 * module's lightweight document fixtures to provide their own value shapes.
 */
export type FoundryDataShape<T extends object> = Partial<Record<keyof T, unknown>> & {
  _id?: string | null;
  category?: string | null;
  description?: string;
  disabled?: boolean;
  documentName?: string;
  flags?: Record<string, unknown>;
  id?: string | null;
  img?: string | null;
  image?: Record<string, unknown>;
  initiative?: number | null;
  name?: string;
  round?: number | null;
  sort?: number;
  src?: string | null;
  system?: unknown;
  title?: Record<string, unknown>;
  turn?: number | null;
  type?: string;
  uuid?: string;
  video?: Record<string, unknown>;
};

/**
 * Minimal game.settings.register configuration used by Pocket Foundry settings.
 */
export type FoundrySettingConfig<T> = Omit<foundry.types.SettingConfig, "key" | "namespace" | "type" | "default" | "onChange"> & {
  key?: string;
  namespace?: string;
  type: BooleanConstructor | ObjectConstructor | foundry.types.SettingConfig["type"];
  default: T;
  onChange?: (value: T) => void | Promise<void>;
};

/**
 * Minimal Foundry settings API surface used by the module.
 */
export type FoundrySettings = {
  register<T>(namespace: string, key: string, config: FoundrySettingConfig<T>): void;
  get: foundry.helpers.ClientSettings["get"];
  set: foundry.helpers.ClientSettings["set"];
};

export type FoundryDocumentCollection = foundry.utils.Collection<string, unknown> | readonly unknown[] | {
  contents?: readonly unknown[];
  filter?: (condition: (document: unknown, index: number) => unknown) => unknown[];
};

/**
 * Minimal Foundry game object shape consumed by this module.
 */
export type FoundryGame = Partial<foundry.Game> & {
  settings: FoundrySettings;
  i18n?: {
    localize: (stringId: string, data?: Record<string, unknown>) => string;
    has?: (stringId: string, fallback?: boolean) => boolean;
  };
  logOut?: () => void;
  actors?: FoundryDocumentCollection;
  folders?: FoundryDocumentCollection;
  items?: FoundryDocumentCollection;
  journal?: FoundryDocumentCollection;
  packs?: FoundryDocumentCollection;
  user?: {
    id?: string;
    can?: (permission: string) => boolean;
    hasPermission?: (permission: string) => boolean;
    isGM?: boolean;
  };
  system?: {
    id?: string;
  };
  world?: {
    id?: string;
  };
};

/**
 * Narrowed global runtime shape for Foundry APIs used by Pocket Foundry.
 */
export type FoundryRuntime = Omit<typeof globalThis, "ActiveEffect" | "CONFIG" | "FilePicker" | "Hooks" | "JournalEntryPage" | "TextEditor" | "foundry" | "game" | "loadTemplates" | "renderTemplate" | "ui"> & {
  ActiveEffect?: typeof foundry.documents.ActiveEffect;
  CONFIG?: typeof globalThis.CONFIG & Record<string, unknown> & {
    specialStatusEffects?: unknown;
  };
  FilePicker?: unknown;
  Hooks?: Pick<typeof foundry.helpers.Hooks, "once">;
  JournalEntryPage?: typeof foundry.documents.JournalEntryPage;
  game?: FoundryGame;
  foundry?: {
    applications?: typeof foundry.applications;
    utils?: Partial<Pick<typeof foundry.utils, "fromUuid" | "fromUuidSync" | "parseUuid">>;
  };
  fromUuid?: (uuid: string, options?: Record<string, unknown>) => Promise<unknown>;
  loadTemplates?: typeof foundry.applications.handlebars.loadTemplates;
  TextEditor?: Pick<typeof foundry.applications.ux.TextEditor, "enrichHTML">;
  renderTemplate?: typeof foundry.applications.handlebars.renderTemplate;
  ui?: typeof foundry.ui;
};

/**
 * Returns globalThis narrowed to the Foundry APIs this module uses.
 */
export function getFoundryRuntime(): FoundryRuntime {
  return globalThis as unknown as FoundryRuntime;
}

/** Resolves the configured editor without touching Foundry's deprecated global getter. */
export function getFoundryTextEditor(): FoundryRuntime["TextEditor"] {
  const runtime = getFoundryRuntime();
  return runtime.foundry?.applications?.ux?.TextEditor?.implementation ?? runtime.TextEditor;
}

/** Resolves template APIs together without reading deprecated globals in Foundry. */
export function getFoundryHandlebars(): Pick<FoundryRuntime, "renderTemplate" | "loadTemplates"> {
  const runtime = getFoundryRuntime();
  return runtime.foundry?.applications?.handlebars ?? runtime;
}
