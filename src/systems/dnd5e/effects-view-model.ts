import { getCollectionContents, getInitials, getObject, getString } from "../../core/utils.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";
import { enrichHtml } from "../../services/rich-text-enrichment.ts";
import {
  canUpdateOwnedDocument,
  canViewOwnedDocument,
  hasFavoriteReference,
  isExpandableDetailEntityLinkPillLinkable,
  isGmUser,
  mapLabeledValueList,
  normalizeSearchQuery,
  toSearchTerms,
  titleCase,
  toTitleCaseWords,
  uniqueStrings
} from "./view-model-helpers.ts";

export type Dnd5eEffectsActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  type?: string;
  name?: string;
  system?: Record<string, unknown>;
  effects?: unknown;
  statuses?: Set<string>;
  allApplicableEffects?: () => Iterable<Dnd5eActiveEffect>;
  endConcentration?: (effect: Dnd5eActiveEffect) => Promise<unknown>;
};

export type Dnd5eActiveEffect = PermissionCheckedDocument & {
  id?: string;
  _id?: string;
  uuid?: string;
  name?: string;
  img?: string | null;
  type?: string;
  parent?: PermissionCheckedDocument & { id?: string; uuid?: string; name?: string; system?: Record<string, unknown> };
  target?: PermissionCheckedDocument & { id?: string; uuid?: string; name?: string };
  disabled?: boolean;
  duration?: { remaining?: number | null; label?: string };
  changes?: Array<{ key?: string; mode?: unknown; value?: unknown }>;
  description?: string;
  statuses?: Set<string>;
  isTemporary?: boolean;
  isSuppressed?: boolean;
  isAppliedEnchantment?: boolean;
  dependentOrigin?: { active?: boolean };
  isOwner?: boolean;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  delete?: () => Promise<unknown>;
  updateDuration?: () => void;
  getSource?: () => Promise<unknown>;
  getRelativeUUID?: (document: Dnd5eEffectsActor) => string;
  getFlag?: (scope: string, key: string) => unknown;
};

export type Dnd5eConditionConfig = Record<string, {
  name?: string;
  label?: string;
  img?: string;
  icon?: string;
  reference?: string;
  pseudo?: boolean;
}>;

type Dnd5eLabelDictionary = Record<string, string | { label?: string; name?: string; id?: string; uuid?: string }>;

export type Dnd5eEffectsConfig = {
  damageTypes?: Dnd5eLabelDictionary;
  conditionTypes?: Dnd5eConditionConfig;
  specialStatusEffects?: { CONCENTRATING?: string };
};

export type Dnd5eEffectStatusCardViewModel = {
  id: string;
  value: string;
  label: string;
  tone: "normal" | "active" | "warning";
};

export type Dnd5eEffectSectionViewModel = {
  id: string;
  label: string;
  category: string;
  count: number;
  empty: boolean;
  disabled: boolean;
  info: string;
  effects: Dnd5eEffectRowViewModel[];
};

export type Dnd5eEffectRowViewModel = {
  id: string;
  uuid: string;
  parentId: string;
  name: string;
  icon: string | null;
  iconText: string;
  category: string;
  categoryLabel: string;
  sourceName: string;
  sourceUuid: string;
  sourceLinkable: boolean;
  favoriteId: string;
  durationLabel: string;
  durationParts: string[];
  disabled: boolean;
  active: boolean;
  toggleable: boolean;
  concentrating: boolean;
  favorite: boolean;
  description: string;
  changes: Array<{ label: string; value: string }>;
  chips: string[];
  facts: Array<{ label: string; value: string }>;
  actions: {
    canToggle: boolean;
    canToggleFavorite: boolean;
    canEndConcentration: boolean;
    canDelete: boolean;
  };
};

export type Dnd5eConditionViewModel = {
  id: string;
  effectId: string;
  name: string;
  icon: string | null;
  iconText: string;
  reference: string;
  active: boolean;
  exists: boolean;
  disabled: boolean;
  showAdd: boolean;
  canToggle: boolean;
};

export type Dnd5eEffectsViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  searchQuery: string;
  canClearSearch: boolean;
  status: Dnd5eEffectStatusCardViewModel[];
  sections: Dnd5eEffectSectionViewModel[];
  conditions: Dnd5eConditionViewModel[];
  hasConditions: boolean;
  showConditions: boolean;
};

export type UnavailableDnd5eEffectsViewModel = {
  unavailable: true;
  title: "Effects Unavailable";
  body: "These effects are not available to the current user.";
};

export type Dnd5eEffectsModel = Dnd5eEffectsViewModel | UnavailableDnd5eEffectsViewModel;

export type Dnd5eEffectsControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden" | "unsupported";
};

type EffectCategory = {
  id: string;
  label: string;
  hidden?: boolean;
  disabled?: boolean;
  info?: string;
  effects: Dnd5eActiveEffect[];
};

const CATEGORY_ORDER = ["temporary", "passive", "inactive", "suppressed", "enchantment", "enchantmentActive", "enchantmentInactive"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  temporary: "Active Effects",
  passive: "Passive Effects",
  inactive: "Inactive Effects",
  suppressed: "Unavailable",
  enchantment: "Enchantments",
  enchantmentActive: "Active Enchantments",
  enchantmentInactive: "Inactive Enchantments"
};

export async function buildDnd5eEffectsViewModel(options: {
  actor: Dnd5eEffectsActor | null | undefined;
  user: FoundryUserLike;
  config?: Dnd5eEffectsConfig;
  searchQuery?: string;
}): Promise<Dnd5eEffectsModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Effects Unavailable",
      body: "These effects are not available to the current user."
    };
  }

  const config = normalizeConfig(options.config);
  const canUpdate = canUpdateDocument(actor, options.user);
  const searchQuery = normalizeSearchQuery(options.searchQuery);
  const concentrationEffects = getConcentrationEffects(actor, config);
  const categories = prepareEffectCategories(actor, getApplicableEffects(actor), options.user);
  const sections = filterEffectSections(await buildEffectSections(actor, categories, concentrationEffects, canUpdate, config, options.user), searchQuery);
  const conditions = filterConditions(buildConditionViewModels(actor, config, canUpdate), searchQuery);

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate,
    searchQuery,
    canClearSearch: searchQuery.length > 0,
    status: buildStatusCards(sections, conditions, concentrationEffects),
    sections,
    conditions,
    hasConditions: conditions.length > 0,
    showConditions: searchQuery.length === 0 || conditions.length > 0
  };
}

export async function toggleEffectDisabled(
  actor: Dnd5eEffectsActor | null | undefined,
  user: FoundryUserLike,
  effectId: string
): Promise<Dnd5eEffectsControlResult> {
  const effect = findEffect(actor, effectId);
  if (!actor || !effect) return { ok: false, reason: "unavailable" };
  if (!canUpdateEffect(actor, effect, user)) return { ok: false, reason: "forbidden" };
  if (!isEffectToggleable(actor, effect, normalizeConfig())) return { ok: false, reason: "unsupported" };
  if (typeof effect.update !== "function") return { ok: false, reason: "unsupported" };

  await effect.update({ disabled: !effect.disabled });
  return { ok: true };
}

export async function toggleCondition(
  actor: Dnd5eEffectsActor | null | undefined,
  user: FoundryUserLike,
  conditionId: string,
  activeEffectImplementation = getActiveEffectImplementation()
): Promise<Dnd5eEffectsControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (!conditionId) return { ok: false, reason: "unavailable" };

  const existing = findConditionEffect(actor, conditionId);
  if (existing) return { ok: false, reason: "unsupported" };

  if (!activeEffectImplementation?.fromStatusEffect || !activeEffectImplementation.create) return { ok: false, reason: "unsupported" };
  const effectData = await activeEffectImplementation.fromStatusEffect(conditionId);
  await activeEffectImplementation.create(effectData, { parent: actor, keepId: true });
  return { ok: true };
}

export async function deleteTemporaryEffect(
  actor: Dnd5eEffectsActor | null | undefined,
  user: FoundryUserLike,
  effectId: string
): Promise<Dnd5eEffectsControlResult> {
  const effect = findEffect(actor, effectId);
  if (!actor || !effect) return { ok: false, reason: "unavailable" };
  if (!canUpdateEffect(actor, effect, user)) return { ok: false, reason: "forbidden" };
  if (effect.isTemporary !== true) return { ok: false, reason: "unsupported" };
  if (typeof effect.delete !== "function") return { ok: false, reason: "unsupported" };

  await effect.delete();
  return { ok: true };
}

export async function setEffectFavorite(
  actor: Dnd5eEffectsActor | null | undefined,
  user: FoundryUserLike,
  effectId: string,
  favorite: boolean
): Promise<Dnd5eEffectsControlResult> {
  const effect = findEffect(actor, effectId);
  if (!actor || !effect) return { ok: false, reason: "unavailable" };
  if (!canUpdateEffect(actor, effect, user)) return { ok: false, reason: "forbidden" };

  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return { ok: false, reason: "unsupported" };

  const favoriteId = getEffectFavoriteId(actor, effect);
  await (action as (target: unknown) => Promise<unknown>).call(system, favorite ? { type: "effect", id: favoriteId } : favoriteId);
  return { ok: true };
}

export async function endEffectConcentration(
  actor: Dnd5eEffectsActor | null | undefined,
  user: FoundryUserLike,
  effectId: string
): Promise<Dnd5eEffectsControlResult> {
  const effect = findEffect(actor, effectId);
  if (!actor || !effect) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (!isConcentrationEffect(actor, effect, normalizeConfig())) return { ok: false, reason: "unsupported" };
  if (typeof actor.endConcentration !== "function") return { ok: false, reason: "unsupported" };

  await actor.endConcentration(effect);
  return { ok: true };
}

async function buildEffectSections(
  actor: Dnd5eEffectsActor,
  categories: EffectCategory[],
  concentrationEffects: Set<Dnd5eActiveEffect>,
  canUpdate: boolean,
  config: Dnd5eEffectsConfig,
  user: FoundryUserLike
): Promise<Dnd5eEffectSectionViewModel[]> {
  const sections: Dnd5eEffectSectionViewModel[] = [];
  for (const category of categories) {
    if (category.hidden) continue;
    const effects = (await Promise.all(category.effects.map(effect => buildEffectRow(actor, effect, category, concentrationEffects, canUpdate, config, user))))
      .filter((row): row is Dnd5eEffectRowViewModel => row !== null);

    if (!effects.length) continue;
    sections.push({
      id: category.id,
      label: category.label,
      category: category.id,
      count: effects.length,
      empty: effects.length === 0,
      disabled: category.disabled === true,
      info: category.info ?? "",
      effects: effects.sort((left, right) => left.name.localeCompare(right.name))
    });
  }
  return sections;
}

function filterEffectSections(sections: Dnd5eEffectSectionViewModel[], query: string): Dnd5eEffectSectionViewModel[] {
  if (!query) return sections;
  const terms = toSearchTerms(query);
  return sections
    .map(section => {
      const effects = section.effects.filter(effect => matchesEffectSearch(effect, terms));
      return { ...section, effects, count: effects.length, empty: effects.length === 0 };
    })
    .filter(section => section.effects.length > 0);
}

function matchesEffectSearch(effect: Dnd5eEffectRowViewModel, terms: string[]): boolean {
  const haystack = effect.name.toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

function filterConditions(conditions: Dnd5eConditionViewModel[], query: string): Dnd5eConditionViewModel[] {
  if (!query) return conditions;
  const terms = toSearchTerms(query);
  return conditions.filter(condition => matchesConditionSearch(condition, terms));
}

function matchesConditionSearch(condition: Dnd5eConditionViewModel, terms: string[]): boolean {
  const haystack = condition.name.toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

async function buildEffectRow(
  actor: Dnd5eEffectsActor,
  effect: Dnd5eActiveEffect,
  category: EffectCategory,
  concentrationEffects: Set<Dnd5eActiveEffect>,
  canUpdateActor: boolean,
  config: Dnd5eEffectsConfig,
  user: FoundryUserLike
): Promise<Dnd5eEffectRowViewModel | null> {
  effect.updateDuration?.();
  const source = await resolveEffectSource(effect);
  const id = getEffectId(effect);
  const durationLabel = getDurationLabel(effect);
  const sourceName = getString(getObject(source)?.name);
  const sourceUuid = getString(getObject(source)?.uuid);
  const concentrating = concentrationEffects.has(effect);
  const toggleable = !concentrating;
  const canUpdate = canUpdateActor && canUpdateEffect(actor, effect, user);
  const changes = getEffectChanges(effect, config);
  const disabled = effect.disabled === true;
  const description = await enrichEffectDescription(effect, user);

  if (!id) return null;

  return {
    id,
    uuid: effect.uuid ?? (actor.uuid ? `${actor.uuid}.ActiveEffect.${id}` : id),
    parentId: effect.target === effect.parent ? "" : getString(effect.parent?.id),
    name: effect.name?.trim() || "Effect",
    icon: effect.img || null,
    iconText: getInitials(effect.name ?? "Effect", "E"),
    category: category.id,
    categoryLabel: category.label,
    sourceName,
    sourceUuid,
    sourceLinkable: isExpandableDetailEntityLinkPillLinkable(effect, source),
    durationLabel,
    durationParts: durationLabel === "None" ? [] : durationLabel.split(", ").filter(Boolean),
    disabled,
    active: !disabled,
    toggleable,
    concentrating,
    favorite: isFavorite(actor, effect),
    favoriteId: getEffectFavoriteId(actor, effect),
    description,
    changes,
    chips: uniqueStrings([category.label, sourceName, durationLabel, disabled ? "Disabled" : "Enabled", concentrating ? "Concentration" : ""]),
    facts: [
      { label: "System Category", value: category.label },
      { label: "Duration", value: durationLabel },
      { label: "State", value: disabled ? "Disabled" : "Enabled" }
    ],
    actions: {
      canToggle: canUpdate && toggleable && typeof effect.update === "function",
      canToggleFavorite: canUpdate && (typeof getObject(actor.system)?.addFavorite === "function" || typeof getObject(actor.system)?.removeFavorite === "function"),
      canEndConcentration: canUpdateActor && concentrating && typeof actor.endConcentration === "function",
      canDelete: canUpdate && effect.isTemporary === true && typeof effect.delete === "function"
    }
  };
}

async function enrichEffectDescription(effect: Dnd5eActiveEffect, user: FoundryUserLike): Promise<string> {
  const rawDescription = getString(effect.description) || getString(effect.getFlag?.("dnd5e", "description"));
  if (!rawDescription) return "";

  const textEditor = (globalThis as {
    TextEditor?: {
      enrichHTML?: (content: string, options?: Record<string, unknown>) => Promise<string> | string;
    };
  }).TextEditor;
  if (typeof textEditor?.enrichHTML !== "function") return rawDescription;

  return enrichHtml(rawDescription, {
    enrichHtml: textEditor.enrichHTML.bind(textEditor),
    relativeTo: effect.parent ?? effect.target ?? effect,
    secrets: isGmUser(user)
  });
}

function buildConditionViewModels(actor: Dnd5eEffectsActor, config: Dnd5eEffectsConfig, canUpdate: boolean): Dnd5eConditionViewModel[] {
  return Object.entries(config.conditionTypes ?? {})
    .filter(([_key, condition]) => condition.pseudo !== true)
    .map(([key, condition]) => {
      const effectId = getConditionEffectId(key);
      const existing = findConditionEffect(actor, key);
      const active = Boolean(existing && existing.disabled !== true);
      const name = getString(condition.name) || getString(condition.label) || titleCase(key);
      const icon = getString(existing?.img) || getString(condition.img) || getString(condition.icon) || null;
      const exists = Boolean(existing);
      const canToggle = canUpdate && !exists;
      return {
        id: key,
        effectId,
        name,
        icon,
        iconText: getInitials(name, "C"),
        reference: getString(condition.reference),
        active,
        exists,
        disabled: !active,
        showAdd: canToggle,
        canToggle
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildStatusCards(
  sections: Dnd5eEffectSectionViewModel[],
  conditions: Dnd5eConditionViewModel[],
  concentrationEffects: Set<Dnd5eActiveEffect>
): Dnd5eEffectStatusCardViewModel[] {
  const count = (id: string) => sections.find(section => section.id === id)?.count ?? 0;
  const activeConditions = conditions.filter(condition => condition.active);
  const concentration = [...concentrationEffects][0];
  return [
    { id: "temporary", value: String(count("temporary")), label: "Temporary Effects", tone: count("temporary") ? "active" : "normal" },
    { id: "passive", value: String(count("passive")), label: "Passive Effects", tone: count("passive") ? "active" : "normal" },
    { id: "inactive", value: String(count("inactive")), label: "Inactive Effects", tone: count("inactive") ? "warning" : "normal" },
    {
      id: "conditions",
      value: activeConditions.length ? String(activeConditions.length) : "Clear",
      label: "Conditions",
      tone: activeConditions.length ? "warning" : "normal"
    },
    {
      id: "concentration",
      value: concentration ? "Active" : "Clear",
      label: concentration?.name ?? "Concentration",
      tone: concentration ? "warning" : "normal"
    }
  ];
}

function prepareEffectCategories(actor: Dnd5eEffectsActor, effects: Dnd5eActiveEffect[], user: FoundryUserLike): EffectCategory[] {
  const categories = new Map<string, EffectCategory>();
  for (const id of CATEGORY_ORDER) {
    categories.set(id, {
      id,
      label: CATEGORY_LABELS[id] ?? titleCase(id),
      hidden: id === "enchantment" && !getObject(actor.system)?.isEnchantment,
      disabled: id === "suppressed",
      info: id === "suppressed" ? "These effects are currently unavailable." : "",
      effects: []
    });
  }

  for (const effect of effects) {
    if (!canViewEffect(actor, effect, user)) continue;
    if (effect.dependentOrigin?.active === false || (getObject(effect.parent?.system)?.identified === false && !isGmUser(user))) continue;

    const category = getEffectCategory(effect);
    categories.get(category)?.effects.push(effect);
  }

  for (const id of ["enchantmentActive", "enchantmentInactive", "suppressed"] as const) {
    const category = categories.get(id);
    if (category) category.hidden = category.effects.length === 0;
  }

  return CATEGORY_ORDER.map(id => categories.get(id)).filter((category): category is EffectCategory => Boolean(category));
}

function getEffectCategory(effect: Dnd5eActiveEffect): string {
  if (effect.isAppliedEnchantment) return effect.disabled ? "enchantmentInactive" : "enchantmentActive";
  if (effect.type === "enchantment") return "enchantment";
  if (effect.isSuppressed) return "suppressed";
  if (effect.disabled) return "inactive";
  if (effect.isTemporary) return "temporary";
  return "passive";
}

function getApplicableEffects(actor: Dnd5eEffectsActor): Dnd5eActiveEffect[] {
  if (typeof actor.allApplicableEffects === "function") return [...actor.allApplicableEffects()];
  return getCollectionContents(actor.effects) as Dnd5eActiveEffect[];
}

function findEffect(actor: Dnd5eEffectsActor | null | undefined, effectId: string): Dnd5eActiveEffect | null {
  if (!actor) return null;
  return getApplicableEffects(actor).find(effect => getEffectId(effect) === effectId || effect.uuid === effectId) ?? null;
}

function findConditionEffect(actor: Dnd5eEffectsActor, conditionId: string): Dnd5eActiveEffect | undefined {
  const expectedId = getConditionEffectId(conditionId);
  return getApplicableEffects(actor).find(effect => {
    const id = getEffectId(effect);
    return id === expectedId || id.startsWith(expectedId) || effect.statuses?.has(conditionId) || effect.statuses?.has(expectedId);
  });
}

function canViewEffect(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect, user: FoundryUserLike): boolean {
  return canViewOwnedDocument(actor, effect, user);
}

function canUpdateEffect(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect, user: FoundryUserLike): boolean {
  return canUpdateOwnedDocument(actor, effect, user, { parentFallback: true, ownerFallback: true });
}

function isEffectToggleable(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect, config: Dnd5eEffectsConfig): boolean {
  return !isConcentrationEffect(actor, effect, config);
}

function getConcentrationEffects(actor: Dnd5eEffectsActor, config: Dnd5eEffectsConfig): Set<Dnd5eActiveEffect> {
  return new Set(getApplicableEffects(actor).filter(effect => isConcentrationEffect(actor, effect, config)));
}

function isConcentrationEffect(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect, config: Dnd5eEffectsConfig): boolean {
  const concentrationStatus = config.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  if (effect.statuses?.has(concentrationStatus) || effect.statuses?.has("concentrating")) return true;
  const concentration = getObject(actor.system)?.concentration;
  const id = getEffectId(effect);
  return getString(getObject(concentration)?.effectId) === id || getString(getObject(concentration)?.effect) === id || getString(getObject(concentration)?.uuid) === effect.uuid;
}

async function resolveEffectSource(effect: Dnd5eActiveEffect): Promise<unknown> {
  let source = typeof effect.getSource === "function" ? await effect.getSource() : null;
  const sourceObject = getObject(source);
  if (sourceObject?.target) source = sourceObject.target;
  const sourceParent = getObject(getObject(source)?.parent);
  if (sourceParent?.uuid && getObject(source)?.parent !== effect.target) source = sourceParent;
  return source;
}

function getEffectChanges(effect: Dnd5eActiveEffect, config: Dnd5eEffectsConfig): Array<{ label: string; value: string }> {
  return (effect.changes ?? [])
    .map(change => {
      const key = getString(change.key);
      const value = formatEffectChangeValue(key, change.value, config);
      const label = formatEffectChangeLabel(key);
      if (!label && !value) return null;
      return { label: label || "Change", value };
    })
    .filter((change): change is { label: string; value: string } => Boolean(change));
}

function formatEffectChangeValue(key: string, rawValue: unknown, config: Dnd5eEffectsConfig): string {
  if (rawValue === undefined || rawValue === null) return "";
  const value = String(rawValue).trim();
  if (!value) return "";

  if (key.startsWith("system.traits.di.value") || key.startsWith("system.traits.dr.value") || key.startsWith("system.traits.dv.value")) {
    return mapLabeledValueList(value, config.damageTypes);
  }
  if (key.startsWith("system.traits.ci.value")) {
    return mapLabeledValueList(value, config.conditionTypes);
  }

  return value;
}

function formatEffectChangeLabel(key: string): string {
  if (!key) return "";
  if (key.startsWith("system.traits.di.value")) return "Damage Immunity";
  if (key.startsWith("system.traits.dr.value")) return "Damage Resistance";
  if (key.startsWith("system.traits.dv.value")) return "Damage Vulnerability";
  if (key.startsWith("system.traits.ci.value")) return "Condition Immunity";
  if (key.startsWith("system.attributes.senses.")) return `Senses: ${toTitleCaseWords(key.replace("system.attributes.senses.", ""))}`;
  if (key.startsWith("system.bonuses.")) return `Bonus: ${toTitleCaseWords(key.replace("system.bonuses.", ""))}`;
  return toTitleCaseWords(key.replace(/^system\./, "").replace(/\.value$/, ""));
}

function getDurationLabel(effect: Dnd5eActiveEffect): string {
  const duration = getObject(effect.duration);
  const remaining = typeof duration?.remaining === "number" ? duration.remaining : null;
  const label = getString(duration?.label);
  if (remaining && label) return label;
  if (label && label !== "None") return label;
  return "None";
}

function isFavorite(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect): boolean {
  const favoriteId = getEffectFavoriteId(actor, effect);
  return hasFavoriteReference(getObject(actor.system)?.favorites, [favoriteId, effect.uuid], ["id", "uuid"]);
}

function getEffectFavoriteId(actor: Dnd5eEffectsActor, effect: Dnd5eActiveEffect): string {
  return effect.getRelativeUUID?.(actor) ?? effect.uuid ?? getEffectId(effect);
}

function getEffectId(effect: Dnd5eActiveEffect): string {
  return effect.id ?? effect._id ?? "";
}

function getConditionEffectId(conditionId: string): string {
  return `dnd5e${conditionId}`;
}

function normalizeConfig(config?: Dnd5eEffectsConfig): Dnd5eEffectsConfig {
  const globalConfig = getObject((globalThis as { CONFIG?: { DND5E?: Dnd5eEffectsConfig; specialStatusEffects?: Dnd5eEffectsConfig["specialStatusEffects"] } }).CONFIG?.DND5E);
  const specialStatusEffects = (globalThis as { CONFIG?: { specialStatusEffects?: Dnd5eEffectsConfig["specialStatusEffects"] } }).CONFIG?.specialStatusEffects;
  return {
    ...(globalConfig as Dnd5eEffectsConfig | undefined),
    specialStatusEffects,
    ...config
  };
}

function getActiveEffectImplementation(): {
  fromStatusEffect?: (id: string) => Promise<unknown>;
  create?: (data: unknown, options: { parent: Dnd5eEffectsActor; keepId: boolean }) => Promise<unknown>;
} | null {
  return (globalThis as { ActiveEffect?: { implementation?: { fromStatusEffect?: (id: string) => Promise<unknown>; create?: (data: unknown, options: { parent: Dnd5eEffectsActor; keepId: boolean }) => Promise<unknown> } } }).ActiveEffect?.implementation ?? null;
}
