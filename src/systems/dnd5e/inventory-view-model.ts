import type { foundry } from "fvtt-types";
import { localize, localizeSystemKey } from "../../core/localization.ts";
import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../../core/utils.ts";
import { getFoundryRuntime, type FoundryDataShape } from "../../core/foundry-globals.ts";
import { canUpdateDocument, canViewDocument, type FoundryDocumentMutationApi, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";
import { enrichDescriptionRows, type RichTextHtmlEnricher } from "../../services/rich-text-enrichment.ts";
import { SECTION_CONFIG, SECTION_ORDER, type InventoryFactField, type InventorySectionId } from "./inventory-config.ts";
import {
  buildSignedAdjustmentOptions,
  canUpdateOwnedDocument,
  canViewOwnedDocument,
  clampNumber,
  formatAttackValue,
  formatNumber,
  formatPair,
  getEntityId,
  getEntityUuid,
  getRemainingUses,
  getUsesLabel,
  isGmUser,
  normalizeSearchQuery,
  toSearchTerms,
  uniqueStrings
} from "./view-model-helpers.ts";
import { buildOptionalDnd5eFavoriteToggleState, hasDnd5eFavoriteReference, setDnd5eFavoriteEntry } from "./favorites-storage.ts";

export type Dnd5eInventoryActor = PermissionCheckedDocument
  & FoundryDocumentMutationApi
  & FoundryDataShape<foundry.documents.types.ActorData>
  & {
  system?: Record<string, unknown>;
  items?: unknown;
};

export type Dnd5eInventoryItem = PermissionCheckedDocument
  & FoundryDocumentMutationApi
  & FoundryDataShape<foundry.documents.types.ItemData>
  & {
  _id?: Exclude<foundry.documents.types.ItemData["_id"], null>;
  img?: foundry.documents.types.ItemData["img"] | null;
  system?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  hasAttack?: boolean;
  hasRecharge?: boolean;
  parent?: Dnd5eInventoryActor | null;
};

export type Dnd5eInventoryStatus = {
  encumbrance: {
    value: number;
    max: number | null;
    pct: number;
    units: string;
    label: string;
  };
  currency: {
    total: string;
    coins: string;
    values: Dnd5eInventoryCurrencyValueViewModel[];
  };
  attunement: {
    value: number;
    max: number | null;
    label: string;
  };
  containers: Dnd5eInventoryContainerViewModel[];
};

export type Dnd5eInventoryContainerViewModel = {
  id: string;
  uuid: string;
  name: string;
  iconText: string;
  capacityLabel: string;
  pct: number;
  contents: string;
};

export type Dnd5eInventorySectionViewModel = {
  id: string;
  label: string;
  weight: string;
  listColumns: Dnd5eInventoryListColumnViewModel[];
  items: Dnd5eInventoryItemViewModel[];
  empty: boolean;
};

export type Dnd5eInventoryListColumnViewModel = {
  id: string;
  label: string;
  shortLabel?: string;
};

export type Dnd5eInventoryCurrencyValueViewModel = {
  id: string;
  label: string;
  name: string;
  icon: string;
  value: number;
  canUpdate: boolean;
  options: Dnd5eInventoryCurrencyOptionViewModel[];
};

export type Dnd5eInventoryCurrencyOptionViewModel = {
  value: number;
  label: string;
  center: boolean;
};

export type Dnd5eInventoryItemViewModel = {
  outOfStock: boolean;
  isContainer: boolean;
  id: string;
  dialogItemId: string;
  sectionId: string;
  uuid: string;
  name: string;
  icon: string | null;
  iconText: string;
  type: string;
  subtitle: string;
  primary: string;
  primaryLabel: string;
  quantity: number | null;
  weight: string;
  price: string;
  roll: string;
  damage: string;
  listFormula: string;
  valueLabel: string;
  usesLabel: string;
  facts: Dnd5eInventoryItemFactViewModel[];
  description: string;
  containerId: string;
  containerName: string;
  contents: string;
  children: Dnd5eInventoryItemViewModel[];
  chips: string[];
  listCells: Dnd5eInventoryListCellViewModel[];
  quantityAdjustment: Dnd5eInventoryAdjustmentViewModel | null;
  chargesAdjustment: Dnd5eInventoryAdjustmentViewModel | null;
  adjustments: Dnd5eInventoryAdjustmentViewModel[];
  actions: {
    canUpdate: boolean;
    canAdjustQuantity: boolean;
    canRecharge: boolean;
    canToggleEquipped: boolean;
    canToggleAttuned: boolean;
    canTogglePrepared: boolean;
    canMoveContainer: boolean;
    canRemoveContainer: boolean;
    canToggleFavorite?: boolean;
  };
  favorite?: boolean;
  states: {
    equipped: boolean | null;
    attuned: boolean | null;
    prepared: boolean | null;
    identified: boolean | null;
  };
};

export type Dnd5eInventoryItemFactViewModel = {
  label: string;
  value: string;
};

export type Dnd5eInventoryListCellViewModel = {
  id: string;
  value: string;
  emphasis: boolean;
  adjustment: Dnd5eInventoryAdjustmentViewModel | null;
};

export type Dnd5eInventoryAdjustmentViewModel = {
  id: "quantity" | "charges";
  title: string;
  label: string;
  value: string;
  current: number;
  max: number | null;
  options: Dnd5eInventoryDeltaOption[];
};

export type Dnd5eInventoryDeltaOption = {
  value: number;
  label: string;
  center: boolean;
};

export type Dnd5eInventoryViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  searchQuery: string;
  canClearSearch: boolean;
  status: Dnd5eInventoryStatus;
  sections: Dnd5eInventorySectionViewModel[];
};

export type UnavailableDnd5eInventoryViewModel = {
  unavailable: true;
  title: string;
  body: string;
};

export type Dnd5eInventoryModel = Dnd5eInventoryViewModel | UnavailableDnd5eInventoryViewModel;

export type Dnd5eInventoryControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden" | "unsupported";
};

const CURRENCY_ORDER = ["pp", "gp", "ep", "sp", "cp"] as const;

/**
 * Builds the dnd5e inventory pane from visible owned physical items, containers,
 * currency, encumbrance, attunement, and update actions.
 */
export async function buildDnd5eInventoryViewModel(options: {
  actor: Dnd5eInventoryActor | null | undefined;
  user: FoundryUserLike;
  searchQuery?: string;
}): Promise<Dnd5eInventoryModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: localize("POCKETFOUNDRY.DND5E.Inventory.Unavailable.Title", "Inventory Unavailable"),
      body: localize("POCKETFOUNDRY.DND5E.Inventory.Unavailable.Body", "This inventory is not available to the current user.")
    };
  }

  const canUpdate = canUpdateDocument(actor, options.user);
  const searchQuery = normalizeSearchQuery(options.searchQuery);
  const items = getInventoryItems(actor, options.user);
  const childrenByContainer = buildChildrenByContainer(items);
  const containers = items.filter(item => item.type === "container");
  const sectionsInput = buildSections(items, childrenByContainer, canUpdate, searchQuery);
  const textEditor = getFoundryRuntime().TextEditor;
  const enrichHTML = textEditor?.enrichHTML;
  const sections = typeof enrichHTML === "function"
    ? await Promise.all(sectionsInput.map(async section => ({
        ...section,
        items: await enrichInventoryRows(section.items, items, enrichHTML.bind(textEditor), isGmUser(options.user))
      })))
    : sectionsInput;

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate,
    searchQuery,
    canClearSearch: searchQuery.length > 0,
    status: buildStatus(actor, containers, childrenByContainer, canUpdate),
    sections
  };
}

export async function setInventoryQuantity(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  quantity: number
): Promise<Dnd5eInventoryControlResult> {
  return updateOwnedItem(actor, user, itemId, { "system.quantity": Math.max(0, Math.trunc(quantity)) });
}

export async function adjustInventoryQuantity(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  delta: number
): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const current = getNumber(getObject(item.system)?.quantity) ?? 0;
  return setInventoryQuantity(actor, user, itemId, current + delta);
}

export async function adjustInventoryRemainingUses(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  delta: number
): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };

  const current = getNumber(uses?.value) ?? getRemainingUses(uses) ?? max;
  return setInventoryRemainingUses(actor, user, itemId, current + delta);
}

export async function setInventoryRemainingUses(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  remainingUses: number
): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };

  const remaining = clampNumber(Math.trunc(remainingUses), 0, max);
  return updateOwnedItem(actor, user, itemId, { "system.uses.spent": max - remaining });
}

export async function toggleInventoryEquipped(actor: Dnd5eInventoryActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  const equipped = getObject(item?.system)?.equipped;
  if (typeof equipped !== "boolean") return { ok: false, reason: item ? "unsupported" : "unavailable" };
  return updateOwnedItem(actor, user, itemId, { "system.equipped": !equipped });
}

export async function toggleInventoryAttuned(actor: Dnd5eInventoryActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const system = getObject(item.system) ?? {};
  if (!isAttunableItem(system)) return { ok: false, reason: "unsupported" };
  return updateOwnedItem(actor, user, itemId, { "system.attuned": system.attuned !== true });
}

export async function toggleInventoryPrepared(actor: Dnd5eInventoryActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  const prepared = getObject(item?.system)?.prepared;
  if (typeof prepared !== "boolean") return { ok: false, reason: item ? "unsupported" : "unavailable" };
  return updateOwnedItem(actor, user, itemId, { "system.prepared": !prepared });
}

export async function moveInventoryItemToContainer(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  containerId: string
): Promise<Dnd5eInventoryControlResult> {
  const container = findOwnedItem(actor, containerId);
  if (!container || container.type !== "container") return { ok: false, reason: "unavailable" };
  return updateOwnedItem(actor, user, itemId, { "system.container": containerId });
}

export async function removeInventoryItemFromContainer(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string
): Promise<Dnd5eInventoryControlResult> {
  return updateOwnedItem(actor, user, itemId, { "system.container": "" });
}

export async function rechargeInventoryItem(actor: Dnd5eInventoryActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };

  const uses = getObject(getObject(item.system)?.uses);
  const rollRecharge = uses?.rollRecharge;
  if (item.hasRecharge !== true || typeof rollRecharge !== "function") return { ok: false, reason: "unsupported" };

  await (rollRecharge as (options: { apply: boolean }) => Promise<unknown>).call(uses, { apply: true });
  return { ok: true };
}

export async function setInventoryFavorite(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  favorite: boolean
): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };

  const favoriteId = getItemUuid(item);
  return (await setDnd5eFavoriteEntry(actor, "item", favoriteId, favorite)) ? { ok: true } : { ok: false, reason: "unsupported" };
}

export async function setInventoryCurrency(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  currencyValues: Partial<Record<(typeof CURRENCY_ORDER)[number], number>>
): Promise<Dnd5eInventoryControlResult> {
  if (!actor || actor.type !== "character") return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (typeof actor.update !== "function") return { ok: false, reason: "unsupported" };

  const update: Record<string, number> = {};
  for (const id of CURRENCY_ORDER) {
    const value = currencyValues[id];
    if (!Number.isFinite(value)) continue;
    update[`system.currency.${id}`] = Math.max(0, Math.trunc(value as number));
  }

  if (Object.keys(update).length === 0) return { ok: true };
  await actor.update(update);
  return { ok: true };
}

async function updateOwnedItem(
  actor: Dnd5eInventoryActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  update: Record<string, unknown>
): Promise<Dnd5eInventoryControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };

  const id = item.id ?? item._id;
  if (!id) return { ok: false, reason: "unavailable" };
  if (actor.updateEmbeddedDocuments) {
    await actor.updateEmbeddedDocuments("Item", [{ _id: id, ...update }]);
    return { ok: true };
  }
  if (item.update) {
    await item.update(update);
    return { ok: true };
  }
  return { ok: false, reason: "unsupported" };
}

function getInventoryItems(actor: Dnd5eInventoryActor, user: FoundryUserLike): Dnd5eInventoryItem[] {
  return (getCollectionContents(actor.items) as Dnd5eInventoryItem[])
    .filter(item => isPhysicalInventoryItem(item))
    .filter(item => canViewOwnedItem(actor, item, user));
}

function canViewOwnedItem(actor: Dnd5eInventoryActor, item: Dnd5eInventoryItem, user: FoundryUserLike): boolean {
  return canViewOwnedDocument(actor, item, user);
}

function canUpdateOwnedItem(actor: Dnd5eInventoryActor | null | undefined, item: Dnd5eInventoryItem, user: FoundryUserLike): boolean {
  return canUpdateOwnedDocument(actor, item, user);
}

function isPhysicalInventoryItem(item: Dnd5eInventoryItem): boolean {
  const section = getInventorySectionId(item);
  return SECTION_ORDER.includes(section as InventorySectionId);
}

function buildStatus(
  actor: Dnd5eInventoryActor,
  containers: Dnd5eInventoryItem[],
  childrenByContainer: Map<string, Dnd5eInventoryItem[]>,
  canUpdate: boolean
): Dnd5eInventoryStatus {
  const system = getObject(actor.system) ?? {};
  const attributes = getObject(system.attributes) ?? {};
  const encumbrance = getObject(attributes.encumbrance) ?? {};
  const value = getNumber(encumbrance.value) ?? 0;
  const max = getNumber(encumbrance.max);
  const pct = getNumber(encumbrance.pct) ?? getPercent(value, max);
  const units = getString(encumbrance.units) || "lb.";
  const currency = getObject(system.currency) ?? {};
  const attunement = getObject(attributes.attunement) ?? {};

  return {
    encumbrance: {
      value,
      max,
      pct,
      units,
      label: max === null ? `${formatNumber(value)} ${units}` : `${formatNumber(value)} / ${formatNumber(max)}`
    },
    currency: buildCurrency(currency, canUpdate),
    attunement: {
      value: getNumber(attunement.value) ?? countAttunedItems(getCollectionContents(actor.items) as Dnd5eInventoryItem[]),
      max: getNumber(attunement.max),
      label: formatPair(getNumber(attunement.value) ?? countAttunedItems(getCollectionContents(actor.items) as Dnd5eInventoryItem[]), getNumber(attunement.max))
    },
    containers: containers.map(container => buildContainer(container, childrenByContainer.get(getItemId(container)) ?? []))
  };
}

function buildCurrency(currency: Record<string, unknown>, canUpdate: boolean): Dnd5eInventoryStatus["currency"] {
  const values = CURRENCY_ORDER.map(id => ({
    id,
    label: id,
    name: getCurrencyLabel(id),
    icon: getCurrencyIconPath(id),
    value: getNumber(currency[id]) ?? 0,
    canUpdate,
    options: []
  }));
  const nonZero = values.filter(coin => coin.value !== 0);
  const total = nonZero.find(coin => coin.id === "gp") ?? nonZero[0];

  return {
    total: total ? `${formatNumber(total.value)} ${total.label}` : "0 gp",
    coins: nonZero.length > 0 ? nonZero.map(coin => `${formatNumber(coin.value)} ${coin.label}`).join(", ") : localize("POCKETFOUNDRY.DND5E.Inventory.NoCoins", "No coins"),
    values
  };
}

function buildContainer(container: Dnd5eInventoryItem, children: Dnd5eInventoryItem[]): Dnd5eInventoryContainerViewModel {
  const capacity = getObject(getObject(container.system)?.capacity);
  const value = getNumber(capacity?.value) ?? sumItemWeight(children);
  const max = getNumber(capacity?.max);
  const units = getString(capacity?.units) || "lb.";
  const contentsLabel = getContainerContentsLabel(children);
  return {
    id: getItemId(container),
    uuid: getItemUuid(container),
    name: container.name?.trim() || localizeSystemKey("TYPES.Item.container", "Container"),
    iconText: getInitials(container.name ?? localizeSystemKey("TYPES.Item.container", "Container"), "C"),
    capacityLabel: max === null ? contentsLabel : `${formatNumber(value)} / ${formatNumber(max)} ${units}`,
    pct: getPercent(value, max),
    contents: children.map(item => item.name?.trim()).filter(Boolean).join(", ") || localize("POCKETFOUNDRY.Empty.Generic", "Empty")
  };
}

/** Enriches contained item descriptions through the same path as top-level rows. */
async function enrichInventoryRows(
  rows: Dnd5eInventoryItemViewModel[],
  documents: Dnd5eInventoryItem[],
  enrichHtml: RichTextHtmlEnricher,
  secrets: boolean
): Promise<Dnd5eInventoryItemViewModel[]> {
  const enriched = await enrichDescriptionRows(rows, documents, { enrichHtml, secrets });
  return Promise.all(enriched.map(async row => ({
    ...row,
    children: await enrichInventoryRows(row.children, documents, enrichHtml, secrets)
  })));
}

function buildSections(
  items: Dnd5eInventoryItem[],
  childrenByContainer: Map<string, Dnd5eInventoryItem[]>,
  canUpdate: boolean,
  searchQuery: string
): Dnd5eInventorySectionViewModel[] {
  const visibleParents = getVisibleInventoryItems(items, searchQuery);
  const grouped = new Map<string, Dnd5eInventoryItem[]>();

  for (const item of visibleParents) {
    const sectionId = getInventorySectionId(item);
    grouped.set(sectionId, [...(grouped.get(sectionId) ?? []), item]);
  }

  return SECTION_ORDER.map(id => {
    const sectionItems = grouped.get(id) ?? [];
    return {
      id,
      label: getInventorySectionLabel(id),
      weight: formatWeight(sumItemWeight(sectionItems)),
      listColumns: getListColumns(id),
      items: sectionItems.map(item => buildItemViewModel(item, id, childrenByContainer, canUpdate)),
      empty: sectionItems.length === 0
    };
  }).filter(section => !section.empty);
}

function getVisibleInventoryItems(items: Dnd5eInventoryItem[], searchQuery: string): Dnd5eInventoryItem[] {
  if (!searchQuery) return items.filter(item => !getContainerId(item) || item.type === "container");
  const terms = toSearchTerms(searchQuery);
  return items.filter(item => matchesInventorySearch(item, terms));
}

function matchesInventorySearch(item: Dnd5eInventoryItem, terms: string[]): boolean {
  const haystack = (item.name?.trim() || "").toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

/** Builds the shared inventory row for each item, stopping malformed container cycles. */
function buildItemViewModel(
  item: Dnd5eInventoryItem,
  sectionId: InventorySectionId,
  childrenByContainer: Map<string, Dnd5eInventoryItem[]>,
  canUpdate: boolean,
  ancestors: ReadonlySet<string> = new Set()
): Dnd5eInventoryItemViewModel {
  const path = new Set([...ancestors, getItemId(item)]);
  const children = (childrenByContainer.get(getItemId(item)) ?? []).filter(child => !path.has(getItemId(child)));
  const system = getObject(item.system) ?? {};
  const labels = getObject(item.labels) ?? {};
  const quantity = getNumber(system.quantity);
  const equipped = getBooleanOrNull(system.equipped);
  const attuned = isAttunableItem(system) ? system.attuned === true : null;
  const prepared = getBooleanOrNull(system.prepared);
  const identified = getBooleanOrNull(system.identified);
  const uses = getObject(system.uses);
  const primary = getPrimaryValue(item, system, labels);
  const containerName = getString(getObject(system.container)?.name) || getString(system.containerName);
  const damage = getDamageLabel(labels);
  const contents = children.map(child => child.name?.trim()).filter(Boolean).join(", ") || localize("POCKETFOUNDRY.Empty.Generic", "Empty");
  const usesLabel = getUsesLabel(uses);
  const usesMax = getNumber(uses?.max);
  const usesCurrent = usesMax === null ? null : getNumber(uses?.value) ?? getRemainingUses(uses) ?? usesMax;
  const quantityAdjustment = canUpdate && item.type !== "container" && quantity !== null ? buildAdjustment("quantity", quantity, null, formatNullableQuantity(quantity)) : null;
  const chargesAdjustment = canUpdate && usesMax !== null && usesCurrent !== null ? buildAdjustment("charges", usesCurrent, usesMax, usesLabel) : null;
  const favoriteToggleState = buildOptionalDnd5eFavoriteToggleState(item.parent, canUpdate, isFavorite(item));

  const itemViewModel: Dnd5eInventoryItemViewModel = {
    outOfStock: quantity === 0,
    isContainer: item.type === "container",
    id: getItemId(item),
    dialogItemId: [...path].join("-"),
    sectionId,
    uuid: getItemUuid(item),
    name: item.name?.trim() || localize("POCKETFOUNDRY.Document.UnnamedItem", "Unnamed Item"),
    icon: item.img || null,
    iconText: getInitials(item.name ?? "Item", "I"),
    type: item.type ?? "item",
    subtitle: getSubtitle(item, system),
    primary: primary.value,
    primaryLabel: primary.label,
    quantity,
    weight: formatWeight(getNumber(system.totalWeight) ?? getNumber(system.weight)),
    price: getPriceLabel(system),
    roll: formatAttackValue(getString(labels.modifier), ""),
    damage,
    listFormula: item.type === "weapon" ? damage || "-" : formatWeight(getNumber(system.totalWeight) ?? getNumber(system.weight)),
    valueLabel: getValueLabel(item, system, labels),
    usesLabel,
    facts: buildFacts(item, sectionId, system, labels, damage, containerName),
    description: getItemDescription(system),
    containerId: getContainerId(item),
    containerName,
    contents,
    children: children.map(child => buildItemViewModel(child, SECTION_ORDER.find(id => id === getInventorySectionId(child)) ?? "loot", childrenByContainer, canUpdate, path)),
    chips: buildChips(item, { equipped, attuned, prepared, identified }, containerName),
    listCells: [],
    quantityAdjustment,
    chargesAdjustment,
    adjustments: [quantityAdjustment, chargesAdjustment].filter((adjustment): adjustment is Dnd5eInventoryAdjustmentViewModel => adjustment !== null),
    actions: {
      canUpdate,
      canAdjustQuantity: canUpdate && item.type !== "container" && quantity !== null,
      canRecharge: canUpdate && item.hasRecharge === true && typeof uses?.rollRecharge === "function",
      canToggleEquipped: canUpdate && typeof equipped === "boolean",
      canToggleAttuned: canUpdate && attuned !== null,
      canTogglePrepared: canUpdate && typeof prepared === "boolean",
      canMoveContainer: canUpdate,
      canRemoveContainer: canUpdate && Boolean(getContainerId(item)),
      ...(favoriteToggleState.canToggleFavorite ? { canToggleFavorite: favoriteToggleState.canToggleFavorite } : {})
    },
    ...(favoriteToggleState.canToggleFavorite ? { favorite: favoriteToggleState.favorite } : {}),
    states: { equipped, attuned, prepared, identified }
  };

  itemViewModel.listCells = buildListCells(sectionId, itemViewModel);
  return itemViewModel;
}

/** Keeps full column names for accessibility while providing localized compact headings. */
function getListColumns(sectionId: InventorySectionId): Dnd5eInventoryListColumnViewModel[] {
  const abbreviations: Record<string, string> = { quantity: "Qty.", weight: "Wt.", capacity: "Cap." };
  return SECTION_CONFIG[sectionId].listColumns.map(column => ({
    ...column,
    label: getInventoryColumnLabel(column.id, column.label),
    ...(abbreviations[column.id] ? { shortLabel: localize(`POCKETFOUNDRY.DND5E.Table.Short.${column.id}`, abbreviations[column.id]) } : {})
  }));
}

function getInventorySectionLabel(sectionId: InventorySectionId): string {
  return localizeSystemKey(getInventorySectionKey(sectionId), SECTION_CONFIG[sectionId].label);
}

function getInventoryColumnLabel(columnId: string, fallback: string): string {
  const key = getInventoryColumnKey(columnId);
  return key ? localizeSystemKey(key, fallback) : fallback;
}

function buildListCells(sectionId: InventorySectionId, item: Dnd5eInventoryItemViewModel): Dnd5eInventoryListCellViewModel[] {
  if (sectionId === "weapon") {
    return [
      { id: "roll", value: item.roll || "-", emphasis: true, adjustment: null },
      { id: "formula", value: item.damage || "-", emphasis: false, adjustment: null },
      { id: "charges", value: item.usesLabel, emphasis: false, adjustment: item.chargesAdjustment }
    ];
  }
  if (sectionId === "equipment" || sectionId === "tool") {
    return [
      { id: "weight", value: item.weight, emphasis: false, adjustment: null },
      { id: "quantity", value: formatNullableQuantity(item.quantity), emphasis: false, adjustment: item.quantityAdjustment },
      { id: "charges", value: item.usesLabel, emphasis: false, adjustment: item.chargesAdjustment }
    ];
  }
  if (sectionId === "consumable") {
    return [
      { id: "quantity", value: formatNullableQuantity(item.quantity), emphasis: false, adjustment: item.quantityAdjustment },
      { id: "charges", value: item.usesLabel, emphasis: false, adjustment: item.chargesAdjustment },
      { id: "weight", value: item.weight, emphasis: false, adjustment: null }
    ];
  }
  if (sectionId === "container") {
    return [
      { id: "capacity", value: item.primary || "-", emphasis: false, adjustment: null },
      { id: "contents", value: formatContainerItemCount(item.children.length), emphasis: false, adjustment: null },
      { id: "quantity", value: formatNullableQuantity(item.quantity), emphasis: false, adjustment: item.quantityAdjustment }
    ];
  }
  return [
    { id: "quantity", value: formatNullableQuantity(item.quantity), emphasis: false, adjustment: item.quantityAdjustment },
    { id: "weight", value: item.weight, emphasis: false, adjustment: null },
    { id: "value", value: item.price || "-", emphasis: false, adjustment: null }
  ];
}

function buildAdjustment(id: "quantity" | "charges", current: number, max: number | null, value: string): Dnd5eInventoryAdjustmentViewModel {
  return {
    id,
    title: id === "charges" ? localize("POCKETFOUNDRY.DND5E.Inventory.AdjustCharges", "Adjust Charges") : localize("POCKETFOUNDRY.DND5E.Inventory.AdjustQuantity", "Adjust Quantity"),
    label: id === "charges" && max !== null ? `${formatNumber(current)} / ${formatNumber(max)}` : formatNumber(current),
    value,
    current,
    max,
    options: buildSignedAdjustmentOptions(current, max)
  };
}

function buildChildrenByContainer(items: Dnd5eInventoryItem[]): Map<string, Dnd5eInventoryItem[]> {
  const groups = new Map<string, Dnd5eInventoryItem[]>();
  for (const item of items) {
    const containerId = getContainerId(item);
    if (!containerId) continue;
    groups.set(containerId, [...(groups.get(containerId) ?? []), item]);
  }
  return groups;
}

function getInventorySectionId(item: Dnd5eInventoryItem): string {
  const system = getObject(item.system) ?? {};
  const preparedSection = getString(system.inventorySection) || getString(system.section);
  if (SECTION_ORDER.includes(preparedSection as InventorySectionId)) return preparedSection;
  return normalizeSectionId(item.type);
}

function normalizeSectionId(type: string | undefined): string {
  if (type === "weapon" || type === "equipment" || type === "consumable" || type === "tool" || type === "loot" || type === "container") return type;
  if (type === "armor") return "equipment";
  return "";
}

function getSubtitle(item: Dnd5eInventoryItem, system: Record<string, unknown>): string {
  const type = getObject(system.type);
  const activation = getString(getObject(system.activation)?.type);
  return [getString(type?.label) || item.type || localize("POCKETFOUNDRY.Document.Item", "Item"), activation].filter(Boolean).join(" - ");
}

function getPrimaryValue(item: Dnd5eInventoryItem, system: Record<string, unknown>, labels: Record<string, unknown>): { label: string; value: string } {
  const modifier = getString(labels.modifier);
  if (item.type === "weapon" && modifier) return { label: localizeSystemKey("DND5E.Roll", "Roll"), value: formatAttackValue(modifier) };
  const ac = getObject(system.armor);
  const acValue = getNumber(ac?.value);
  if (item.type === "armor" && acValue !== null && acValue > 0) return { label: localizeSystemKey("DND5E.ArmorClass", "Armor Class"), value: String(acValue) };
  if (item.type === "equipment" && acValue !== null && acValue > 0) return { label: localizeSystemKey("DND5E.ArmorClass", "Armor Class"), value: String(acValue) };
  if (item.type === "container") {
    const capacity = getObject(system.capacity);
    const value = getNumber(capacity?.value);
    const max = getNumber(capacity?.max);
    return value === null && max === null
      ? { label: localizeSystemKey("TYPES.Item.container", "Container"), value: "" }
      : { label: localizeSystemKey("DND5E.CONTAINER.FIELDS.capacity.label", "Capacity"), value: formatPair(value, max) };
  }
  const uses = getObject(system.uses);
  const usesValue = getNumber(uses?.value) ?? getRemainingUses(uses);
  const usesMax = getNumber(uses?.max);
  if (usesValue !== null || usesMax !== null) return { label: localizeSystemKey("DND5E.Uses", "Uses"), value: formatPair(usesValue, usesMax) };
  const quantity = getNumber(system.quantity);
  return quantity === null ? { label: "", value: "" } : { label: localizeSystemKey("DND5E.Quantity", "Quantity"), value: String(quantity) };
}

function getValueLabel(item: Dnd5eInventoryItem, system: Record<string, unknown>, labels: Record<string, unknown>): string {
  if (item.type === "container") {
    const capacity = getObject(system.capacity);
    const value = getNumber(capacity?.value);
    const max = getNumber(capacity?.max);
    return value === null && max === null ? "" : formatPair(value, max);
  }
  return getDamageLabel(labels) || getPriceLabel(system) || "-";
}

function getDamageLabel(labels: Record<string, unknown>): string {
  const damages = labels.damages;
  if (Array.isArray(damages)) return damages.map(value => getString(value) || getString(getObject(value)?.formula)).filter(Boolean).join(", ");
  return getString(damages) || getString(labels.damage) || getString(labels.formula);
}

function getPriceLabel(system: Record<string, unknown>): string {
  const price = getObject(system.price);
  const value = getNumber(price?.value) ?? getNumber(system.price);
  const denomination = getString(price?.denomination) || "gp";
  return value === null ? "" : `${formatNumber(value)} ${denomination}`;
}

function buildFacts(
  item: Dnd5eInventoryItem,
  sectionId: InventorySectionId,
  system: Record<string, unknown>,
  labels: Record<string, unknown>,
  damage: string,
  containerName: string
): Dnd5eInventoryItemFactViewModel[] {
  const facts: Dnd5eInventoryItemFactViewModel[] = [];
  const armor = getObject(system.armor);
  const ac = getNumber(armor?.value);
  const range = getString(labels.range);
  const quantity = getNumber(system.quantity);
  const weight = formatWeight(getNumber(system.totalWeight) ?? getNumber(system.weight));
  const price = getPriceLabel(system);

  const shownFacts = new Set<InventoryFactField>(SECTION_CONFIG[sectionId].shownFactFields);

  if (item.type === "weapon" && damage && !shownFacts.has("damage")) facts.push({ label: localizeSystemKey("DND5E.Damage", "Damage"), value: damage });
  if (item.type === "weapon" && range) facts.push({ label: localizeSystemKey("DND5E.Range", "Range"), value: range });
  if (item.type === "equipment" && ac !== null && ac > 0) facts.push({ label: localizeSystemKey("DND5E.ArmorClass", "Armor Class"), value: String(ac) });
  if (item.type === "armor" && ac !== null && ac > 0) facts.push({ label: localizeSystemKey("DND5E.ArmorClass", "Armor Class"), value: String(ac) });
  if (item.type !== "container") {
    const usesLabel = getUsesLabel(getObject(system.uses));
    if (usesLabel !== "-" && !shownFacts.has("charges")) facts.push({ label: localizeSystemKey("DND5E.Uses", "Uses"), value: usesLabel });
  }
  if (quantity !== null && !shownFacts.has("quantity")) facts.push({ label: localizeSystemKey("DND5E.Quantity", "Quantity"), value: String(quantity) });
  if (weight !== "-" && !shownFacts.has("weight")) facts.push({ label: localizeSystemKey("DND5E.Weight", "Weight"), value: weight });
  if (price && !shownFacts.has("value")) facts.push({ label: localizeSystemKey("DND5E.Value", "Value"), value: price });
  if (containerName) facts.push({ label: localizeSystemKey("TYPES.Item.container", "Container"), value: containerName });

  return facts;
}

function getItemDescription(system: Record<string, unknown>): string {
  const description = getObject(system.description);
  return getString(description?.value) || getString(description?.chat) || getString(system.description);
}

function buildChips(
  item: Dnd5eInventoryItem,
  states: Dnd5eInventoryItemViewModel["states"],
  containerName: string
): string[] {
  const chips = [
    containerName ? localize("POCKETFOUNDRY.DND5E.Inventory.InContainer", "In {name}", { name: containerName }) : "",
    states.identified === false ? localizeSystemKey("DND5E.Unidentified.Title", "Unidentified") : "",
    item.type === "container" ? localizeSystemKey("TYPES.Item.container", "Container") : ""
  ];
  return uniqueStrings(chips);
}

function findOwnedItem(actor: Dnd5eInventoryActor | null | undefined, itemId: string): Dnd5eInventoryItem | null {
  if (!actor) return null;
  return (getCollectionContents(actor.items) as Dnd5eInventoryItem[]).find(item => item.id === itemId || item._id === itemId || item.uuid === itemId) ?? null;
}

function getItemId(item: Dnd5eInventoryItem): string {
  return getEntityId(item);
}

function getItemUuid(item: Dnd5eInventoryItem): string {
  return getEntityUuid(item);
}

function isFavorite(item: Dnd5eInventoryItem): boolean {
  const actor = item.parent;
  const id = getItemId(item);
  const uuid = getItemUuid(item);
  return hasDnd5eFavoriteReference(actor, [id, uuid], ["id", "uuid"]);
}

function getContainerId(item: Dnd5eInventoryItem): string {
  const container = getObject(item.system)?.container;
  if (typeof container === "string") return container;
  return getString(getObject(container)?.id) || getString(getObject(container)?._id);
}

function countAttunedItems(items: Dnd5eInventoryItem[]): number {
  return items.filter(item => getObject(item.system)?.attuned === true).length;
}

function sumItemWeight(items: Dnd5eInventoryItem[]): number {
  return items.reduce((total, item) => total + (getNumber(getObject(item.system)?.totalWeight) ?? getNumber(getObject(item.system)?.weight) ?? 0), 0);
}

function getBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isAttunableItem(system: Record<string, unknown>): boolean {
  const attunement = system.attunement;
  if (typeof attunement === "number") return attunement > 0;
  if (typeof attunement === "string") return attunement !== "" && attunement !== "none" && attunement !== "0";

  const attunementObject = getObject(attunement);
  const value = getNumber(attunementObject?.value) ?? getNumber(attunementObject?.required);
  if (value !== null) return value > 0;

  const required = attunementObject?.required;
  if (typeof required === "boolean") return required;

  return false;
}

function getContainerContentsLabel(children: Dnd5eInventoryItem[]): string {
  if (children.length === 0) return localize("POCKETFOUNDRY.DND5E.Inventory.EmptyContainer", "Empty container");
  if (children.length === 1) return localize("POCKETFOUNDRY.DND5E.Inventory.ItemCount.One", "1 item");
  return localize("POCKETFOUNDRY.DND5E.Inventory.ItemCount.Many", "{count} items", { count: children.length });
}


function formatContainerItemCount(count: number): string {
  return String(Math.max(0, Math.trunc(count)));
}

function formatWeight(value: number | null): string {
  return value === null ? "-" : formatNumber(value);
}

function formatNullableQuantity(value: number | null): string {
  return value === null ? "-" : formatNumber(value);
}

function getPercent(value: number, max: number | null): number {
  if (max === null || max <= 0) return 0;
  return clampNumber(Math.round((value / max) * 100), 0, 100);
}

function getCurrencyIconPath(id: string): string {
  if (id === "pp") return "systems/dnd5e/icons/currency/platinum.webp";
  if (id === "gp") return "systems/dnd5e/icons/currency/gold.webp";
  if (id === "ep") return "systems/dnd5e/icons/currency/electrum.webp";
  if (id === "sp") return "systems/dnd5e/icons/currency/silver.webp";
  return "systems/dnd5e/icons/currency/copper.webp";
}

function getCurrencyLabel(id: string): string {
  if (id === "pp") return localizeSystemKey("DND5E.CurrencyPP", "Platinum");
  if (id === "gp") return localizeSystemKey("DND5E.CurrencyGP", "Gold");
  if (id === "ep") return localizeSystemKey("DND5E.CurrencyEP", "Electrum");
  if (id === "sp") return localizeSystemKey("DND5E.CurrencySP", "Silver");
  return localizeSystemKey("DND5E.CurrencyCP", "Copper");
}

function getInventorySectionKey(sectionId: InventorySectionId): string {
  if (sectionId === "weapon") return "TYPES.Item.weaponPl";
  if (sectionId === "equipment") return "TYPES.Item.equipmentPl";
  if (sectionId === "consumable") return "TYPES.Item.consumablePl";
  if (sectionId === "tool") return "TYPES.Item.toolPl";
  if (sectionId === "loot") return "TYPES.Item.lootPl";
  return "TYPES.Item.containerPl";
}

function getInventoryColumnKey(columnId: string): string | null {
  if (columnId === "roll") return "DND5E.Roll";
  if (columnId === "weight") return "DND5E.Weight";
  if (columnId === "quantity") return "DND5E.Quantity";
  if (columnId === "value") return "DND5E.Value";
  if (columnId === "charges") return "DND5E.UsesPeriods.Charges";
  if (columnId === "formula") return "DND5E.SpellHeader.Formula";
  if (columnId === "contents") return "DND5E.Container";
  return null;
}
