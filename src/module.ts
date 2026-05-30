import { createMobileShellController } from "./core/mobile-shell/controller.ts";
import { handleReadyMobileLifecycle } from "./core/mobile-startup.ts";
import { registerMobileViewSetting } from "./core/settings.ts";
import { MODULE_ID } from "./core/constants.ts";
import { getCharacterSheetAdapter } from "./systems/character-sheet-adapter-registry.ts";

export { MODULE_ID };

const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;

const BASE_TEMPLATE_PATHS = [
  `${TEMPLATE_ROOT}/module-root.hbs`,
  `${TEMPLATE_ROOT}/shell.hbs`,
  `${TEMPLATE_ROOT}/search.hbs`,
  `${TEMPLATE_ROOT}/recents.hbs`,
  `${TEMPLATE_ROOT}/favorites.hbs`,
  `${TEMPLATE_ROOT}/combat.hbs`,
  `${TEMPLATE_ROOT}/item-detail.hbs`,
  `${TEMPLATE_ROOT}/journal.hbs`,
  `${TEMPLATE_ROOT}/journal-entry.hbs`,
  `${TEMPLATE_ROOT}/journal-page.hbs`,
  `${TEMPLATE_ROOT}/actor-sheet-shell.hbs`,
  `${TEMPLATE_ROOT}/character-picker.hbs`,
  `${TEMPLATE_ROOT}/settings.hbs`,
  `${TEMPLATE_ROOT}/partials/bottom-nav.hbs`,
  `${TEMPLATE_ROOT}/partials/chip.hbs`,
  `${TEMPLATE_ROOT}/partials/content-list-row.hbs`,
  `${TEMPLATE_ROOT}/partials/empty-state.hbs`,
  `${TEMPLATE_ROOT}/partials/expandable-detail-row.hbs`,
  `${TEMPLATE_ROOT}/partials/favorite-basic-group.hbs`,
  `${TEMPLATE_ROOT}/partials/favorite-context-menu.hbs`,
  `${TEMPLATE_ROOT}/partials/fillable-blips.hbs`,
  `${TEMPLATE_ROOT}/partials/meter.hbs`,
  `${TEMPLATE_ROOT}/partials/number-adjust-dialog.hbs`,
  `${TEMPLATE_ROOT}/partials/pane-search-toolbar.hbs`,
  `${TEMPLATE_ROOT}/partials/pane-unavailable.hbs`,
  `${TEMPLATE_ROOT}/partials/pane-rail.hbs`,
  `${TEMPLATE_ROOT}/partials/pill.hbs`,
  `${TEMPLATE_ROOT}/partials/row.hbs`,
  `${TEMPLATE_ROOT}/partials/settings-toggle-row.hbs`,
  `${TEMPLATE_ROOT}/partials/section.hbs`
] as const;

const TEMPLATE_PATHS: string[] = [...BASE_TEMPLATE_PATHS];
const LOADED_ADAPTER_STYLE_PATHS = new Set<string>();

function resolveTemplatePaths(): string[] {
  const adapter = getCharacterSheetAdapter();
  const adapterTemplatePaths = adapter.getTemplatePaths();

  TEMPLATE_PATHS.length = 0;
  TEMPLATE_PATHS.push(...BASE_TEMPLATE_PATHS, ...adapterTemplatePaths);

  return TEMPLATE_PATHS;
}

/**
 * Base module paths plus adapter-owned character sheet template paths loaded at ready.
 */
export function getTemplatePaths(): readonly string[] {
  return TEMPLATE_PATHS;
}

declare global {
  interface Window {
    pocketFoundry?: {
      moduleId: string;
      templatePaths: readonly string[];
      loadTemplates: () => Promise<void>;
      mobileShell: ReturnType<typeof createMobileShellController>;
      historyDebug?: boolean | { enabled?: boolean; events?: unknown[] };
    };
  }
}

type FoundryTemplateLoader = (paths: readonly string[]) => Promise<unknown>;

/**
 * Minimal Foundry hook API used for module lifecycle registration.
 */
type FoundryHooks = {
  once(hook: "init" | "ready", callback: () => void | Promise<void>): void;
};

const foundryRuntime = globalThis as typeof globalThis & {
  Hooks?: FoundryHooks;
  loadTemplates?: FoundryTemplateLoader;
};

const mobileShell = createMobileShellController();

/**
 * Loads all Pocket Foundry Handlebars templates and partials through Foundry.
 */
export async function loadPocketFoundryTemplates(): Promise<void> {
  if (!foundryRuntime.loadTemplates) {
    throw new Error(`${MODULE_ID} cannot load templates before Foundry's template loader is available.`);
  }

  await foundryRuntime.loadTemplates(resolveTemplatePaths());
}

function ensureAdapterStylesLoaded(): void {
  if (typeof document === "undefined") return;

  const adapter = getCharacterSheetAdapter();
  for (const href of adapter.getStylePaths()) {
    if (!href || LOADED_ADAPTER_STYLE_PATHS.has(href)) continue;

    const alreadyLoaded = Array.from(document.querySelectorAll("link[rel='stylesheet']")).some(
      node => node.getAttribute("href") === href
    );
    if (alreadyLoaded) {
      LOADED_ADAPTER_STYLE_PATHS.add(href);
      continue;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head?.appendChild(link);
    LOADED_ADAPTER_STYLE_PATHS.add(href);
  }
}

window.pocketFoundry = {
  moduleId: MODULE_ID,
  templatePaths: TEMPLATE_PATHS,
  loadTemplates: loadPocketFoundryTemplates,
  mobileShell
};

// Register settings during Foundry init, before ready-time UI work.
foundryRuntime.Hooks?.once("init", async () => {
  registerMobileViewSetting(mobileShell);
});

// Load templates and perform ready-time startup after Foundry documents and user state exist.
foundryRuntime.Hooks?.once("ready", async () => {
  ensureAdapterStylesLoaded();
  await loadPocketFoundryTemplates();
  await handleReadyMobileLifecycle(mobileShell);
});


