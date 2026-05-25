import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../../core/utils.ts";
import { getFoundryRuntime } from "../../core/foundry-globals.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";
import { enrichSectionRows } from "../../services/rich-text-enrichment.ts";
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
  hasFavoriteReference,
  isGmUser,
  normalizeSearchQuery,
  toSearchTerms,
  uniqueStrings
} from "./view-model-helpers.ts";

export type Dnd5eFeaturesActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  type?: string;
  name?: string;
  system?: Record<string, unknown>;
  items?: unknown;
  classes?: Record<string, Dnd5eFeaturesItem>;
  updateEmbeddedDocuments?: (embeddedName: "Item", updates: Array<Record<string, unknown>>) => Promise<unknown>;
  endConcentration?: (item: Dnd5eFeaturesItem) => Promise<unknown>;
};

export type Dnd5eFeaturesItem = PermissionCheckedDocument & {
  id?: string;
  _id?: string;
  uuid?: string;
  name?: string;
  type?: string;
  img?: string | null;
  identifier?: string;
  class?: Dnd5eFeaturesItem;
  parent?: Dnd5eFeaturesActor | null;
  flags?: Record<string, unknown>;
  system?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  hasRecharge?: boolean;
  hasLimitedUses?: boolean;
  isActive?: boolean;
  isOnCooldown?: boolean;
  isOwner?: boolean;
  use?: (eventOrOptions?: unknown, options?: unknown) => Promise<unknown>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  getFlag?: (scope: string, key: string) => unknown;
  getChatData?: (options?: { secrets?: boolean }) => Promise<unknown>;
};

export type Dnd5eFeatureActivity = {
  id?: string;
  _id?: string;
  name?: string;
  img?: string | null;
  canUse?: boolean;
  activation?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  range?: Record<string, unknown>;
  save?: Record<string, unknown>;
  uses?: Record<string, unknown>;
  prepareSheetContext?: () => Record<string, unknown>;
  use?: (eventOrOptions?: unknown, options?: unknown) => Promise<unknown>;
};

export type Dnd5eFeaturesStatusCard = {
  id: string;
  uuid: string;
  name: string;
  icon: string | null;
  iconText: string;
  primary: string;
  secondary: string;
};

export type Dnd5eFeatureSectionId = string;

export type Dnd5eFeatureSectionViewModel = {
  id: Dnd5eFeatureSectionId;
  label: string;
  count: number;
  empty: boolean;
  items: Dnd5eFeatureItemViewModel[];
};

export type Dnd5eFeatureItemViewModel = {
  id: string;
  uuid: string;
  name: string;
  icon: string | null;
  iconText: string;
  type: string;
  subtitle: string;
  source: string;
  sectionId: Dnd5eFeatureSectionId;
  sectionLabel: string;
  activation: string;
  usesLabel: string;
  recovery: string;
  level: string;
  state: string;
  usesPct: number;
  chips: string[];
  facts: Array<{ label: string; value: string }>;
  description: string;
  activities: Dnd5eFeatureActivityViewModel[];
  adjustments: Dnd5eFeatureAdjustmentViewModel[];
  actions: {
    canUpdate: boolean;
    canUse: boolean;
    canRecharge: boolean;
    canAdjustUses: boolean;
    canToggleFavorite: boolean;
    canEndConcentration: boolean;
  };
  favorite: boolean;
  concentrating: boolean;
};

export type Dnd5eFeatureActivityViewModel = {
  id: string;
  name: string;
  icon: string | null;
  iconText: string;
  activation: string;
  range: string;
  target: string;
  save: string;
  toHit: string;
  usesLabel: string;
  chips: string[];
  canUse: boolean;
};

export type Dnd5eFeatureAdjustmentViewModel = {
  id: "uses";
  title: string;
  label: string;
  value: string;
  current: number;
  max: number;
  options: Dnd5eFeatureDeltaOption[];
};

export type Dnd5eFeatureDeltaOption = {
  value: number;
  label: string;
  center: boolean;
};

export type Dnd5eFeaturesViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  searchQuery: string;
  canClearSearch: boolean;
  status: Dnd5eFeaturesStatusCard[];
  sections: Dnd5eFeatureSectionViewModel[];
};

export type UnavailableDnd5eFeaturesViewModel = {
  unavailable: true;
  title: "Features Unavailable";
  body: "These features are not available to the current user.";
};

export type Dnd5eFeaturesModel = Dnd5eFeaturesViewModel | UnavailableDnd5eFeaturesViewModel;

export type Dnd5eFeaturesControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden" | "unsupported";
};

export async function buildDnd5eFeaturesViewModel(options: {
  actor: Dnd5eFeaturesActor | null | undefined;
  user: FoundryUserLike;
  searchQuery?: string;
}): Promise<Dnd5eFeaturesModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Features Unavailable",
      body: "These features are not available to the current user."
    };
  }

  const canUpdate = canUpdateDocument(actor, options.user);
  const searchQuery = normalizeSearchQuery(options.searchQuery);
  const allItems = getVisibleOwnedItems(actor, options.user);
  const featureItems = allItems.filter(isFeatureListItem);
  const textEditor = getFoundryRuntime().TextEditor;
  const enrichHTML = textEditor?.enrichHTML;
  const featureRowsInput = featureItems.map(item => buildFeatureItemViewModel(actor, item, allItems, canUpdate));
  const sectionsInput = filterFeatureSections(buildFeatureSections(featureRowsInput), searchQuery);
  const sections = typeof enrichHTML === "function"
    ? await enrichSectionRows(sectionsInput, {
        getRows: section => section.items,
        setRows: (section, items) => ({ ...section, items }),
        documents: featureItems,
        enrichHtml: enrichHTML.bind(textEditor),
        secrets: isGmUser(options.user)
      })
    : sectionsInput;

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate,
    searchQuery,
    canClearSearch: searchQuery.length > 0,
    status: buildProgressionStatus(actor, allItems),
    sections
  };
}

export async function useFeatureItem(actor: Dnd5eFeaturesActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };
  if (typeof item.use !== "function") return { ok: false, reason: "unsupported" };

  const activities = getUsableActivities(item);
  if (activities.length > 1) return { ok: false, reason: "unsupported" };

  await item.use(undefined, { options: { sheet: null } });
  return { ok: true };
}

export async function useFeatureActivity(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  activityId: string
): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  const activity = item ? findActivity(item, activityId) : null;
  if (!actor || !item || !activity) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };
  if (activity.canUse === false || typeof activity.use !== "function") return { ok: false, reason: "unsupported" };

  await activity.use(undefined, { options: { sheet: null } });
  return { ok: true };
}

export async function adjustFeatureRemainingUses(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  delta: number
): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };

  const current = getNumber(uses?.value) ?? getRemainingUses(uses) ?? max;
  return setFeatureRemainingUses(actor, user, itemId, current + delta);
}

export async function setFeatureRemainingUses(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  remainingUses: number
): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };

  return updateOwnedItem(actor, user, itemId, { "system.uses.spent": max - clampNumber(Math.trunc(remainingUses), 0, max) });
}

export async function rechargeFeature(actor: Dnd5eFeaturesActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };

  const uses = getObject(getObject(item.system)?.uses);
  const rollRecharge = uses?.rollRecharge;
  if (item.hasRecharge !== true || typeof rollRecharge !== "function") return { ok: false, reason: "unsupported" };

  await (rollRecharge as (options: { apply: boolean }) => Promise<unknown>).call(uses, { apply: true });
  return { ok: true };
}

export async function setFeatureFavorite(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  favorite: boolean
): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };

  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return { ok: false, reason: "unsupported" };

  await (action as (target: Dnd5eFeaturesItem | string) => Promise<unknown>).call(system, item);
  return { ok: true };
}

export async function endFeatureConcentration(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string
): Promise<Dnd5eFeaturesControlResult> {
  const item = findOwnedItem(actor, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedItem(actor, item, user)) return { ok: false, reason: "forbidden" };
  if (typeof actor.endConcentration !== "function") return { ok: false, reason: "unsupported" };

  await actor.endConcentration(item);
  return { ok: true };
}

async function updateOwnedItem(
  actor: Dnd5eFeaturesActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  update: Record<string, unknown>
): Promise<Dnd5eFeaturesControlResult> {
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

function buildProgressionStatus(actor: Dnd5eFeaturesActor, allItems: Dnd5eFeaturesItem[]): Dnd5eFeaturesStatusCard[] {
  const classes = getClassItems(actor, allItems);
  const subclasses = allItems.filter(item => item.type === "subclass");
  const species = getDetailItem(actor, allItems, "race") ?? getDetailItem(actor, allItems, "species");
  const background = getDetailItem(actor, allItems, "background");
  const cards: Dnd5eFeaturesStatusCard[] = [];

  for (const cls of classes) {
    const subclass = getSubclassForClass(cls, subclasses);
    cards.push({
      id: getItemId(cls),
      uuid: getItemUuid(cls),
      name: getFeatureName(cls, "Class"),
      icon: cls.img || null,
      iconText: getInitials(cls.name ?? "Class", "C"),
      primary: `${getFeatureName(cls, "Class")} ${getClassLevel(cls) || ""}`.trim(),
      secondary: subclass ? getFeatureName(subclass, "Subclass") : "Class progression"
    });
  }

  for (const subclass of subclasses.filter(subclass => !cards.some(card => card.secondary === getFeatureName(subclass, "Subclass")))) {
    cards.push({
      id: getItemId(subclass),
      uuid: getItemUuid(subclass),
      name: getFeatureName(subclass, "Subclass"),
      icon: subclass.img || null,
      iconText: getInitials(subclass.name ?? "Subclass", "S"),
      primary: getFeatureName(subclass, "Subclass"),
      secondary: "Subclass"
    });
  }

  if (species) cards.push(buildOriginStatusCard(species, "Species"));
  if (background) cards.push(buildOriginStatusCard(background, "Background"));

  return cards.slice(0, 6);
}

function buildOriginStatusCard(item: Dnd5eFeaturesItem, label: string): Dnd5eFeaturesStatusCard {
  return {
    id: getItemId(item),
    uuid: getItemUuid(item),
    name: getFeatureName(item, label),
    icon: item.img || null,
    iconText: getInitials(item.name ?? label, label[0] ?? "F"),
    primary: getFeatureName(item, label),
    secondary: label
  };
}

function buildFeatureItemViewModel(
  actor: Dnd5eFeaturesActor,
  item: Dnd5eFeaturesItem,
  allItems: Dnd5eFeaturesItem[],
  canUpdate: boolean
): Dnd5eFeatureItemViewModel {
  const system = getObject(item.system) ?? {};
  const labels = getObject(item.labels) ?? {};
  const uses = getObject(system.uses);
  const max = getNumber(uses?.max);
  const current = max === null ? null : getNumber(uses?.value) ?? getRemainingUses(uses) ?? max;
  const usesLabel = formatPair(current, max);
  const activities = getUsableActivities(item).map(activity => buildActivityViewModel(activity));
  const activation = getString(labels.activation) || activities[0]?.activation || getActivationLabel(system);
  const origin = getFeatureOrigin(actor, item, allItems);
  const source = origin.source;
  const subtitle = [getString(getObject(system.type)?.label) || getFeatureTypeLabel(item), activation].filter(Boolean).join(" - ");
  const favorite = isFavorite(actor, item);
  const concentrating = isConcentrating(actor, item);
  const adjustment = canUpdate && max !== null && current !== null ? buildAdjustment(current, max, usesLabel) : null;

  return {
    id: getItemId(item),
    uuid: getItemUuid(item),
    name: getFeatureName(item, "Feature"),
    icon: item.img || null,
    iconText: getInitials(item.name ?? "Feature", "F"),
    type: item.type ?? "feat",
    subtitle,
    source,
    sectionId: origin.sectionId,
    sectionLabel: origin.sectionLabel,
    activation: activation || "-",
    usesLabel,
    recovery: getString(labels.recovery) || getRecoveryLabel(uses),
    level: getFeatureLevel(item),
    state: isPassiveFeature(item) ? "Passive" : item.isOnCooldown ? "Cooldown" : "Active",
    usesPct: max && current !== null ? clampNumber(Math.round((current / max) * 100), 0, 100) : 0,
    chips: uniqueStrings([source, activation, getString(labels.recovery), usesLabel === "-" ? "" : `Uses ${usesLabel}`, favorite ? "Favorite" : "", concentrating ? "Concentration" : ""]),
    facts: buildFacts(item, source, activation, usesLabel),
    description: getFeatureDescription(system),
    activities,
    adjustments: adjustment ? [adjustment] : [],
    actions: {
      canUpdate,
      canUse: canUpdate && !isPassiveFeature(item) && typeof item.use === "function" && activities.length <= 1,
      canRecharge: canUpdate && item.hasRecharge === true && typeof uses?.rollRecharge === "function",
      canAdjustUses: adjustment !== null,
      canToggleFavorite: canUpdate && (typeof getObject(actor.system)?.addFavorite === "function" || typeof getObject(actor.system)?.removeFavorite === "function"),
      canEndConcentration: canUpdate && concentrating && typeof actor.endConcentration === "function"
    },
    favorite,
    concentrating
  };
}

function buildFeatureSections(rows: Dnd5eFeatureItemViewModel[]): Dnd5eFeatureSectionViewModel[] {
  const sections = new Map<Dnd5eFeatureSectionId, Dnd5eFeatureSectionViewModel>();
  for (const row of rows) {
    const existing = sections.get(row.sectionId);
    if (existing) {
      existing.items.push(row);
      existing.count += 1;
      existing.empty = false;
    } else {
      sections.set(row.sectionId, {
        id: row.sectionId,
        label: row.sectionLabel,
        count: 1,
        empty: false,
        items: [row]
      });
    }
  }

  const order = (section: Dnd5eFeatureSectionViewModel): number => {
    if (section.id.startsWith("class:")) return 100;
    if (section.id === "species") return 1000;
    if (section.id === "background") return 2000;
    if (section.id === "other") return 3000;
    return 4000;
  };

  return [...sections.values()].sort((left, right) => order(left) - order(right) || left.label.localeCompare(right.label));
}

function filterFeatureSections(sections: Dnd5eFeatureSectionViewModel[], query: string): Dnd5eFeatureSectionViewModel[] {
  if (!query) return sections;
  const terms = toSearchTerms(query);
  return sections
    .map(section => {
      const items = section.items.filter(item => matchesFeatureSearch(item, terms));
      return { ...section, items, count: items.length, empty: items.length === 0 };
    })
    .filter(section => section.items.length > 0);
}

function matchesFeatureSearch(item: Dnd5eFeatureItemViewModel, terms: string[]): boolean {
  const haystack = item.name.toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

function buildActivityViewModel(activity: Dnd5eFeatureActivity): Dnd5eFeatureActivityViewModel {
  const prepared = typeof activity.prepareSheetContext === "function" ? activity.prepareSheetContext() : {};
  const labels = getObject(prepared.labels) ?? getObject(activity.labels) ?? {};
  const activation = getString(labels.activation) || getActivityActivationLabel(getObject(prepared.activation) ?? getObject(activity.activation));
  const uses = getObject(prepared.uses) ?? getObject(activity.uses);
  const save = getObject(prepared.save) ?? getObject(activity.save);
  const range = getObject(prepared.range) ?? getObject(activity.range);
  const modifier = getString(labels.modifier);

  return {
    id: getString(prepared._id) || getString(prepared.id) || activity._id || activity.id || "",
    name: getString(prepared.name) || activity.name || "Activity",
    icon: getString(prepared.img) || activity.img || null,
    iconText: getInitials(getString(prepared.name) || activity.name || "Activity", "A"),
    activation: activation || "-",
    range: getString(labels.range) || getString(range?.label) || "-",
    target: getString(labels.target) || "-",
    save: getString(labels.save) || getSaveLabel(save),
    toHit: formatAttackValue(modifier),
    usesLabel: getUsesLabel(uses),
    chips: uniqueStrings([activation, getString(labels.range), getString(labels.target), getString(labels.save) || formatAttackValue(modifier), getUsesLabel(uses) === "-" ? "" : `Uses ${getUsesLabel(uses)}`]),
    canUse: activity.canUse !== false && typeof activity.use === "function"
  };
}

function buildFacts(item: Dnd5eFeaturesItem, source: string, activation: string, usesLabel: string): Array<{ label: string; value: string }> {
  const labels = getObject(item.labels) ?? {};
  const facts = [
    { label: "Source", value: source },
    { label: "Activation", value: activation || "-" },
    { label: "Uses", value: usesLabel },
    { label: "Recovery", value: getString(labels.recovery) || "-" }
  ];
  return facts.filter(fact => fact.value);
}

function getFeatureDescription(system: Record<string, unknown>): string {
  const description = getObject(system.description);
  return getString(description?.value) || getString(description?.chat) || getString(system.description);
}

function getVisibleOwnedItems(actor: Dnd5eFeaturesActor, user: FoundryUserLike): Dnd5eFeaturesItem[] {
  return (getCollectionContents(actor.items) as Dnd5eFeaturesItem[]).filter(item => canViewOwnedItem(actor, item, user));
}

function canViewOwnedItem(actor: Dnd5eFeaturesActor, item: Dnd5eFeaturesItem, user: FoundryUserLike): boolean {
  return canViewOwnedDocument(actor, item, user);
}

function canUpdateOwnedItem(actor: Dnd5eFeaturesActor | null | undefined, item: Dnd5eFeaturesItem, user: FoundryUserLike): boolean {
  return canUpdateOwnedDocument(actor, item, user);
}

function isFeatureListItem(item: Dnd5eFeaturesItem): boolean {
  return item.type === "feat" || item.type === "subclass" || item.type === "facility";
}

function getClassItems(actor: Dnd5eFeaturesActor, allItems: Dnd5eFeaturesItem[]): Dnd5eFeaturesItem[] {
  const fromActorClasses = Object.values(actor.classes ?? {});
  const classes = [...fromActorClasses, ...allItems.filter(item => item.type === "class")];
  const byId = new Map<string, Dnd5eFeaturesItem>();
  for (const cls of classes) byId.set(getItemId(cls), cls);
  return [...byId.values()].sort((left, right) => getClassLevel(right) - getClassLevel(left));
}

function getSubclassForClass(cls: Dnd5eFeaturesItem, subclasses: Dnd5eFeaturesItem[]): Dnd5eFeaturesItem | null {
  const clsIdentifier = getClassIdentifier(cls);
  return subclasses.find(subclass => getString(getObject(subclass.system)?.classIdentifier) === clsIdentifier || subclass.class?.identifier === clsIdentifier) ?? null;
}

function getDetailItem(actor: Dnd5eFeaturesActor, allItems: Dnd5eFeaturesItem[], type: "race" | "species" | "background"): Dnd5eFeaturesItem | null {
  const details = getObject(getObject(actor.system)?.details);
  const detail = details?.[type === "species" ? "race" : type];
  if (isItemLike(detail)) return detail;
  return allItems.find(item => item.type === type || (type === "species" && item.type === "race")) ?? null;
}

function getFeatureOrigin(
  actor: Dnd5eFeaturesActor,
  item: Dnd5eFeaturesItem,
  allItems: Dnd5eFeaturesItem[]
): { source: string; sectionId: Dnd5eFeatureSectionId; sectionLabel: string } {
  const originItem = getAdvancementOriginItem(item, allItems);
  if (originItem?.type === "race" || originItem?.type === "species") return { source: getFeatureName(originItem, "Species"), sectionId: "species", sectionLabel: "Species Features" };
  if (originItem?.type === "background") return { source: getFeatureName(originItem, "Background"), sectionId: "background", sectionLabel: "Background Features" };
  if (originItem?.type === "class") return getClassFeatureOrigin(originItem);
  if (originItem?.type === "subclass") return getClassFeatureOrigin(originItem.class ?? getClassForSubclass(originItem, allItems) ?? originItem);

  const typeValue = getString(getObject(getObject(item.system)?.type)?.value);
  if (typeValue === "background") return { source: "Background", sectionId: "background", sectionLabel: "Background Features" };
  if (typeValue === "race" || typeValue === "species") return { source: "Species", sectionId: "species", sectionLabel: "Species Features" };
  if (typeValue === "class" || typeValue === "subclass") return { source: "Class", sectionId: "class", sectionLabel: "Class Features" };

  const species = getDetailItem(actor, allItems, "species");
  const background = getDetailItem(actor, allItems, "background");
  const originName = getString(getObject(item.system)?.source) || getString(getObject(item.system)?.sourceName);
  if (originName && species?.name && originName === species.name) return { source: originName, sectionId: "species", sectionLabel: "Species Features" };
  if (originName && background?.name && originName === background.name) return { source: originName, sectionId: "background", sectionLabel: "Background Features" };

  return { source: "Other", sectionId: "other", sectionLabel: "Other Features" };
}

function getAdvancementOriginItem(item: Dnd5eFeaturesItem, allItems: Dnd5eFeaturesItem[]): Dnd5eFeaturesItem | null {
  const system = getObject(item.system) ?? {};
  const rootItem = system.advancementRootItem;
  if (isItemLike(rootItem)) return rootItem;

  const origin = getString(item.getFlag?.("dnd5e", "advancementRoot")) || getString(item.getFlag?.("dnd5e", "advancementOrigin")) || getString(getObject(item.flags)?.dnd5e && getObject(getObject(item.flags)?.dnd5e)?.advancementRoot) || getString(getObject(item.flags)?.dnd5e && getObject(getObject(item.flags)?.dnd5e)?.advancementOrigin);
  const [originId] = origin.split(".");
  if (!originId) return null;
  return allItems.find(candidate => getItemId(candidate) === originId) ?? null;
}

function getClassFeatureOrigin(classItem: Dnd5eFeaturesItem): { source: string; sectionId: Dnd5eFeatureSectionId; sectionLabel: string } {
  const className = getFeatureName(classItem, "Class");
  const identifier = getClassIdentifier(classItem);
  return {
    source: className,
    sectionId: identifier ? `class:${identifier}` : "class",
    sectionLabel: `${className} Features`
  };
}

function getClassForSubclass(subclass: Dnd5eFeaturesItem, allItems: Dnd5eFeaturesItem[]): Dnd5eFeaturesItem | null {
  const classIdentifier = getString(getObject(subclass.system)?.classIdentifier);
  if (!classIdentifier) return null;
  return allItems.find(item => item.type === "class" && getClassIdentifier(item) === classIdentifier) ?? null;
}

function isPassiveFeature(item: Dnd5eFeaturesItem): boolean {
  const system = getObject(item.system) ?? {};
  return hasSetValue(system.properties, "trait") || getUsableActivities(item).length === 0;
}

function getUsableActivities(item: Dnd5eFeaturesItem): Dnd5eFeatureActivity[] {
  const activities = getObject(item.system)?.activities;
  return (getCollectionContents(activities) as Dnd5eFeatureActivity[]).filter(activity => activity && activity.canUse !== false);
}

function findActivity(item: Dnd5eFeaturesItem, activityId: string): Dnd5eFeatureActivity | null {
  return getUsableActivities(item).find(activity => activity.id === activityId || activity._id === activityId) ?? null;
}

function findOwnedItem(actor: Dnd5eFeaturesActor | null | undefined, itemId: string): Dnd5eFeaturesItem | null {
  if (!actor) return null;
  return (getCollectionContents(actor.items) as Dnd5eFeaturesItem[]).find(item => item.id === itemId || item._id === itemId || item.uuid === itemId) ?? null;
}

function getItemId(item: Dnd5eFeaturesItem): string {
  return getEntityId(item);
}

function getItemUuid(item: Dnd5eFeaturesItem): string {
  return getEntityUuid(item);
}

function getFeatureName(item: Dnd5eFeaturesItem, fallback: string): string {
  return item.name?.trim() || fallback;
}

function getClassLevel(item: Dnd5eFeaturesItem): number {
  return getNumber(getObject(item.system)?.levels) ?? 0;
}

function getClassIdentifier(item: Dnd5eFeaturesItem): string {
  return item.identifier || getString(getObject(item.system)?.identifier) || getItemId(item);
}

function getFeatureTypeLabel(item: Dnd5eFeaturesItem): string {
  if (item.type === "subclass") return "Subclass";
  if (item.type === "facility") return "Facility";
  return "Feature";
}

function getFeatureLevel(item: Dnd5eFeaturesItem): string {
  const level = getNumber(getObject(item.system)?.level) ?? getNumber(getObject(item.flags)?.level);
  return level === null ? "-" : formatNumber(level);
}

function getActivationLabel(system: Record<string, unknown>): string {
  const activation = getObject(system.activation);
  const type = getString(activation?.type);
  const value = getNumber(activation?.value) ?? getNumber(activation?.cost);
  return [value === null ? "" : formatNumber(value), type].filter(Boolean).join(" ");
}

function getActivityActivationLabel(activation: Record<string, unknown> | null): string {
  const type = getString(activation?.type);
  const value = getNumber(activation?.value);
  return [value === null ? "" : formatNumber(value), type].filter(Boolean).join(" ");
}

function getRecoveryLabel(uses: Record<string, unknown> | null): string {
  const recovery = getCollectionContents(uses?.recovery);
  if (!recovery.length) return "-";
  return recovery.map(entry => getString(getObject(entry)?.period)).filter(Boolean).join(", ") || "-";
}

function getSaveLabel(save: Record<string, unknown> | null): string {
  const dc = getNumber(save?.dc) ?? getNumber(getObject(save?.value)?.dc);
  const ability = getString(save?.ability);
  if (dc !== null && ability) return `${ability.toUpperCase()} ${dc}`;
  if (dc !== null) return `DC ${dc}`;
  return ability ? ability.toUpperCase() : "-";
}

function isFavorite(actor: Dnd5eFeaturesActor, item: Dnd5eFeaturesItem): boolean {
  const id = getItemId(item);
  const uuid = getItemUuid(item);
  return hasFavoriteReference(getObject(actor.system)?.favorites, [id, uuid], ["id", "item", "uuid"]);
}

function isConcentrating(actor: Dnd5eFeaturesActor, item: Dnd5eFeaturesItem): boolean {
  const concentration = getObject(actor.system)?.concentration;
  const itemId = getItemId(item);
  return getString(getObject(concentration)?.itemId) === itemId || getString(getObject(concentration)?.item) === itemId || getString(getObject(concentration)?.uuid) === getItemUuid(item);
}

function buildAdjustment(current: number, max: number, label: string): Dnd5eFeatureAdjustmentViewModel {
  return {
    id: "uses",
    title: "Adjust Uses",
    label,
    value: label,
    current,
    max,
    options: buildSignedAdjustmentOptions(current, max)
  };
}


function hasSetValue(value: unknown, key: string): boolean {
  return typeof (value as { has?: unknown })?.has === "function" && (value as Set<string>).has(key);
}

function isItemLike(value: unknown): value is Dnd5eFeaturesItem {
  const object = getObject(value);
  return Boolean(object && (typeof object.type === "string" || typeof object.name === "string"));
}
