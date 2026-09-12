import type { foundry } from "fvtt-types";
import type { JournalPageDraft } from "../../services/journal.ts";
import { MODULE_ID } from "../constants.ts";
import { getFoundryRuntime } from "../foundry-globals.ts";
import { localize } from "../localization.ts";
import { notifyJournalMutationUnavailable } from "./controller-helpers-navigation.ts";
import { createFoundryJournalService } from "./controller-helpers-shell.ts";
import { closeConfirmationDialog, openConfirmationDialog } from "./controller-helpers-ui.ts";

const JOURNAL_MEDIA_UPLOAD_SOURCE = "data";
const JOURNAL_MEDIA_UPLOAD_PATH = `uploads/${MODULE_ID}/journal`;

/**
 * Opens the create/edit journal page dialog and populates its initial draft state.
 */
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
  dialog.setAttribute("aria-label", options.mode === "create" ? localize("POCKETFOUNDRY.Journal.CreatePage", "Create journal page") : localize("POCKETFOUNDRY.Journal.EditPage", "Edit page"));
  dialog.dataset.journalPageDraftDialog = "true";

  const backdrop = document.createElement("button");
  backdrop.className = "dialog-backdrop";
  backdrop.type = "button";
  backdrop.dataset.action = "journal-close-page-dialog";
  backdrop.setAttribute("aria-label", localize("POCKETFOUNDRY.Action.Close", "Close"));
  dialog.append(backdrop);

  const form = document.createElement("form");
  form.className = "journal-page-form-panel";
  form.dataset.journalPageDraftForm = "true";
  form.dataset.entryUuid = options.entryUuid;
  if (options.mode === "edit") form.dataset.pageUuid = options.pageUuid;
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.textContent = options.mode === "create" ? localize("POCKETFOUNDRY.Journal.CreatePageTitle", "Create Page") : localize("POCKETFOUNDRY.Journal.EditPageTitle", "Edit Page");
  form.append(title);

  form.append(createJournalTextInput(localize("POCKETFOUNDRY.Table.Name", "Name"), "name", initialDraft.name));
  form.append(createJournalPageTypeSelect(initialDraft.type, getJournalPageDraftTypesForDialog(initialDraft.type, options.mode)));
  form.append(createJournalTextarea(localize("POCKETFOUNDRY.Journal.TextContent", "Text Content"), "textContent", initialDraft.textContent ?? "", "text"));
  form.append(createJournalFileInput(initialDraft.type, initialDraft.src ?? ""));

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.dataset.action = "journal-close-page-dialog";
  cancel.textContent = localize("POCKETFOUNDRY.Action.Cancel", "Cancel");
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary-action";
  save.dataset.action = "journal-save-page-draft";
  save.textContent = options.mode === "create" ? localize("POCKETFOUNDRY.Action.Create", "Create") : localize("POCKETFOUNDRY.Action.Save", "Save");
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
    title: localize("POCKETFOUNDRY.Journal.DeletePageTitle", "Delete Page"),
    body: "Delete this journal page?",
    confirmLabel: localize("POCKETFOUNDRY.Action.Delete", "Delete"),
    confirmAction: "journal-confirm-delete-page",
    cancelAction: "journal-close-delete-dialog",
    danger: true,
    data: { entryUuid, pageUuid }
  });
}

export function closeJournalPageDeleteDialog(root: HTMLElement): void {
  closeConfirmationDialog(root, "journal-page-delete");
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
  span.textContent = localize("POCKETFOUNDRY.Table.Type", "Type");
  const select = document.createElement("select");
  select.name = "type";
  select.dataset.journalPageTypeSelect = "true";
  const labels: Record<JournalPageDraft["type"], string> = {
    text: localize("POCKETFOUNDRY.Journal.PageKind.Text", "Text"),
    image: localize("POCKETFOUNDRY.Journal.PageKind.Image", "Image"),
    pdf: localize("POCKETFOUNDRY.Journal.PageKind.PDF", "PDF"),
    video: localize("POCKETFOUNDRY.Journal.PageKind.Video", "Video")
  };
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
  span.textContent = localize("POCKETFOUNDRY.Journal.MediaFile", "Media File");
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

type FoundryFilePickerUploadApi = Pick<typeof foundry.applications.apps.FilePicker, "createDirectory" | "upload">;

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
