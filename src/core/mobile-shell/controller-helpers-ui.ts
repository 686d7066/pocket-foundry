import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { localize } from "../localization.ts";
import type { ConfirmationDialogOptions } from "./types.ts";

const SHELL_ACTION_ERROR_DIALOG_ID = "shell-action-error";

export type ShellActionErrorKind =
  | "character"
  | "journal"
  | "navigation"
  | "render"
  | "search"
  | "settings"
  | "storage"
  | "unknown";


export function consumeShellActionEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/**
 * Reports an unexpected shell action failure with a user-safe primary message
 * and expandable technical details for debugging.
 */
export function reportShellActionError(
  root: HTMLElement | undefined,
  error: unknown,
  options: { kind?: ShellActionErrorKind; action?: string; userMessage?: string } = {}
): void {
  const message = options.userMessage ?? getShellActionErrorMessage(options.kind ?? "unknown");
  const detail = formatShellActionErrorDetail(error);
  globalThis.console?.error?.(`${MODULE_ID} ${options.action ?? "shell action"} failed.`, error);
  notifyShellActionError(message);
  if (root) openShellActionErrorDialog(root, message, detail);
}

/**
 * Runs async work from non-async DOM callbacks without leaving rejected
 * promises unhandled.
 */
export function runHandledShellTask(
  root: HTMLElement | undefined,
  task: Promise<unknown>,
  options: { kind?: ShellActionErrorKind; action?: string; userMessage?: string } = {}
): void {
  void task.catch(error => reportShellActionError(root, error, options));
}

export async function awaitHandledShellTask(
  root: HTMLElement | undefined,
  task: Promise<unknown>,
  options: { kind?: ShellActionErrorKind; action?: string; userMessage?: string } = {}
): Promise<void> {
  try {
    await task;
  } catch (error) {
    reportShellActionError(root, error, options);
  }
}

export function closeShellActionErrorDialog(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(`[data-shell-action-error-dialog='${SHELL_ACTION_ERROR_DIALOG_ID}']`).forEach(dialog => dialog.remove());
}

function openShellActionErrorDialog(root: HTMLElement, message: string, detail: string): void {
  closeShellActionErrorDialog(root);
  const modalHost = root.querySelector<HTMLElement>(".pocket-foundry-root") ?? root;
  const dialog = document.createElement("section");
  dialog.className = "mock-dialog shell-action-error-dialog open";
  dialog.setAttribute("aria-label", localize("POCKETFOUNDRY.Error.ActionFailed.Aria", "Pocket Foundry action failed"));
  dialog.dataset.shellActionErrorDialog = SHELL_ACTION_ERROR_DIALOG_ID;

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = "shell-error-close";
  backdrop.setAttribute("aria-label", localize("POCKETFOUNDRY.Action.Close", "Close"));
  dialog.append(backdrop);

  const panel = document.createElement("div");
  panel.className = "confirm-dialog-panel shell-action-error-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = localize("POCKETFOUNDRY.Error.ActionFailed.Title", "Action Failed");
  const body = document.createElement("p");
  body.textContent = message;
  panel.append(title, body);

  if (detail) {
    const details = document.createElement("details");
    details.className = "shell-action-error-details";
    const summary = document.createElement("summary");
    summary.textContent = localize("POCKETFOUNDRY.Error.DetailedInformation", "Detailed information");
    const pre = document.createElement("pre");
    pre.textContent = detail;
    details.append(summary, pre);
    panel.append(details);
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "primary-action";
  close.dataset.action = "shell-error-close";
  close.textContent = localize("POCKETFOUNDRY.Action.Close", "Close");
  actions.append(close);
  panel.append(actions);

  dialog.append(panel);
  modalHost.append(dialog);
  close.focus();
}

export function getShellActionErrorMessage(kind: ShellActionErrorKind): string {
  switch (kind) {
    case "character":
      return localize("POCKETFOUNDRY.Error.CharacterAction", "The character action could not be completed. Check your permissions and try again.");
    case "journal":
      return localize("POCKETFOUNDRY.Error.JournalAction", "The journal change could not be completed. Check your permissions and try again.");
    case "navigation":
      return localize("POCKETFOUNDRY.Error.Navigation", "The requested view could not be opened. The document may have changed or become unavailable.");
    case "render":
      return localize("POCKETFOUNDRY.Error.Refresh", "Pocket Foundry could not refresh the mobile view. Try again or reload the page.");
    case "search":
      return localize("POCKETFOUNDRY.Error.Search", "Search could not be updated. Try again.");
    case "settings":
      return localize("POCKETFOUNDRY.Error.Setting", "That setting could not be updated. Try again or reload the world.");
    case "storage":
      return localize("POCKETFOUNDRY.Error.Storage", "Your Pocket Foundry data could not be saved. Try again or reload the world.");
    case "unknown":
      return localize("POCKETFOUNDRY.Error.Generic", "The action could not be completed. Try again or reload the page.");
  }
}

function notifyShellActionError(message: string): void {
  const notifications = getFoundryRuntime().ui?.notifications;
  if (typeof notifications?.error === "function") {
    notifications.error(message);
    return;
  }
  notifications?.warn?.(message);
}

function formatShellActionErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "";
  return String(error);
}

/**
 * Opens a modal action sheet from the hidden row-level favorite actions.
 */
export function openFavoriteContextMenu(root: HTMLElement, row: HTMLElement): void {
  closeFavoriteContextMenu(root);
  const sourceActions = [...row.querySelectorAll<HTMLButtonElement>(".favorite-context-menu button[data-action]")];
  if (sourceActions.length === 0) return;
  const modalHost = root.querySelector<HTMLElement>(".pocket-foundry-root") ?? root;

  const label = row.querySelector<HTMLElement>(".row-title strong, .sheet-row-title strong, .item-card-title strong, summary strong, strong")?.textContent?.trim()
    || row.getAttribute("aria-label")
    || localize("POCKETFOUNDRY.Favorites.Fallback", "Favorite");
  const dialog = document.createElement("section");
  dialog.className = "mock-dialog favorite-action-sheet open";
  dialog.setAttribute("aria-label", `${label} favorite actions`);
  dialog.dataset.favoriteActionSheet = "true";

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = "favorite-context-close";
  backdrop.setAttribute("aria-label", localize("POCKETFOUNDRY.Action.Close", "Close"));
  dialog.append(backdrop);

  const sheet = document.createElement("div");
  sheet.className = "favorite-action-panel";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = label;
  sheet.append(title);

  const actions = document.createElement("div");
  actions.className = "favorite-action-list";
  for (const sourceAction of sourceActions) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "favorite-action-button";
    action.textContent = sourceAction.textContent?.trim() || localize("POCKETFOUNDRY.Favorites.Action", "Favorite Action");
    action.setAttribute("data-swipe-ignore", "");
    for (const [key, value] of Object.entries(sourceAction.dataset)) {
      action.dataset[key] = value;
    }
    actions.append(action);
  }
  sheet.append(actions);

  const cancel = document.createElement("button");
  cancel.className = "favorite-action-cancel";
  cancel.type = "button";
  cancel.dataset.action = "favorite-context-close";
  cancel.textContent = localize("POCKETFOUNDRY.Action.Cancel", "Cancel");
  sheet.append(cancel);

  dialog.append(sheet);
  modalHost.append(dialog);
  sheet.querySelector<HTMLElement>(".favorite-action-button")?.focus();
}

export function closeFavoriteContextMenu(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-favorite-action-sheet='true']").forEach(dialog => dialog.remove());
}

/**
 * Opens a reusable confirmation dialog with caller-provided actions and data.
 */
export function openConfirmationDialog(root: HTMLElement, options: ConfirmationDialogOptions): HTMLElement {
  closeConfirmationDialog(root, options.id);

  const modalHost = root.querySelector<HTMLElement>(".pocket-foundry-root") ?? root;
  const dialog = document.createElement("section");
  dialog.className = "mock-dialog confirm-dialog open";
  dialog.setAttribute("aria-label", options.title);
  dialog.dataset.confirmDialog = options.id;
  for (const [key, value] of Object.entries(options.data ?? {})) dialog.dataset[key] = value;

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = options.cancelAction;
  backdrop.setAttribute("aria-label", localize("POCKETFOUNDRY.Action.Cancel", "Cancel"));
  dialog.append(backdrop);

  const panel = document.createElement("div");
  panel.className = "confirm-dialog-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = options.title;
  const body = document.createElement("p");
  body.textContent = options.body;
  panel.append(title, body);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.dataset.action = options.cancelAction;
  cancel.textContent = localize("POCKETFOUNDRY.Action.Cancel", "Cancel");
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = options.danger ? "primary-action danger-action" : "primary-action";
  confirm.dataset.action = options.confirmAction;
  confirm.textContent = options.confirmLabel;
  actions.append(cancel, confirm);
  panel.append(actions);

  dialog.append(panel);
  modalHost.append(dialog);
  cancel.focus();
  return dialog;
}

export function closeConfirmationDialog(root: HTMLElement, id: string): void {
  root.querySelectorAll<HTMLElement>(`[data-confirm-dialog='${CSS.escape(id)}']`).forEach(dialog => dialog.remove());
}

