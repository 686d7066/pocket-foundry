import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../../../core/utils.ts";
import { toSearchTerms } from "../view-model-helpers.ts";
import type {
  Dnd5eSpellActivity,
  Dnd5eSpellItem,
  Dnd5eSpellcastingClass,
  Dnd5eSpellcastingConfig,
  Dnd5eSpellcastingCardViewModel,
  Dnd5eSpellSlotTrackViewModel,
  Dnd5eSpellSectionViewModel,
  Dnd5eSpellsConfig,
  Dnd5eSpellsActor,
  Dnd5eSpellRowViewModel,
  Dnd5eSpellActivityViewModel
} from "./types.ts";
import { DEFAULT_SPELLCASTING } from "./types.ts";
import {
  abbreviateActivationLabel,
  buildAdjustment,
  canPrepareSpell,
  formatAttackValue,
  formatModifier,
  formatNumber,
  formatPair,
  getActivityActivationLabel,
  getActivationLabel,
  getClassLevels,
  getComponentsLabel,
  getItemId,
  getItemName,
  getItemUuid,
  getPreparationLabel,
  getRangeLabel,
  getRemainingUses,
  getRollLabel,
  getSaveLabel,
  getSchoolLabel,
  getSpellDescription,
  getSpellSource,
  getUsableActivities,
  getUsesLabel,
  getFallbackSectionLabel,
  hasSetValue,
  isAlwaysPrepared,
  isFavorite,
  isPrepared,
  ordinal,
  uniqueStrings
} from "./format.ts";

export function buildSpellcastingCards(
  actor: Dnd5eSpellsActor,
  config: Dnd5eSpellsConfig,
  canUpdate: boolean
): Dnd5eSpellcastingCardViewModel[] {
  const classes = Object.entries(actor.spellcastingClasses ?? {}).map(([id, item]) => ({ id, item }));
  const abilities = getObject(getObject(actor.system)?.abilities) ?? {};
  const primaryAbility = getString(getObject(getObject(actor.system)?.attributes)?.spellcasting);

  return classes
    .sort((left, right) => getClassLevels(right.item) - getClassLevels(left.item))
    .map(({ id, item }) => {
      const sc = item.spellcasting ?? {};
      const preparation = getSpellcastingPreparation(item);
      const ability = getString(sc.ability);
      const abilityData = getObject(abilities[ability]);
      const abilityConfig = config.abilities?.[ability];
      const labelItem = getString(getObject(item.system)?.spellcasting && getObject(getObject(item.system)?.spellcasting)?.progression) === getString(sc.progression)
        ? item
        : item.subclass ?? item;
      const name = getItemName(labelItem, "Spellcasting");

      return {
        id,
        label: `${name} Spellcasting`,
        ability,
        abilityLabel: abilityConfig?.abbreviation || ability.toUpperCase() || "Spell",
        abilityMod: formatModifier(getNumber(abilityData?.mod) ?? 0),
        attack: formatModifier(getNumber(sc.attack) ?? 0),
        save: formatNumber(getNumber(sc.save) ?? 0),
        prepared: formatPair(preparation.value, preparation.max),
        primary: primaryAbility === ability,
        canSetPrimary: canUpdate && Boolean(ability)
      };
    });
}

function getSpellcastingPreparation(item: Dnd5eSpellcastingClass): { value: number | null; max: number | null } {
  const mergedPreparation = getObject(getObject(item.spellcasting)?.preparation);
  const classPreparation = getObject(getObject(getObject(item.system)?.spellcasting)?.preparation);
  const subclassPreparation = getObject(getObject(getObject(item.subclass)?.system)?.spellcasting);
  const subclassPreparationData = getObject(subclassPreparation?.preparation);

  const value = firstDefinedNumber([
    getNumber(mergedPreparation?.value),
    getNumber(classPreparation?.value),
    getNumber(subclassPreparationData?.value)
  ]);
  const max = maxDefinedNumber([
    getNumber(mergedPreparation?.max),
    getNumber(classPreparation?.max),
    getNumber(subclassPreparationData?.max)
  ]);

  return { value, max };
}

function firstDefinedNumber(values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value === "number") return value;
  }
  return null;
}

function maxDefinedNumber(values: Array<number | null>): number | null {
  let currentMax: number | null = null;
  for (const value of values) {
    if (typeof value !== "number") continue;
    currentMax = currentMax === null ? value : Math.max(currentMax, value);
  }
  return currentMax;
}

export function buildSpellSections(
  actor: Dnd5eSpellsActor,
  spells: Dnd5eSpellItem[],
  config: Dnd5eSpellsConfig,
  canUpdate: boolean
): Dnd5eSpellSectionViewModel[] {
  const sections = new Map<string, Dnd5eSpellSectionViewModel>();
  const spellcasting = config.spellcasting ?? DEFAULT_SPELLCASTING;

  const registerSection = (key: string, level: number | null, methodConfig: Dnd5eSpellcastingConfig | undefined): Dnd5eSpellSectionViewModel => {
    const usesSlots = methodConfig?.slots === true && level !== 0;
    const sectionLevel = methodConfig?.slots ? level : 1;
    const method = methodConfig?.key ?? key;
    const existing = sections.get(key);
    if (existing) return existing;

    const slotTrack = usesSlots ? buildSlotTrack(actor, key, sectionLevel ?? 1, methodConfig, canUpdate) : null;
    const section: Dnd5eSpellSectionViewModel = {
      id: key,
      method,
      level: sectionLevel ?? null,
      label: methodConfig?.getLabel?.({ level: sectionLevel }) ?? getFallbackSectionLabel(key, sectionLevel),
      order: sectionLevel === 0 ? 0 : methodConfig?.order ?? 1000,
      count: 0,
      slotTrack,
      spells: [],
      empty: true,
      filtered: false
    };
    sections.set(key, section);
    return section;
  };

  for (const methodConfig of Object.values(spellcasting)) {
    const levels = methodConfig.getAvailableLevels?.(actor) ?? [];
    if (!levels.length) continue;
    if (methodConfig.cantrips) registerSection("spell0", 0, spellcasting.spell ?? methodConfig);
    for (const level of levels) registerSection(methodConfig.getSpellSlotKey?.(level) ?? `${methodConfig.key}${level}`, level, methodConfig);
  }

  for (const spell of spells) {
    const system = getObject(spell.system) ?? {};
    let method = getString(system.method);
    if (!(method in spellcasting)) method = "innate";
    let methodConfig = spellcasting[method];
    let level: number | null = getNumber(system.level) ?? 0;
    let key = methodConfig?.getSpellSlotKey?.(level) ?? method;

    if (spell.getFlag?.("dnd5e", "cachedFor") || getString(getObject(spell.flags)?.dnd5e && getObject(getObject(spell.flags)?.dnd5e)?.cachedFor)) {
      const linkedActivity = getObject(system.linkedActivity);
      if (linkedActivity && linkedActivity.displayInSpellbook === false) continue;
      key = "item";
      method = "item";
      methodConfig = { key: "item", order: 900, slots: false, getLabel: () => "Item Spells" };
      level = null;
    }

    const section = registerSection(key, level, methodConfig);
    section.spells.push(buildSpellRow(actor, spell, section, config, canUpdate));
    section.count += 1;
    section.empty = false;
  }

  return [...sections.values()]
    .sort((left, right) => left.order - right.order || (left.level ?? 0) - (right.level ?? 0) || left.label.localeCompare(right.label))
    .map(section => ({
      ...section,
      spells: section.spells.sort((left, right) => left.name.localeCompare(right.name))
    }));
}

export function filterSpellSections(sections: Dnd5eSpellSectionViewModel[], query: string): Dnd5eSpellSectionViewModel[] {
  if (!query) return sections;
  const terms = toSearchTerms(query);
  return sections
    .map(section => {
      const spells = section.spells.filter(spell => matchesSpellSearch(spell, terms));
      return {
        ...section,
        spells,
        count: spells.length,
        empty: spells.length === 0,
        filtered: true
      };
    })
    .filter(section => !section.empty);
}

function matchesSpellSearch(spell: Dnd5eSpellRowViewModel, terms: string[]): boolean {
  const haystack = spell.name.toLocaleLowerCase();
  return terms.every(term => haystack.includes(term));
}

function buildSlotTrack(
  actor: Dnd5eSpellsActor,
  slotId: string,
  level: number,
  methodConfig: Dnd5eSpellcastingConfig | undefined,
  canUpdate: boolean
): Dnd5eSpellSlotTrackViewModel {
  const slot = getObject(getObject(getObject(actor.system)?.spells)?.[slotId]) ?? {};
  const value = getNumber(slot.value) ?? 0;
  const max = getNumber(slot.override) ?? getNumber(slot.max) ?? 0;
  const displayMax = Math.max(max, value);
  const label = methodConfig?.key === "pact" ? "Pact" : methodConfig?.getLabel?.({ level }) ?? getFallbackSectionLabel(slotId, level);

  return {
    id: slotId,
    label,
    levelLabel: level > 0 ? `${ordinal(level)} level` : "Cantrip",
    value,
    max,
    displayMax,
    prop: `system.spells.${slotId}.value`,
    canUpdate,
    favorite: isSlotFavorite(actor, slotId),
    canToggleFavorite: canUpdate && (typeof getObject(actor.system)?.addFavorite === "function" || typeof getObject(actor.system)?.removeFavorite === "function"),
    pips: Array.from({ length: displayMax }, (_unused, index) => {
      const n = index + 1;
      const temporary = n > max;
      const filled = value >= n;
      return {
        n,
        temporary,
        filled,
        label: temporary ? "Temporary spell slot" : filled ? `${ordinal(n)} spell slot available` : "Expended spell slot"
      };
    })
  };
}

function isSlotFavorite(actor: Dnd5eSpellsActor, slotId: string): boolean {
  const favorites = getCollectionContents(getObject(actor.system)?.favorites);
  return favorites.some(favorite => {
    if (typeof favorite === "string") return favorite === slotId;
    const object = getObject(favorite);
    return getString(object?.type) === "slots" && getString(object?.id) === slotId;
  });
}

function buildSpellRow(
  actor: Dnd5eSpellsActor,
  item: Dnd5eSpellItem,
  section: Dnd5eSpellSectionViewModel,
  config: Dnd5eSpellsConfig,
  canUpdate: boolean
): Dnd5eSpellRowViewModel {
  const system = getObject(item.system) ?? {};
  const labels = getObject(item.labels) ?? {};
  const uses = getObject(system.uses);
  const maxUses = getNumber(uses?.max);
  const currentUses = maxUses === null ? null : getNumber(uses?.value) ?? getRemainingUses(uses) ?? maxUses;
  const usesLabel = formatPair(currentUses, maxUses);
  const prepared = isPrepared(item);
  const alwaysPrepared = isAlwaysPrepared(item, config);
  const preparationLabel = getPreparationLabel(item, config);
  const activities = getUsableActivities(item).map(activity => buildActivityViewModel(activity));
  const activation = abbreviateActivationLabel(getString(labels.activation)) || getActivationLabel(system);
  const range = getString(labels.range) || getRangeLabel(system);
  const target = getString(labels.target) || "-";
  const roll = getRollLabel(item);
  const source = getSpellSource(actor, item);
  const components = getComponentsLabel(item);
  const school = getSchoolLabel(item, config);
  const concentration = hasSetValue(system.properties, "concentration") || Boolean(system.concentration) || /concentration/i.test(components);
  const ritual = hasSetValue(system.properties, "ritual") || system.ritual === true;
  const adjustment = canUpdate && maxUses !== null && currentUses !== null ? buildAdjustment(currentUses, maxUses, usesLabel) : null;

  return {
    id: getItemId(item),
    uuid: getItemUuid(item),
    name: getItemName(item, "Spell"),
    icon: item.img || null,
    iconText: getInitials(item.name ?? "Spell", "S"),
    subtitle: uniqueStrings([source, components]).join(" - "),
    source,
    components,
    school,
    activation: activation || "-",
    range,
    target,
    roll,
    usesLabel,
    preparedLabel: preparationLabel,
    prepared,
    alwaysPrepared,
    concentration,
    ritual,
    description: getSpellDescription(item),
    chips: uniqueStrings([
      section.label || "",
      source || "",
      school || "",
      concentration ? "Concentration" : "",
      ritual ? "Ritual" : "",
      alwaysPrepared ? "Always Prepared" : prepared ? "Prepared" : ""
    ]),
    facts: [
      { label: "Time", value: getSpellTimeChipLabel(getString(labels.activation), activation) || "-" },
      { label: "Range", value: range || "-" },
      { label: "Target", value: target || "-" },
      { label: "Roll", value: roll || "-" },
      { label: "Prep", value: preparationLabel || "-" },
      { label: "Uses", value: usesLabel || "-" }
    ],
    activities,
    adjustments: adjustment ? [adjustment] : [],
    actions: {
      canUpdate,
      canUse: canUpdate && typeof item.use === "function" && activities.length <= 1,
      canPrepare: canPrepareSpell(item, config, canUpdate),
      canRecharge: canUpdate && item.hasRecharge === true && typeof uses?.rollRecharge === "function",
      canAdjustUses: adjustment !== null,
      canToggleFavorite: canUpdate && (typeof getObject(actor.system)?.addFavorite === "function" || typeof getObject(actor.system)?.removeFavorite === "function")
    },
    favorite: isFavorite(actor, item)
  };
}

function buildActivityViewModel(activity: Dnd5eSpellActivity): Dnd5eSpellActivityViewModel {
  const prepared = typeof activity.prepareSheetContext === "function" ? activity.prepareSheetContext() : {};
  const labels = getObject(prepared.labels) ?? getObject(activity.labels) ?? {};
  const activation =
    abbreviateActivationLabel(getString(labels.activation)) ||
    getActivityActivationLabel(getObject(prepared.activation) ?? getObject(activity.activation));
  const save = getObject(prepared.save) ?? getObject(activity.save);
  const range = getObject(prepared.range) ?? getObject(activity.range);
  const uses = getObject(prepared.uses) ?? getObject(activity.uses);
  const saveLabel = getString(labels.save) || getSaveLabel(save);
  const toHit = formatAttackValue(getString(labels.modifier));

  return {
    id: getString(prepared._id) || getString(prepared.id) || activity._id || activity.id || "",
    name: getString(prepared.name) || activity.name || "Activity",
    icon: getString(prepared.img) || activity.img || null,
    iconText: getInitials(getString(prepared.name) || activity.name || "Activity", "A"),
    activation: activation || "-",
    range: getString(labels.range) || getString(range?.label) || "-",
    target: getString(labels.target) || "-",
    save: saveLabel,
    toHit,
    roll: toHit !== "-" ? toHit : saveLabel,
    usesLabel: getUsesLabel(uses),
    canUse: activity.canUse !== false && typeof activity.use === "function"
  };
}

function getSpellTimeChipLabel(rawActivation: string, activation: string): string {
  const normalizedRaw = rawActivation.trim();
  if (normalizedRaw) return normalizedRaw;
  return expandActivationAbbreviation(activation);
}

function expandActivationAbbreviation(value: string): string {
  const normalized = value.trim();
  if (!normalized) return normalized;
  if (normalized === "A") return "Action";
  if (normalized === "BA") return "Bonus Action";
  if (normalized === "R") return "Reaction";

  const actionMatch = normalized.match(/^(\d+(?:\.\d+)?)(A|BA|R)$/);
  if (actionMatch) {
    const amount = actionMatch[1] ?? "";
    const kind = actionMatch[2] ?? "";
    if (kind === "A") return `${amount} Action${amount === "1" ? "" : "s"}`;
    if (kind === "BA") return `${amount} Bonus Action${amount === "1" ? "" : "s"}`;
    if (kind === "R") return `${amount} Reaction${amount === "1" ? "" : "s"}`;
  }

  const durationMatch = normalized.match(/^(\d+(?:\.\d+)?)(m|h|d|r)$/i);
  if (durationMatch) {
    const amount = durationMatch[1] ?? "";
    const unit = (durationMatch[2] ?? "").toLowerCase();
    if (unit === "m") return `${amount} minute${amount === "1" ? "" : "s"}`;
    if (unit === "h") return `${amount} hour${amount === "1" ? "" : "s"}`;
    if (unit === "d") return `${amount} day${amount === "1" ? "" : "s"}`;
    if (unit === "r") return `${amount} round${amount === "1" ? "" : "s"}`;
  }

  return normalized;
}

