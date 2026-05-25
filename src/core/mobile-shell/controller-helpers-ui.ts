import {
    getPocketFoundryRouteFromHash,
    isPocketFoundryHistoryState,
    writePocketFoundryHistoryEntry
} from "../../router/browser-history.ts";
import { type MobileRouter } from "../../router/mobile-router.ts";
import { RouteView, type MobileRoute } from "../../router/routes.ts";
import {
    type JournalPageDraft
} from "../../services/journal.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { notifyJournalMutationUnavailable } from "./controller-helpers-navigation.ts";
import { createFoundryJournalService, normalizeCharacterRoutePanes, renderShell } from "./controller-helpers-shell.ts";
import type { ConfirmationDialogOptions, SearchUiState } from "./types.ts";

const HISTORY_DEBUG_STORAGE_KEY = `${MODULE_ID}.historyDebug`;
const JOURNAL_MEDIA_UPLOAD_SOURCE = "data";
const JOURNAL_MEDIA_UPLOAD_PATH = `uploads/${MODULE_ID}/journal`;
export let browserHistoryActive = false;
let browserHistorySequence = 0;
let originalConfirm: ((message?: string) => boolean) | undefined;


export function consumeShellActionEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function openFavoriteContextMenu(root: HTMLElement, row: HTMLElement): void {
  closeFavoriteContextMenu(root);
  const sourceActions = [...row.querySelectorAll<HTMLButtonElement>(".favorite-context-menu button[data-action]")];
  if (sourceActions.length === 0) return;
  const modalHost = root.querySelector<HTMLElement>(".pocket-foundry-root") ?? root;

  const label = row.querySelector<HTMLElement>(".row-title strong, .sheet-row-title strong, .item-card-title strong, summary strong, strong")?.textContent?.trim()
    || row.getAttribute("aria-label")
    || "Favorite";
  const dialog = document.createElement("section");
  dialog.className = "mock-dialog favorite-action-sheet open";
  dialog.setAttribute("aria-label", `${label} favorite actions`);
  dialog.dataset.favoriteActionSheet = "true";

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = "favorite-context-close";
  backdrop.setAttribute("aria-label", "Close");
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
    action.textContent = sourceAction.textContent?.trim() || "Favorite Action";
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
  cancel.textContent = "Cancel";
  sheet.append(cancel);

  dialog.append(sheet);
  modalHost.append(dialog);
  sheet.querySelector<HTMLElement>(".favorite-action-button")?.focus();
}

export function closeFavoriteContextMenu(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-favorite-action-sheet='true']").forEach(dialog => dialog.remove());
}

export async function openJournalPageDraftDialog(
  root: HTMLElement,
  options: { mode: "create"; entryUuid: string } | { mode: "edit"; entryUuid: string; pageUuid: string }
): Promise<void> {
  closeJournalPageDraftDialog(root);

  const initialDraft = options.mode === "edit"
    ? await getJournalPageDraftForEdit(options.pageUuid, options.entryUuid)
    : { name: "", type: "text" as const, textContent: "", src: "" };
  if (!initialDraft) {
    notifyJournalMutationUnavailable("unsupported");
    return;
  }

  const modalHost = root.querySelector<HTMLElement>(".pocket-foundry-root") ?? root;
  const dialog = document.createElement("section");
  dialog.className = "mock-dialog journal-page-draft-dialog open";
  dialog.setAttribute("aria-label", options.mode === "create" ? "Create journal page" : "Edit journal page");
  dialog.dataset.journalPageDraftDialog = "true";

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = "journal-close-page-dialog";
  backdrop.setAttribute("aria-label", "Close");
  dialog.append(backdrop);

  const form = document.createElement("form");
  form.className = "journal-page-form-panel";
  form.dataset.journalPageDraftForm = "true";
  form.dataset.entryUuid = options.entryUuid;
  if (options.mode === "edit") form.dataset.pageUuid = options.pageUuid;
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = options.mode === "create" ? "Create Page" : "Edit Page";
  form.append(title);

  form.append(createJournalTextInput("Name", "name", initialDraft.name));
  form.append(createJournalPageTypeSelect(initialDraft.type, getJournalPageDraftTypesForDialog(initialDraft.type, options.mode)));
  form.append(createJournalTextarea("Text Content", "textContent", initialDraft.textContent ?? "", "text"));
  form.append(createJournalFileInput(initialDraft.type, initialDraft.src ?? ""));

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.dataset.action = "journal-close-page-dialog";
  cancel.textContent = "Cancel";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary-action";
  save.dataset.action = "journal-save-page-draft";
  save.textContent = options.mode === "create" ? "Create" : "Save";
  actions.append(cancel, save);
  form.append(actions);

  dialog.append(form);
  modalHost.append(dialog);
  updateJournalPageDraftFields(form);
  form.querySelector<HTMLInputElement>("[name='name']")?.focus();
}

export async function getJournalPageDraftForEdit(pageUuid: string, entryUuid: string): Promise<JournalPageDraft | null> {
  const page = await createFoundryJournalService().lookupPage(pageUuid, entryUuid);
  if (page.unavailable || page.pageType === "unsupported") return null;

  return {
    name: page.name,
    type: page.pageType,
    textContent: page.pageType === "text" ? journalHtmlToPlainText(page.textSource) : "",
    src: page.pageType === "text" ? "" : page.src
  };
}

export function closeJournalPageDraftDialog(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-journal-page-draft-dialog='true']").forEach(dialog => dialog.remove());
}

export function openJournalPageDeleteDialog(root: HTMLElement, entryUuid: string, pageUuid: string): void {
  openConfirmationDialog(root, {
    id: "journal-page-delete",
    title: "Delete Page",
    body: "Delete this journal page?",
    confirmLabel: "Delete",
    confirmAction: "journal-confirm-delete-page",
    cancelAction: "journal-close-delete-dialog",
    danger: true,
    data: { entryUuid, pageUuid }
  });
}

export function closeJournalPageDeleteDialog(root: HTMLElement): void {
  closeConfirmationDialog(root, "journal-page-delete");
}

export function openConfirmationDialog(root: HTMLElement, options: ConfirmationDialogOptions): void {
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
  backdrop.setAttribute("aria-label", "Cancel");
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
  cancel.textContent = "Cancel";
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
}

export function closeConfirmationDialog(root: HTMLElement, id: string): void {
  root.querySelectorAll<HTMLElement>(`[data-confirm-dialog='${CSS.escape(id)}']`).forEach(dialog => dialog.remove());
}

export function createJournalTextInput(labelText: string, name: string, value: string): HTMLElement {
  const label = document.createElement("label");
  label.className = "journal-page-form-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.value = value;
  input.autocomplete = "off";
  label.append(span, input);
  return label;
}

export function createJournalTextarea(labelText: string, name: string, value: string, pageType: JournalPageDraft["type"]): HTMLElement {
  const label = document.createElement("label");
  label.className = "journal-page-form-field";
  label.dataset.journalDraftField = pageType;
  const span = document.createElement("span");
  span.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.value = value;
  textarea.rows = 8;
  label.append(span, textarea);
  return label;
}

export function createJournalPageTypeSelect(value: JournalPageDraft["type"], types: JournalPageDraft["type"][]): HTMLElement {
  const label = document.createElement("label");
  label.className = "journal-page-form-field";
  const span = document.createElement("span");
  span.textContent = "Type";
  const select = document.createElement("select");
  select.name = "type";
  select.dataset.journalPageTypeSelect = "true";
  const labels: Record<JournalPageDraft["type"], string> = { text: "Text", image: "Image", pdf: "PDF", video: "Video" };
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = labels[type];
    option.selected = type === value;
    select.append(option);
  }
  label.append(span, select);
  return label;
}

export function getJournalPageDraftTypesForDialog(currentType: JournalPageDraft["type"], mode: "create" | "edit"): JournalPageDraft["type"][] {
  const types: JournalPageDraft["type"][] = ["text"];
  if (canUploadJournalPageMedia()) types.push("image", "pdf", "video");
  else if (mode === "edit" && currentType !== "text") types.push(currentType);
  return types;
}

export function createJournalFileInput(type: JournalPageDraft["type"], src: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "journal-page-form-field journal-page-media-field";
  wrapper.dataset.journalDraftField = "media";

  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = "Media File";
  const input = document.createElement("input");
  input.type = "file";
  input.name = "mediaFile";
  input.accept = getJournalMediaAccept(type);
  input.dataset.journalMediaFileInput = "true";
  label.append(span, input);

  const source = document.createElement("input");
  source.type = "hidden";
  source.name = "src";
  source.value = src;

  wrapper.append(label, source);
  return wrapper;
}

export async function getJournalPageDraftFromForm(form: HTMLFormElement): Promise<JournalPageDraft | null> {
  delete form.dataset.journalUploadFailed;
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const type = String(data.get("type") ?? "");
  if (!name || !isJournalPageDraftType(type)) return null;

  if (type !== "text") {
    const file = data.get("mediaFile");
    const uploadedSource = file instanceof File && file.size > 0 ? await uploadJournalPageMediaFile(file) : "";
    if (file instanceof File && file.size > 0 && !uploadedSource) form.dataset.journalUploadFailed = "true";
    const src = uploadedSource || String(data.get("src") ?? "").trim();
    if (!src) return null;
    return { name, type, src };
  }

  return {
    name,
    type,
    textContent: String(data.get("textContent") ?? "")
  };
}

export function isJournalPageDraftType(type: string): type is JournalPageDraft["type"] {
  return type === "text" || type === "image" || type === "pdf" || type === "video";
}

export function updateJournalPageDraftFields(form: HTMLFormElement | null): void {
  if (!form) return;
  const type = form.querySelector<HTMLSelectElement>("[data-journal-page-type-select]")?.value ?? "text";
  form.querySelectorAll<HTMLElement>("[data-journal-draft-field]").forEach(field => {
    const fieldType = field.dataset.journalDraftField;
    const visible = fieldType === type || (fieldType === "media" && type !== "text");
    field.hidden = !visible;
  });

  const fileInput = form.querySelector<HTMLInputElement>("[data-journal-media-file-input]");
  if (fileInput && isJournalPageDraftType(type)) fileInput.accept = getJournalMediaAccept(type);
}

export function getJournalMediaAccept(type: JournalPageDraft["type"]): string {
  switch (type) {
    case "image":
      return "image/*";
    case "pdf":
      return "application/pdf,.pdf";
    case "video":
      return "video/*";
    case "text":
      return "";
  }
}

export function canUploadJournalPageMedia(): boolean {
  const user = getFoundryRuntime().game?.user as {
    can?: (permission: string) => boolean;
    hasPermission?: (permission: string) => boolean;
  } | null | undefined;
  return userCan(user, "FILES_BROWSE") && userCan(user, "FILES_UPLOAD");
}

export function userCan(user: { can?: (permission: string) => boolean; hasPermission?: (permission: string) => boolean } | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (typeof user.can === "function") return user.can(permission) !== false;
  if (typeof user.hasPermission === "function") return user.hasPermission(permission) !== false;
  return false;
}

export async function uploadJournalPageMediaFile(file: File): Promise<string> {
  const filePicker = getFoundryFilePicker();
  if (!filePicker) {
    globalThis.console?.error?.(`${MODULE_ID} cannot upload journal page media because Foundry FilePicker upload APIs were not found.`);
    return "";
  }

  try {
    await ensureJournalMediaUploadDirectory(filePicker);
    const uploaded = await filePicker.upload(JOURNAL_MEDIA_UPLOAD_SOURCE, JOURNAL_MEDIA_UPLOAD_PATH, file, {}, { notify: true });
    return getUploadedFilePath(uploaded);
  } catch (error) {
    globalThis.console?.error?.(`${MODULE_ID} failed to upload journal page media.`, error);
    return "";
  }
}

type FoundryFilePickerUploadApi = {
  createDirectory?: (source: string, target: string, options?: Record<string, unknown>) => Promise<unknown>;
  upload: (source: string, path: string, file: File, body?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
};

export function getFoundryFilePicker(): FoundryFilePickerUploadApi | null {
  const runtime = getFoundryRuntime() as ReturnType<typeof getFoundryRuntime> & {
    foundry?: {
      applications?: {
        apps?: {
          FilePicker?: FoundryFilePickerUploadApi & {
            implementation?: unknown;
          };
        };
      };
    };
    FilePicker?: unknown;
  };
  const filePickerClass = runtime.foundry?.applications?.apps?.FilePicker as unknown;
  const filePickerImplementation = hasObjectShape(filePickerClass)
    ? (filePickerClass as { implementation?: unknown }).implementation
    : undefined;
  const picker = hasFilePickerUploadApi(filePickerClass)
    ? filePickerClass
    : filePickerImplementation ?? runtime.FilePicker;
  return hasFilePickerUploadApi(picker) ? picker : null;
}

export function hasFilePickerUploadApi(value: unknown): value is FoundryFilePickerUploadApi {
  return hasObjectShape(value)
    && typeof (value as FoundryFilePickerUploadApi).upload === "function";
}

export function hasObjectShape(value: unknown): value is object {
  return !!value && (typeof value === "object" || typeof value === "function");
}

export async function ensureJournalMediaUploadDirectory(filePicker: FoundryFilePickerUploadApi): Promise<void> {
  if (typeof filePicker.createDirectory !== "function") return;
  const segments = JOURNAL_MEDIA_UPLOAD_PATH.split("/");
  for (let index = 1; index <= segments.length; index += 1) {
    await createFoundryDataDirectoryIfMissing(filePicker, segments.slice(0, index).join("/"));
  }
}

export async function createFoundryDataDirectoryIfMissing(filePicker: FoundryFilePickerUploadApi, path: string): Promise<void> {
  try {
    await filePicker.createDirectory?.(JOURNAL_MEDIA_UPLOAD_SOURCE, path, {});
  } catch (error) {
    if (!isDirectoryAlreadyExistsError(error)) throw error;
  }
}

export function isDirectoryAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /already exists|existiert bereits|EEXIST/i.test(message);
}

export function getUploadedFilePath(uploaded: unknown): string {
  if (typeof uploaded === "string") return uploaded;
  if (!uploaded || typeof uploaded !== "object") return "";
  const object = uploaded as Record<string, unknown>;
  const filename = getUploadedFileName(object);
  const path = typeof object.path === "string" ? object.path : "";
  if (path && filename && !path.endsWith(filename)) return `${path.replace(/[\\/]$/, "")}/${filename}`;
  for (const key of ["path", "url", "src", "file"]) {
    if (typeof object[key] === "string") return object[key] as string;
  }
  const files = object.files;
  if (Array.isArray(files) && typeof files[0] === "string") return files[0];
  return "";
}

export function getUploadedFileName(object: Record<string, unknown>): string {
  for (const key of ["filename", "name"]) {
    if (typeof object[key] === "string") return object[key] as string;
  }
  return "";
}

export function journalHtmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  container.querySelectorAll("p, div, li").forEach(block => {
    if (block.nextSibling) block.append("\n\n");
  });
  return (container.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Bridges browser Back into the internal mobile router before Foundry can treat
 * the event as a request to leave the game.
 */
export function bindBrowserBack(router: MobileRouter, getRootElement: () => HTMLElement | undefined, searchState: SearchUiState): () => void {
  const onPopState = (event: PopStateEvent): void => {
    const element = getRootElement();
    if (!element) return;

    const hasPocketRouteState = isPocketFoundryHistoryState(event.state);
    const route = hasPocketRouteState ? event.state.route : getPocketFoundryRouteFromHash(globalThis.location?.hash ?? "");
    const normalizedRoute = route ? normalizeCharacterRoutePanes(route, getCharacterSheetAdapter()) : undefined;
    recordHistoryDebug("popstate", {
      state: event.state,
      hash: globalThis.location?.hash,
      href: globalThis.location?.href,
      route: normalizedRoute ?? route,
      current: router.getCurrentRoute(),
      stack: router.getHistory(),
      historyLength: globalThis.history?.length
    });

    event.stopImmediatePropagation();
    event.preventDefault();

    // If browser state is missing (hash-only fallback), prefer the internal
    // stack entry so transient route state (scroll, expanded drawers, focus)
    // survives Back navigation.
    if (!hasPocketRouteState && router.canGoBack()) {
      void router.back().then(() => {
        return renderShell(element, router, searchState);
      });
      return;
    }

    // Browser state may lag behind transient in-memory route fields (scroll,
    // expanded drawers). If the target identity equals the previous stack
    // route, consume Back via the internal stack to preserve exact state.
    if (normalizedRoute && shouldConsumeAsInternalBack(router, normalizedRoute)) {
      void router.back().then(() => {
        return renderShell(element, router, searchState);
      });
      return;
    }

    if (!normalizedRoute && router.canGoBack()) {
      void router.back().then(() => {
        return renderShell(element, router, searchState);
      });
      return;
    }

    if (!normalizedRoute) return;

    void router.restore(normalizedRoute).then(() => renderShell(element, router, searchState));
  };

  globalThis.addEventListener(
    "popstate",
    onPopState,
    { capture: true }
  );

  return () => globalThis.removeEventListener("popstate", onPopState, { capture: true });
}

function shouldConsumeAsInternalBack(router: MobileRouter, route: MobileRoute): boolean {
  const history = router.getHistory();
  const previous = history.length > 0 ? history[history.length - 1] : undefined;
  if (!previous) return false;
  return getRouteIdentityKey(previous) === getRouteIdentityKey(route);
}

function getRouteIdentityKey(route: MobileRoute): string {
  switch (route.view) {
    case RouteView.Characters:
      return "characters";
    case RouteView.Combat:
      return "combat";
    case RouteView.Character:
      return `character:${route.actorUuid}:${route.pane ?? ""}`;
    case RouteView.OwnedDocument:
      return `owned:${route.actorUuid}:${route.documentUuid}:${route.parentPane}`;
    case RouteView.Journal:
      return `journal:${route.entryUuid ?? ""}:${route.pageUuid ?? ""}`;
    case RouteView.Search:
      return `search:${route.query}:${route.typeFilter ?? ""}`;
    case RouteView.Recents:
      return "recents";
    case RouteView.Settings:
      return "settings";
    case RouteView.DocumentDetail:
      return `document:${route.documentUuid}:${route.documentType}:${route.source ?? ""}`;
  }
}

/**
 * Starts mirroring internal routes into browser history after the shell mounts.
 */
export function activateBrowserHistory(router: MobileRouter): void {
  if (!globalThis.history?.replaceState) return;

  browserHistoryActive = true;
  installLeaveGameConfirmGuard(router);
  recordHistoryDebug("activate", {
    current: router.getCurrentRoute(),
    href: globalThis.location?.href,
    state: globalThis.history.state,
    historyLength: globalThis.history.length
  });
  // Replace the current URL with the router's hydrated route, then push a guard
  // entry so the first browser Back can be consumed inside the mobile shell.
  writeBrowserHistory(router.getCurrentRoute(), "replace");
  writeBrowserHistory(router.getCurrentRoute(), "push");
}

/**
 * Writes a concrete mobile route into the browser URL/hash when history is active.
 */
export function writeBrowserHistory(route: MobileRoute, mode: "push" | "replace"): void {
  if (!browserHistoryActive || !globalThis.history?.replaceState) return;

  browserHistorySequence += 1;
  writePocketFoundryHistoryEntry(globalThis.history, globalThis.location?.href ?? "http://localhost/", route, mode, browserHistorySequence);
  recordHistoryDebug("write", {
    mode,
    route,
    sequence: browserHistorySequence,
    href: globalThis.location?.href,
    state: globalThis.history.state,
    historyLength: globalThis.history.length
  });
}

/**
 * Installs a fallback guard for Foundry's leave-game confirmation.
 */
export function installLeaveGameConfirmGuard(router: MobileRouter): void {
  if (originalConfirm || !globalThis.confirm) return;

  originalConfirm = globalThis.confirm.bind(globalThis);
  globalThis.confirm = (message?: string): boolean => {
    if (isFoundryLeaveGamePrompt(message) && shouldSuppressFoundryLeavePrompt(router)) {
      recordHistoryDebug("confirm:suppressed", {
        message,
        hash: globalThis.location?.hash,
        href: globalThis.location?.href,
        current: router.getCurrentRoute(),
        stack: router.getHistory()
      });
      return false;
    }

    if (isFoundryLeaveGamePrompt(message)) recordHistoryDebug("confirm:passthrough", { message, hash: globalThis.location?.hash, href: globalThis.location?.href });
    return originalConfirm ? originalConfirm(message) : false;
  };
}

/**
 * Restores the original browser confirm implementation after unmount.
 */
export function uninstallLeaveGameConfirmGuard(): void {
  if (!originalConfirm) return;

  globalThis.confirm = originalConfirm;
  originalConfirm = undefined;
}

/**
 * Detects Foundry's browser Back leave-game confirmation text.
 */
export function isFoundryLeaveGamePrompt(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("exit the Foundry Virtual Tabletop game");
}

/**
 * Decides whether Foundry's leave-game prompt should be suppressed by mobile navigation.
 */
export function shouldSuppressFoundryLeavePrompt(router: MobileRouter): boolean {
  if (!globalThis.document?.querySelector?.(`[data-pocket-foundry-shell="active"]`)) return false;
  if (router.canGoBack()) return true;
  return Boolean(getPocketFoundryRouteFromHash(globalThis.location?.hash ?? ""));
}

/**
 * Records browser-history diagnostics when window.pocketFoundry.historyDebug is enabled.
 */
export function recordHistoryDebug(event: string, details: Record<string, unknown>): void {
  const pocketFoundry = globalThis.window?.pocketFoundry;
  const config = pocketFoundry?.historyDebug;
  const enabled = config === true || (typeof config === "object" && config.enabled !== false);
  if (!enabled) return;

  const entry = {
    event,
    at: new Date().toISOString(),
    ...details
  };

  if (typeof config === "object") {
    config.events ??= [];
    config.events.push(entry);
  }

  persistHistoryDebugEntry(entry);
  globalThis.console?.info?.("[pocket-foundry history]", entry);
}

/**
 * Persists route-history diagnostics into sessionStorage for browser test inspection.
 */
export function persistHistoryDebugEntry(entry: Record<string, unknown>): void {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;

    const previous = JSON.parse(storage.getItem(HISTORY_DEBUG_STORAGE_KEY) ?? "[]") as unknown;
    const events = Array.isArray(previous) ? previous : [];
    events.push(entry);
    storage.setItem(HISTORY_DEBUG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Debug persistence should never affect mobile navigation behavior.
  }
}

