import { booleanLocalStorageCodec, createLocalStorageKey, readLocalStorage, writeLocalStorage, type LocalStorageKey } from "../services/local-storage.ts";
import { getFoundryRuntime } from "./foundry-globals.ts";
import { localize } from "./localization.ts";
import { isProbablyMobileClient } from "./mobile-detection.ts";
import type { MobileShellController } from "./mobile-shell/controller.ts";
import { getMobileViewEnabled, setMobileViewEnabled } from "./settings.ts";

const PROMPT_STORAGE_NAMESPACE = "mobileViewPrompted";
const MOBILE_VIEW_PROMPT_MODAL_ID = "pocket-foundry-mobile-view-prompt";

/**
 * Handles ready-time mobile prompts and settings independently of character-sheet support.
 */
export async function handleReadyMobileLifecycle(shell: MobileShellController): Promise<void> {
  if (isProbablyMobileClient() && !hasPromptedForMobileView()) {
    const wantsMobileView = await requestMobileViewPreference();
    markPromptedForMobileView();

    await setMobileViewEnabled(wantsMobileView);
    await shell.setMobileViewEnabled(wantsMobileView);
    return;
  }

  await shell.setMobileViewEnabled(getMobileViewEnabled());
}

function hasPromptedForMobileView(): boolean {
  return readLocalStorage(getPromptStorageKey()) ?? false;
}

function markPromptedForMobileView(): void {
  writeLocalStorage(getPromptStorageKey(), true);
}

/**
 * Prompting must remain robust on mobile hosts where confirm() is unavailable or
 * intentionally suppressed.
 */
async function requestMobileViewPreference(): Promise<boolean> {
  const promptMessage = localize("POCKETFOUNDRY.MobileView.Prompt.Body", "Use Pocket Foundry's mobile view for this user?");
  return showInAppMobileViewPrompt(promptMessage);
}

/**
 * Show an in-app confirmation prompt so the onboarding flow does not rely on
 * native confirm(), which is unstable on some mobile hosts.
 */
function showInAppMobileViewPrompt(message: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const host = globalThis.document?.body;
    if (!host || !globalThis.document?.createElement) {
      resolve(false);
      return;
    }

    // Ensure a stable container so existing dialog styles apply.
    const existingHost = globalThis.document.getElementById(MOBILE_VIEW_PROMPT_MODAL_ID);
    if (existingHost) existingHost.remove();

    const root = globalThis.document.createElement("div");
    root.id = MOBILE_VIEW_PROMPT_MODAL_ID;
    root.className = "pocket-foundry-root";

    const dialog = globalThis.document.createElement("section");
    dialog.className = "mock-dialog confirm-dialog open";
    dialog.setAttribute("aria-label", localize("POCKETFOUNDRY.MobileView.Prompt.AriaLabel", "Pocket Foundry mobile view"));
    dialog.dataset.prompt = "mobile-view";

    const backdrop = globalThis.document.createElement("button");
    backdrop.className = "dialog-backdrop";
    backdrop.type = "button";
    backdrop.dataset.action = "mobile-view-cancel";
    backdrop.setAttribute("aria-label", localize("POCKETFOUNDRY.MobileView.Prompt.KeepDesktopAriaLabel", "Keep desktop mode"));
    dialog.append(backdrop);

    const panel = globalThis.document.createElement("div");
    panel.className = "confirm-dialog-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const title = globalThis.document.createElement("h2");
    title.textContent = localize("POCKETFOUNDRY.Settings.MobileView.Label", "Mobile View");
    const body = globalThis.document.createElement("p");
    body.textContent = message;

    const actions = globalThis.document.createElement("div");
    actions.className = "dialog-actions";

    const cancel = globalThis.document.createElement("button");
    cancel.type = "button";
    cancel.dataset.action = "mobile-view-cancel";
    cancel.textContent = localize("POCKETFOUNDRY.MobileView.Prompt.KeepDesktop", "Keep Desktop");

    const confirm = globalThis.document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary-action";
    confirm.dataset.action = "mobile-view-confirm";
    confirm.textContent = localize("POCKETFOUNDRY.MobileView.Prompt.UseMobileView", "Use Mobile View");

    actions.append(cancel, confirm);
    panel.append(title, body, actions);
    dialog.append(panel);
    root.append(dialog);
    host.append(root);

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    };
    const cleanup = (): void => {
      globalThis.document?.removeEventListener("keydown", handleEscape);
    };

    const finish = (value: boolean): void => {
      cleanup();
      root.remove();
      resolve(value);
    };

    const handleCancel = (): void => finish(false);
    const handleConfirm = (): void => finish(true);

    backdrop.addEventListener("click", handleCancel, { once: true });
    cancel.addEventListener("click", handleCancel, { once: true });
    confirm.addEventListener("click", handleConfirm, { once: true });

    // If the user dismisses using keyboard focus elsewhere, treat it as
    // opting out to avoid accidental first-time activation.
    globalThis.document.addEventListener("keydown", handleEscape);

    confirm.focus();
  });
}

function getPromptStorageKey(): LocalStorageKey<boolean> {
  const runtime = getFoundryRuntime();
  const worldId = runtime.game?.world?.id ?? "unknown-world";
  const userId = runtime.game?.user?.id ?? "unknown-user";

  return createLocalStorageKey({
    namespace: PROMPT_STORAGE_NAMESPACE,
    scope: [worldId, userId],
    codec: booleanLocalStorageCodec
  });
}
