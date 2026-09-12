import { getCollectionContents, getObject } from "../../core/utils.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";

export interface ManagedInventoryItem extends PermissionCheckedDocument {
  name?: string | null;
  img?: string | null;
  type?: string | null;
  system?: unknown;
  update?: (changes: Record<string, unknown>) => Promise<unknown>;
  delete?: (options?: { deleteContents?: boolean }) => Promise<unknown>;
}

export interface ManagedInventoryActor extends PermissionCheckedDocument {
  items?: unknown;
  updateEmbeddedDocuments?: (kind: "Item", data: Record<string, unknown>[]) => Promise<unknown>;
  deleteEmbeddedDocuments?: (kind: "Item", ids: string[]) => Promise<unknown[]>;
  type?: string | null;
  createEmbeddedDocuments?: (kind: "Item", data: object[], options?: { keepId?: boolean }) => Promise<unknown[]>;
}

export type InventoryOperationResult = { ok: boolean; reason?: string };
export type ContainerChoice = { id: string; label: string };
const PHYSICAL_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);
const pendingActors = new WeakSet<ManagedInventoryActor>();

/** Returns physical owned items; document permissions are checked before displaying or mutating them. */
export function managedItems(actor: ManagedInventoryActor): ManagedInventoryItem[] {
  return (getCollectionContents(actor.items) as ManagedInventoryItem[]).filter(item => PHYSICAL_TYPES.has(item.type ?? ""));
}

/** Reads the system's container reference without treating a missing reference as an item ID. */
export function parentContainerId(item: ManagedInventoryItem): string {
  const value = getObject(item.system)?.container;
  return typeof value === "string" ? value : "";
}

/** Finds all descendants safely even if external data contains a container cycle. */
export function inventoryDescendants(actor: ManagedInventoryActor, id: string): ManagedInventoryItem[] {
  const result: ManagedInventoryItem[] = [];
  const visited = new Set([id]);
  const pending = [id];
  const items = managedItems(actor);
  while (pending.length) {
    const parent = pending.pop();
    for (const item of items) {
      if (!item.id || visited.has(item.id) || parentContainerId(item) !== parent) continue;
      visited.add(item.id);
      result.push(item);
      pending.push(item.id);
    }
  }
  return result;
}

/** Labels destinations by full container path; IDs disambiguate duplicate paths. */
export function containerChoices(actor: ManagedInventoryActor, user: FoundryUserLike, movingId?: string): ContainerChoice[] {
  const items = managedItems(actor);
  const forbidden = new Set([movingId, ...(movingId ? inventoryDescendants(actor, movingId).map(item => item.id) : [])]);
  const visible = items.filter(item => item.type === "container" && item.id && !forbidden.has(item.id) && canViewDocument(item, user));
  const choices = visible.map(item => {
    const parts = [item.name || "Container"];
    const seen = new Set([item.id]);
    let parent = parentContainerId(item);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const ancestor = items.find(candidate => candidate.id === parent);
      if (!ancestor || !canViewDocument(ancestor, user)) break;
      parts.unshift(ancestor.name || "Container");
      parent = parentContainerId(ancestor);
    }
    return { id: item.id ?? "", label: parts.join(" › ") };
  });
  return choices.map(choice => ({ ...choice, label: choices.filter(other => other.label === choice.label).length > 1 ? choice.label + " (" + choice.id + ")" : choice.label }));
}

/** Serializes inventory mutations per actor without queuing repeat taps for later execution. */
export async function withInventoryMutation(actor: ManagedInventoryActor, user: FoundryUserLike, operation: () => Promise<InventoryOperationResult>): Promise<InventoryOperationResult> {
  if (actor.type !== "character" || !canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (pendingActors.has(actor)) return { ok: false, reason: "busy" };
  pendingActors.add(actor);
  try { return await operation(); }
  finally { pendingActors.delete(actor); }
}

/** Moves an item or entire nested bag while rejecting cycles and excessive nesting. */
export async function moveManagedItem(actor: ManagedInventoryActor, user: FoundryUserLike, itemId: string, destinationId: string): Promise<InventoryOperationResult> {
  return withInventoryMutation(actor, user, async () => {
    const items = managedItems(actor);
    const item = items.find(candidate => candidate.id === itemId);
    if (!item?.update) return { ok: false, reason: "unavailable" };
    if (!canUpdateDocument(item, user)) return { ok: false, reason: "forbidden" };
    const descendants = inventoryDescendants(actor, itemId);
    if (destinationId === itemId || descendants.some(child => child.id === destinationId)) return { ok: false, reason: "cycle" };
    const destination = destinationId ? items.find(candidate => candidate.id === destinationId) : undefined;
    if (destinationId && (destination?.type !== "container" || !canUpdateDocument(destination, user))) return { ok: false, reason: "invalid-destination" };
    // D&D 5e PhysicalItemTemplate.MAX_DEPTH is five in the supported system source.
    const parents = new Set<string>();
    let parent = destinationId;
    while (parent) {
      if (parents.has(parent)) return { ok: false, reason: "cycle" };
      parents.add(parent);
      const ancestor = items.find(candidate => candidate.id === parent);
      if (!ancestor) return { ok: false, reason: "invalid-destination" };
      parent = parentContainerId(ancestor);
    }
    let childDepth = 0;
    for (const child of descendants) {
      let depth = 0;
      let current = parentContainerId(child);
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current); depth++;
        if (current === itemId) break;
        current = parentContainerId(items.find(candidate => candidate.id === current) ?? {});
      }
      childDepth = Math.max(childDepth, depth);
    }
    if (parents.size + childDepth > 5) return { ok: false, reason: "depth" };
    if (!await item.update({ "system.container": destinationId || null })) return { ok: false, reason: "rejected" };
    return { ok: true };
  });
}

/** Accepts Foundry asset paths or HTTP(S) images, excluding executable and inline URLs. */
export function validInventoryImage(value: string): boolean {
  return !value || (!/[\u0000-\u001f]/.test(value) && !value.startsWith("//") && (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /^https?:\/\//i.test(value)));
}

/** Creates an empty named bag or renames an existing bag without changing its icon or system data. */
export async function saveManagedBag(actor: ManagedInventoryActor, user: FoundryUserLike, values: { id?: string; name: string; img?: string }): Promise<InventoryOperationResult> {
  return withInventoryMutation(actor, user, async () => {
    const name = values.name.trim();
    const img = values.img?.trim() ?? "";
    if (!name) return { ok: false, reason: "invalid" };
    if (values.id) {
      const item = managedItems(actor).find(candidate => candidate.id === values.id && candidate.type === "container");
      if (!item?.update) return { ok: false, reason: "unavailable" };
      if (!canUpdateDocument(item, user)) return { ok: false, reason: "forbidden" };
      if (!await item.update({ name })) return { ok: false, reason: "rejected" };
    } else {
      if (!validInventoryImage(img)) return { ok: false, reason: "invalid" };
      if (!actor.createEmbeddedDocuments) return { ok: false, reason: "unsupported" };
      const created = await actor.createEmbeddedDocuments("Item", [{ name, img: img || "icons/svg/item-bag.svg", type: "container", system: { quantity: 1, container: null } }]);
      if (!created.length) return { ok: false, reason: "rejected" };
    }
    return { ok: true };
  });
}

/** Deletes the reviewed set in one document operation, or first moves direct contents to main inventory. */
export async function deleteManagedItem(actor: ManagedInventoryActor, user: FoundryUserLike, itemId: string, contents: "keep" | "delete", expectedDescendants: string[]): Promise<InventoryOperationResult> {
  return withInventoryMutation(actor, user, async () => {
    const item = managedItems(actor).find(candidate => candidate.id === itemId);
    if (!item || !actor.deleteEmbeddedDocuments) return { ok: false, reason: "unavailable" };
    if (!canUpdateDocument(item, user) || item.canUserModify?.(user, "delete") === false) return { ok: false, reason: "forbidden" };
    const children = inventoryDescendants(actor, itemId);
    const actual = children.map(child => child.id ?? "").sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expectedDescendants].sort())) return { ok: false, reason: "contents-changed" };
    if (children.some(child => !canUpdateDocument(child, user) || (contents === "delete" && child.canUserModify?.(user, "delete") === false))) return { ok: false, reason: "forbidden" };
    if (contents === "keep" && children.length) {
      if (!actor.updateEmbeddedDocuments) return { ok: false, reason: "unsupported" };
      await actor.updateEmbeddedDocuments("Item", children.filter(child => parentContainerId(child) === itemId).map(child => ({ _id: child.id, "system.container": null })));
      if (managedItems(actor).some(child => parentContainerId(child) === itemId)) return { ok: false, reason: "rejected" };
    }
    const ids = contents === "delete" ? [...actual, itemId] : [itemId];
    const deleted = await actor.deleteEmbeddedDocuments("Item", ids);
    if (deleted.length !== ids.length) return { ok: false, reason: "partial-delete" };
    return { ok: true };
  });
}

export interface InventoryImportSource extends ManagedInventoryItem {
  documentName?: string;
  toObject?: () => Record<string, unknown>;
}
export interface InventoryImportEnvironment {
  resolve: (uuid: string) => Promise<InventoryImportSource | null | undefined>;
  prepare: (source: InventoryImportSource) => Promise<Record<string, unknown>[]>;
}

/** Imports a fresh copy of accessible physical content, preserving the system's remapped container links. */
export async function importManagedItem(actor: ManagedInventoryActor, user: FoundryUserLike, uuid: string, quantity: number, environment: InventoryImportEnvironment): Promise<InventoryOperationResult> {
  return withInventoryMutation(actor, user, async () => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return { ok: false, reason: "invalid-quantity" };
    if (!actor.createEmbeddedDocuments) return { ok: false, reason: "unsupported" };
    // Only independent world or compendium entries are import sources; character transfers are a separate workflow.
    if (!/^(Item\.[^.]+|Compendium\.[^.]+\.[^.]+\.(?:Item\.)?[^.]+)$/.test(uuid)) return { ok: false, reason: "invalid-source" };
    const source = await environment.resolve(uuid);
    if (!source || source.documentName !== "Item" || !PHYSICAL_TYPES.has(source.type ?? "")) return { ok: false, reason: "invalid-source" };
    if (!canViewDocument(source, user)) return { ok: false, reason: "forbidden" };
    if (source.type === "container" && quantity !== 1) return { ok: false, reason: "bag-quantity" };
    const data = await environment.prepare(source);
    if (!data.length) return { ok: false, reason: "rejected" };
    const first = data[0];
    if (!first) return { ok: false, reason: "rejected" };
    first.system = { ...getObject(first.system), quantity, container: null };
    if (!canUpdateDocument(actor, user) || !canViewDocument(source, user)) return { ok: false, reason: "forbidden" };
    const created = await actor.createEmbeddedDocuments("Item", data, { keepId: true });
    return created.length === data.length ? { ok: true } : { ok: false, reason: "partial-import" };
  });
}
