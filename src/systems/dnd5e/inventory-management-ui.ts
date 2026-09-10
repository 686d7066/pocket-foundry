import { getFoundryRuntime } from "../../core/foundry-globals.ts";
import { localize } from "../../core/localization.ts";
import { canUpdateDocument, canViewDocument } from "../../services/permissions.ts";
import type { CharacterSheetShellActionContext } from "../character-sheet-adapter.ts";
import { containerChoices, deleteManagedItem, importManagedItem, inventoryDescendants, managedItems, moveManagedItem, parentContainerId, saveManagedBag, withInventoryMutation, type InventoryOperationResult, type ManagedInventoryActor, type ManagedInventoryItem } from "./inventory-management.ts";
import { inventoryImportEnvironment, searchInventoryCatalog } from "./inventory-catalog.ts";

/** Resolves localized strings for the inventory editor. */
function text(key: string, fallback: string): string { return localize("POCKETFOUNDRY.DND5E.Inventory.Manage." + key, fallback); }

/** Creates a labeled form field using text nodes rather than interpolating item content into HTML. */
function input(form: HTMLElement, label: string, value = "", type = "text"): HTMLInputElement {
  const wrapper = document.createElement("label"); wrapper.textContent = label;
  const field = document.createElement("input"); field.type = type; field.value = value;
  wrapper.append(field); form.append(wrapper); return field;
}

/** Creates a labeled selector with literal option text. */
function select(form: HTMLElement, label: string, values: { id: string; label: string }[]): HTMLSelectElement {
  const wrapper = document.createElement("label"); wrapper.textContent = label;
  const field = document.createElement("select");
  for (const value of values) { const option = document.createElement("option"); option.value = value.id; option.textContent = value.label; field.append(option); }
  wrapper.append(field); form.append(wrapper); return field;
}

/** Opens an isolated native modal that retains input across document-driven shell refreshes. */
function editor(title: string, context: CharacterSheetShellActionContext) {
  document.querySelector<HTMLDialogElement>("dialog.pf-inventory-editor")?.close();
  const dialog = document.createElement("dialog"); dialog.className = "pf-inventory-editor";
  dialog.setAttribute("aria-label", title);
  const heading = document.createElement("h2"); heading.textContent = title;
  const form = document.createElement("form");
  const fields = document.createElement("div"); fields.className = "pf-inventory-fields";
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const actions = document.createElement("div"); actions.className = "pf-inventory-editor-actions";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = text("Cancel", "Cancel");
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = text("Save", "Save");
  actions.append(cancel, submit); form.append(fields, status, actions); dialog.append(heading, form); document.body.append(dialog);
  let busy = false;
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  // Close when the shell is unmounted. Its innerHTML refreshes deliberately do not discard the draft.
  const observer = new MutationObserver(() => { if (!context.element.isConnected) dialog.close(); });
  observer.observe(document.body, { childList: true });
  dialog.addEventListener("close", () => { observer.disconnect(); dialog.remove(); context.target.focus(); }, { once: true });
  dialog.showModal();
  const bind = (operation: () => Promise<InventoryOperationResult>) => {
    form.addEventListener("submit", event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      busy = true; submit.disabled = true; cancel.disabled = true;
      status.textContent = text("Saving", "Saving…");
      void (async () => {
        try {
          const result = await operation();
          if (!result.ok) {
            status.textContent = result.reason === "contents-changed" ? text("Changed", "The bag contents changed. Close this dialog and review them again.")
              : result.reason === "cycle" || result.reason === "depth" ? text("Nesting", "That move would create invalid or excessively deep nesting.")
              : result.reason === "bag-quantity" ? text("BagQuantity", "Add one bag at a time. Each bag has its own contents.")
              : text("Rejected", "The change could not be completed. Check permissions and current inventory before trying again.");
            return;
          }
          dialog.close();
          await context.helpers.runAction("inventory-management-refresh");
        } catch {
          status.textContent = text("Failed", "The operation failed or its result is uncertain. Check the current inventory before retrying; some changes may have reached Foundry.");
        } finally { busy = false; submit.disabled = false; cancel.disabled = false; }
      })();
    });
  };
  return { dialog, fields, status, submit, bind };
}

/** Opens bag identity, movement, deletion, and catalog dialogs through the system adapter. */
export async function handleInventoryManagement(context: CharacterSheetShellActionContext): Promise<boolean> {
  const actions = ["inventory-manage-new-bag", "inventory-manage-edit-bag", "inventory-manage-move", "inventory-manage-delete", "inventory-manage-add", "inventory-manage-quantity"];
  if (!actions.includes(context.action)) return false;
  context.event.preventDefault(); context.event.stopPropagation();
  const runtime = getFoundryRuntime();
  const resolve = runtime.foundry?.utils?.fromUuid ?? runtime.fromUuid;
  const documentValue = await resolve?.(context.route.actorUuid);
  if (!documentValue || typeof documentValue !== "object") return true;
  if (!context.element.isConnected) return true;
  const actor = documentValue as ManagedInventoryActor;
  const user = runtime.game?.user;
  if (!canUpdateDocument(actor, user)) return true;
  const item = managedItems(actor).find(candidate => candidate.id === context.target.dataset.itemId);
  if (context.action === "inventory-manage-add") { openImport(context, actor); return true; }
  if (context.action === "inventory-manage-new-bag" || context.action === "inventory-manage-edit-bag") {
    if (context.action === "inventory-manage-edit-bag" && item?.type !== "container") return true;
    const view = editor(item ? text("EditBag", "Edit bag") : text("NewBag", "New bag"), context);
    const name = input(view.fields, text("Name", "Name"), item?.name ?? ""); name.required = true;
    const img = input(view.fields, text("Icon", "Icon image path or URL"), item?.img ?? "icons/svg/item-bag.svg");
    const hint = document.createElement("p"); hint.textContent = text("IconHint", "Use an image path from Foundry or an HTTPS image URL. Only the bag's name and icon are changed."); view.fields.append(hint);
    view.bind(() => saveManagedBag(actor, user, { id: item?.id, name: name.value, img: img.value })); name.focus(); return true;
  }
  if (!item?.id || !canUpdateDocument(item, user)) return true;
  if (context.action === "inventory-manage-quantity") {
    const view = editor(text("StockQuantity", "Quantity owned") + ": " + item.name, context);
    const current = Number((item.system as { quantity?: unknown } | undefined)?.quantity);
    const quantity = input(view.fields, text("StockQuantity", "Quantity owned"), String(Number.isFinite(current) ? current : 0), "number");
    quantity.min = item.type === "container" ? "1" : "0"; quantity.step = "1"; quantity.required = true;
    if (item.type === "container") quantity.max = "1";
    view.bind(() => withInventoryMutation(actor, user, async () => {
      const value = Number(quantity.value);
      if (!Number.isSafeInteger(value) || value < 0 || (item.type === "container" && value !== 1)) return { ok: false, reason: "invalid-quantity" };
      if (!item.update || !canUpdateDocument(item, user)) return { ok: false, reason: "forbidden" };
      return await item.update({ "system.quantity": value }) ? { ok: true } : { ok: false, reason: "rejected" };
    })); return true;
  }
  if (context.action === "inventory-manage-move") {
    const view = editor(text("Move", "Move item") + ": " + item.name, context);
    const destination = select(view.fields, text("Destination", "Destination"), [{ id: "", label: text("Main", "Main inventory") }, ...containerChoices(actor, user, item.id)]);
    destination.value = parentContainerId(item);
    view.submit.textContent = text("Move", "Move item");
    view.bind(() => moveManagedItem(actor, user, item.id ?? "", destination.value)); return true;
  }
  openDelete(context, actor, item); return true;
}

/** Requires explicit confirmation of the reviewed subtree before deleting inventory documents. */
function openDelete(context: CharacterSheetShellActionContext, actor: ManagedInventoryActor, item: ManagedInventoryItem): void {
  const children = inventoryDescendants(actor, item.id ?? "");
  const view = editor(text("Delete", "Delete item") + ": " + item.name, context);
  const explanation = document.createElement("p"); explanation.textContent = text("DeleteWarning", "This removes the item from the character. Setting quantity to zero instead keeps it available for restocking."); view.fields.append(explanation);
  if (item.type === "container") {
    const note = document.createElement("p");
    note.textContent = text("BagDeleteNote", "Keeping contents preserves the items inside, including nested bags. The deleted bag itself, its settings, and any currency stored directly in it are removed.");
    view.fields.append(note);
  }
  let choice: HTMLSelectElement | undefined;
  if (children.length) {
    const summary = document.createElement("p"); summary.textContent = text("Contents", "Contained items") + ": " + children.filter(child => canViewDocument(child, getFoundryRuntime().game?.user)).map(child => child.name).join(", "); view.fields.append(summary);
    choice = select(view.fields, text("ContentsAction", "What should happen to the contents?"), [
      { id: "keep", label: text("KeepContents", "Keep contained items in main inventory") },
      { id: "delete", label: text("DeleteContents", "Delete the bag and all its contents") }
    ]);
  }
  view.submit.textContent = text("ConfirmDelete", "Confirm deletion");
  view.bind(() => deleteManagedItem(actor, getFoundryRuntime().game?.user, item.id ?? "", choice?.value === "delete" ? "delete" : "keep", children.map(child => child.id ?? "")));
}

/** Searches accessible sources, then imports the selected document with an explicit starting quantity. */
function openImport(context: CharacterSheetShellActionContext, actor: ManagedInventoryActor): void {
  const view = editor(text("Add", "Add item"), context);
  const query = input(view.fields, text("Search", "Search world and compendium items"));
  const search = document.createElement("button"); search.type = "button"; search.textContent = text("SearchButton", "Search"); view.fields.append(search);
  const results = select(view.fields, text("Results", "Matching items"), []); results.required = true;
  const quantity = input(view.fields, text("Quantity", "Initial quantity"), "1", "number"); quantity.min = "1"; quantity.step = "1"; quantity.required = true;
  let sequence = 0;
  search.addEventListener("click", () => {
    const request = ++sequence; search.disabled = true; view.submit.disabled = true; results.replaceChildren();
    view.status.textContent = text("Searching", "Searching…");
    void searchInventoryCatalog(query.value, getFoundryRuntime().game?.user).then(response => {
      if (request !== sequence || !view.dialog.isConnected) return;
      for (const entry of response.entries.slice(0, 100)) {
        const option = document.createElement("option"); option.value = entry.uuid; option.textContent = entry.name + " — " + entry.source; results.append(option);
      }
      view.status.textContent = response.failures ? text("SearchPartial", "Some sources could not be searched. You can retry the search.")
        : response.entries.length > 100 ? text("NarrowSearch", "Showing the first 100 matches. Narrow your search for more specific results.")
        : response.entries.length ? "" : text("NoResults", "No matching items.");
      view.submit.disabled = !response.entries.length;
    }).catch(() => { view.status.textContent = text("SearchFailed", "Search failed. Please try again."); }).finally(() => { search.disabled = false; });
  });
  view.submit.disabled = true; view.submit.textContent = text("Add", "Add item");
  view.bind(() => importManagedItem(actor, getFoundryRuntime().game?.user, results.value, Number(quantity.value), inventoryImportEnvironment(getFoundryRuntime().game?.user)));
  query.focus();
}
