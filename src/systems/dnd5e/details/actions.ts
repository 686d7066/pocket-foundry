import { getFoundryRuntime } from "../../../core/foundry-globals.ts";
import { getCollectionContents, getNumber, getObject, getString } from "../../../core/utils.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike } from "../../../services/permissions.ts";
import { summarizeRichTextWithReferences, type RichTextReference } from "../../../services/rich-text-links.ts";
import { clampNumber, formatPair, getConfigLabel, uniqueStrings } from "../view-model-helpers.ts";
import { Dnd5eProficiencyIndicator } from "./types.ts";
import type {
  Dnd5eDetailsActor,
  Dnd5eDetailsClassLike,
  Dnd5eDetailsConfig,
  Dnd5eDetailsControlResult,
  Dnd5eDetailsModel,
  Dnd5eLabelDictionary,
  Dnd5eDetailsDashboardStat,
  Dnd5eDetailsDashboardSummary,
  Dnd5eDetailsDeltaOption,
  Dnd5eDetailsHpViewModel,
  Dnd5eDetailsXpViewModel,
  Dnd5eDetailsAbilityViewModel,
  Dnd5eDetailsSaveViewModel,
  Dnd5eDetailsSkillViewModel,
  Dnd5eDetailsSkillGroupViewModel,
  Dnd5eDetailsToolViewModel,
  Dnd5eDetailsTraitPillViewModel,
  Dnd5eDetailsTraitGroupViewModel,
  Dnd5eDetailsDeathSavesViewModel,
  Dnd5eDetailsExhaustionViewModel,
  Dnd5eDetailsRestType,
  Dnd5eDetailsRestConfig,
  Dnd5eDetailsRestActionViewModel,
  Dnd5eDetailsHitDieOptionViewModel,
  Dnd5eDetailsShortRestViewModel,
  Dnd5eDetailsHitDieRollViewModel,
  Dnd5eDetailsPipViewModel
} from "./types.ts";

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

export async function buildDnd5eDetailsViewModel(options: {
  actor: Dnd5eDetailsActor | null | undefined;
  user: FoundryUserLike;
  config?: Dnd5eDetailsConfig;
  hideXp?: boolean;
}): Promise<Dnd5eDetailsModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Character Unavailable",
      body: "This character is not available to the current user."
    };
  }

  const config = options.config ?? getRuntimeDnd5eConfig();
  const canUpdate = canUpdateDocument(actor, options.user);
  const system = getObject(actor.system) ?? {};
  const attributes = getObject(system.attributes) ?? {};
  const details = getObject(system.details) ?? {};
  const hp = getObject(attributes.hp) ?? {};
  const death = getObject(attributes.death) ?? {};
  const xp = getObject(details.xp) ?? {};

  const hpModel = buildHpModel(hp, canUpdate);
  const abilities = buildAbilities(system, config);
  const saves = buildSaves(abilities, attributes);
  const skills = await buildSkills(system, config, canUpdate);
  const skillGroups = buildSkillGroups(skills);
  const tools = await buildTools(system, config, canUpdate);
  const traitGroups = await buildTraitGroups(actor, system, config);
  const level = getNumber(details.level);
  const epicBoons = getNumber(xp.boonsEarned);

  return {
    unavailable: false,
    canUpdate,
    header: {
      actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
      characterLabel: "Character",
      name: actor.name?.trim() || "Unnamed Character",
      portraitImage: actor.img || null,
      classSummary: getClassSummary(actor) || (level === null ? "Character" : `Level ${level}`),
      level,
      ac: getNumber(getObject(attributes.ac)?.value),
      hp: hpModel,
      inspiration: {
        active: Boolean(attributes.inspiration),
        canToggle: canUpdate
      },
      epicBoons: epicBoons && epicBoons > 0 ? epicBoons : null,
      xp: options.hideXp ? null : buildXpModel(xp)
    },
    dashboard: buildDashboard(attributes, hpModel, canUpdate),
    dashboardSummary: buildDashboardSummary(attributes, hpModel),
    abilities,
    saves,
    skills,
    skillGroups,
    tools,
    traitGroups,
    deltaOptions: buildDeltaOptions(),
    deathSaves: buildDeathSaves(death, canUpdate),
    exhaustion: buildExhaustion(attributes, canUpdate),
    restActions: buildRestActions(actor, options.user),
    shortRest: buildShortRest(actor, attributes)
  };
}

function buildDashboardSummary(attributes: Record<string, unknown>, hp: Dnd5eDetailsHpViewModel): Dnd5eDetailsDashboardSummary {
  const hd = getObject(attributes.hd) ?? {};
  return {
    initiative: formatSigned(getNumber(getObject(attributes.init)?.total)),
    speed: getPrimaryMovement(getObject(attributes.movement) ?? {}),
    proficiency: formatSigned(getNumber(attributes.prof)),
    hitDice: formatPair(getNumber(hd.value), getNumber(hd.max)),
    tempHp: String(hp.temp)
  };
}

/**
 * Applies a current HP delta through Actor.update after checking update permission.
 */
export async function applyDetailsHpDelta(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  delta: number
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.update) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  const hp = getObject(getObject(actor.system)?.attributes)?.hp;
  const hpObject = getObject(hp) ?? {};
  const current = getNumber(hpObject.value) ?? 0;
  const max = getNumber(hpObject.effectiveMax) ?? getNumber(hpObject.max);
  const next = clampNumber(current + delta, 0, max ?? Number.POSITIVE_INFINITY);
  await actor.update({ "system.attributes.hp.value": next });
  return { ok: true };
}

/**
 * Applies a temporary HP delta through Actor.update after checking update permission.
 */
export async function applyDetailsTempHpDelta(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  delta: number
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.update) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  const hp = getObject(getObject(actor.system)?.attributes)?.hp;
  const current = getNumber(getObject(hp)?.temp) ?? 0;
  const next = clampNumber(current + delta, 0, Number.POSITIVE_INFINITY);
  await actor.update({ "system.attributes.hp.temp": next });
  return { ok: true };
}

/**
 * Starts the dnd5e rest workflow through the Actor API after matching the
 * default dnd5e sheet's rest visibility rules.
 */
export async function applyDetailsRest(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  config: Dnd5eDetailsRestConfig
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.initiateRest) return { ok: false, reason: "unavailable" };
  if (!canInitiateRest(actor, user)) return { ok: false, reason: "forbidden" };

  await actor.initiateRest(config);
  return { ok: true };
}

/**
 * Rolls one hit die through dnd5e's Actor API and returns the visible result
 * needed by the mobile short-rest dialog.
 */
export async function applyDetailsHitDieRoll(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  denomination: string
): Promise<Dnd5eDetailsControlResult & { roll?: Dnd5eDetailsHitDieRollViewModel }> {
  if (!actor?.rollHitDie) return { ok: false, reason: "unavailable" };
  if (!canInitiateRest(actor, user)) return { ok: false, reason: "forbidden" };

  const normalizedDenomination = denomination.trim();
  if (!normalizedDenomination) return { ok: false, reason: "unavailable" };

  const hpBefore = getCurrentHpValue(actor);
  const rollResult = await actor.rollHitDie({ denomination: normalizedDenomination }, { configure: false }, { create: false });
  const rolls = normalizeRolls(rollResult);
  if (!rolls.length) return { ok: false, reason: "unavailable" };

  const total = rolls.reduce<number | null>((sum, roll) => {
    const rollTotal = getNumber(roll.total);
    return rollTotal === null ? sum : (sum ?? 0) + rollTotal;
  }, null);
  const hpAfter = getCurrentHpValue(actor);
  return {
    ok: true,
    roll: {
      denomination: normalizedDenomination,
      total,
      formula: getString(rolls[0]?.formula),
      hpBefore,
      hpAfter,
      hpDelta: hpBefore === null || hpAfter === null ? null : hpAfter - hpBefore
    }
  };
}

/**
 * Toggles heroic inspiration through Actor.update after checking update permission.
 */
export async function toggleDetailsInspiration(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.update) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  const attributes = getObject(getObject(actor.system)?.attributes) ?? {};
  await actor.update({ "system.attributes.inspiration": !Boolean(attributes.inspiration) });
  return { ok: true };
}

/**
 * Applies ordered death save pip behavior through Actor.update after checking permission.
 */
export async function applyDetailsDeathSavePip(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  side: "success" | "failure",
  tappedActive: boolean,
  tappedPipValue = 0,
  fillMode: "step" | "target" = "step"
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.update) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  const death = getObject(getObject(getObject(actor.system)?.attributes)?.death) ?? {};
  const current = clampPipValue(getNumber(death[side]) ?? 0);
  const next = getNextDeathSaveValue(current, tappedActive, tappedPipValue, fillMode);
  await actor.update({ [`system.attributes.death.${side}`]: next });
  return { ok: true };
}

/**
 * Applies exhaustion pip behavior through Actor.update after checking permission.
 */
export async function applyDetailsExhaustionPip(
  actor: Dnd5eDetailsActor | null | undefined,
  user: FoundryUserLike,
  pipValue: number,
  tappedActive: boolean
): Promise<Dnd5eDetailsControlResult> {
  if (!actor?.update) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };

  const next = getNextExhaustionValue(pipValue, tappedActive);
  await actor.update({ "system.attributes.exhaustion": next });
  return { ok: true };
}

/**
 * Computes death save pip updates either step-by-step or to the tapped pip.
 */
export function getNextDeathSaveValue(
  current: number,
  tappedActive: boolean,
  tappedPipValue = 0,
  fillMode: "step" | "target" = "step"
): number {
  const value = clampPipValue(current);
  if (fillMode === "target") {
    const targetValue = clampPipValue(tappedPipValue);
    return tappedActive ? Math.max(targetValue - 1, 0) : targetValue;
  }

  return tappedActive ? Math.max(value - 1, 0) : Math.min(value + 1, 3);
}

/**
 * Computes exhaustion pip toggles. Tapping an inactive pip sets that level;
 * tapping an active pip clears that pip and any higher pips.
 */
export function getNextExhaustionValue(pipValue: number, tappedActive: boolean): number {
  const value = clampExhaustionValue(pipValue);
  return tappedActive ? Math.max(value - 1, 0) : value;
}

function buildHpModel(hp: Record<string, unknown>, canUpdate: boolean): Dnd5eDetailsHpViewModel {
  const value = getNumber(hp.value);
  const max = getNumber(hp.max);
  const effectiveMax = getNumber(hp.effectiveMax) ?? max;
  const temp = getNumber(hp.temp) ?? 0;
  const tempMax = getNumber(hp.tempmax) ?? 0;
  const pct = getNumber(hp.pct) ?? getPercent(value, effectiveMax);

  return {
    value,
    max,
    effectiveMax,
    temp,
    tempMax,
    pct,
    pctLabel: String(pct ?? 0),
    canUpdateValue: canUpdate,
    canUpdateTemp: canUpdate
  };
}

function buildDeathSaves(death: Record<string, unknown>, canUpdate: boolean): Dnd5eDetailsDeathSavesViewModel {
  const success = clampPipValue(getNumber(death.success) ?? 0);
  const failure = clampPipValue(getNumber(death.failure) ?? 0);

  return {
    success,
    failure,
    successPips: buildPips(success),
    failurePips: buildPips(failure),
    canUpdate
  };
}

function buildRestActions(actor: Dnd5eDetailsActor, user: FoundryUserLike): Dnd5eDetailsRestActionViewModel[] {
  const canRest = canInitiateRest(actor, user);
  return [
    {
      type: "short",
      label: getRestTypeLabel("short", "Short Rest"),
      icon: getRestTypeIcon("short", "fa-solid fa-utensils"),
      canRest
    },
    {
      type: "long",
      label: getRestTypeLabel("long", "Long Rest"),
      icon: getRestTypeIcon("long", "fa-solid fa-campground"),
      canRest
    }
  ];
}

function buildShortRest(actor: Dnd5eDetailsActor, attributes: Record<string, unknown>): Dnd5eDetailsShortRestViewModel {
  const hp = getObject(attributes.hp) ?? {};
  const hpValue = getNumber(hp.value);
  const hpMax = getNumber(hp.effectiveMax) ?? getNumber(hp.max);
  const hitDice = buildHitDieOptions(actor, attributes);
  return {
    hpValue,
    hpMax,
    hpLabel: formatPair(hpValue, hpMax),
    hitDice,
    canRollHitDice: hitDice.some(option => !option.disabled)
  };
}

function buildHitDieOptions(actor: Dnd5eDetailsActor, attributes: Record<string, unknown>): Dnd5eDetailsHitDieOptionViewModel[] {
  const hd = getObject(attributes.hd) ?? {};
  const bySize = getObject(hd.bySize);
  if (bySize) {
    return Object.entries(bySize)
      .map(([denomination, available]) => buildHitDieOption(denomination, getNumber(available) ?? 0))
      .sort((a, b) => getDieSize(a.denomination) - getDieSize(b.denomination));
  }

  const classes = getCollectionContents(actor.classes ?? actor.items)
    .map(item => getObject(item))
    .filter(item => getString(item?.type) === "class");
  const classOptions = classes
    .map(item => {
      const system = getObject(item?.system) ?? {};
      const hdSystem = getObject(system.hd) ?? {};
      const denomination = getString(hdSystem.denomination);
      const value = getNumber(hdSystem.value);
      if (!denomination) return null;
      return buildHitDieOption(denomination, value ?? 0);
    })
    .filter((option): option is Dnd5eDetailsHitDieOptionViewModel => Boolean(option));
  if (classOptions.length) return classOptions.sort((a, b) => getDieSize(a.denomination) - getDieSize(b.denomination));

  const denomination = getString(hd.denomination);
  const value = getNumber(hd.value);
  return denomination ? [buildHitDieOption(denomination.startsWith("d") ? denomination : `d${denomination}`, value ?? 0)] : [];
}

function buildHitDieOption(denomination: string, available: number): Dnd5eDetailsHitDieOptionViewModel {
  const normalizedDenomination = denomination.startsWith("d") ? denomination : `d${denomination}`;
  return {
    denomination: normalizedDenomination,
    label: `${normalizedDenomination} (${available} available)`,
    available,
    disabled: available <= 0
  };
}

function getDieSize(denomination: string): number {
  return getNumber(denomination.replace(/^d/i, "")) ?? 0;
}

function canInitiateRest(actor: Dnd5eDetailsActor, user: FoundryUserLike): boolean {
  if (!actor.initiateRest) return false;
  if (getRuntimeUserIsGM(user)) return true;
  return actor.isOwner === true && getDnd5eAllowRestsSetting();
}

function getRestTypeLabel(type: Dnd5eDetailsRestType, fallback: string): string {
  const label = getRuntimeRestType(type)?.label;
  if (typeof label !== "string" || !label.trim()) return fallback;

  const game = (globalThis as { game?: { i18n?: { localize?: (key: string) => string } } }).game;
  return game?.i18n?.localize?.(label) ?? fallback;
}

function getRestTypeIcon(type: Dnd5eDetailsRestType, fallback: string): string {
  const icon = getRuntimeRestType(type)?.icon;
  return typeof icon === "string" && icon.trim() ? icon : fallback;
}

function getRuntimeRestType(type: Dnd5eDetailsRestType): { label?: unknown; icon?: unknown } | null {
  const restTypes = (globalThis as { CONFIG?: { DND5E?: { restTypes?: Record<string, unknown> } } }).CONFIG?.DND5E?.restTypes;
  return getObject(restTypes?.[type]);
}

function getRuntimeUserIsGM(user: FoundryUserLike): boolean {
  const runtimeUser = (globalThis as { game?: { user?: unknown } }).game?.user;
  const candidate = getObject(runtimeUser) ?? getObject(user);
  return Boolean(candidate?.isGM);
}

function getDnd5eAllowRestsSetting(): boolean {
  const settings = (globalThis as { game?: { settings?: { get?: (namespace: string, key: string) => unknown } } }).game?.settings;
  if (typeof settings?.get !== "function") return false;
  return settings.get("dnd5e", "allowRests") === true;
}

function buildExhaustion(attributes: Record<string, unknown>, canUpdate: boolean): Dnd5eDetailsExhaustionViewModel {
  const value = clampExhaustionValue(getNumber(attributes.exhaustion) ?? 0);
  const pips = [1, 2, 3, 4, 5, 6].map(pipValue => ({ value: pipValue, active: pipValue <= value }));
  return {
    value,
    pipGroups: [pips.slice(0, 3), pips.slice(3)],
    canUpdate
  };
}

function buildPips(activeCount: number): Dnd5eDetailsPipViewModel[] {
  return [1, 2, 3].map(value => ({ value, active: value <= activeCount }));
}

function buildDeltaOptions(): Dnd5eDetailsDeltaOption[] {
  const values = Array.from({ length: 101 }, (_unused, index) => 50 - index);
  return values.map(value => ({
    value,
    label: value > 0 ? `+${value}` : String(value),
    center: value === 0
  }));
}

function buildXpModel(xp: Record<string, unknown>): Dnd5eDetailsXpViewModel | null {
  const value = getNumber(xp.value);
  const max = getNumber(xp.max);
  if (value === null || max === null || max <= 0) return null;
  return { value, max, pct: getNumber(xp.pct) ?? getPercent(value, max) ?? 0 };
}

function buildDashboard(attributes: Record<string, unknown>, hp: Dnd5eDetailsHpViewModel, canUpdate: boolean): Dnd5eDetailsDashboardStat[] {
  const ac = getNumber(getObject(attributes.ac)?.value);
  const init = getNumber(getObject(attributes.init)?.total);
  const movement = getObject(attributes.movement) ?? {};
  const prof = getNumber(attributes.prof);
  const hd = getObject(attributes.hd) ?? {};
  const death = getObject(attributes.death) ?? {};
  const exhaustion = getNumber(attributes.exhaustion) ?? 0;
  const stats: Dnd5eDetailsDashboardStat[] = [
    { id: "hp", label: "HP", value: formatPair(hp.value, hp.effectiveMax), interactive: canUpdate },
    { id: "ac", label: "AC", value: ac === null ? "-" : String(ac), interactive: false },
    { id: "initiative", label: "Init", value: formatSigned(init), interactive: true },
    { id: "speed", label: "Speed", value: getPrimaryMovement(movement), interactive: false },
    { id: "proficiency", label: "Prof", value: formatSigned(prof), interactive: false },
    { id: "temp", label: "Temp", value: String(hp.temp), interactive: canUpdate },
    { id: "hit-dice", label: "Hit Dice", value: formatPair(getNumber(hd.value), getNumber(hd.max)), interactive: false }
  ];

  if (getNumber(death.success) || getNumber(death.failure)) {
    stats.push({
      id: "death-saves",
      label: "Death",
      value: `${clampPipValue(getNumber(death.success) ?? 0)}S/${clampPipValue(getNumber(death.failure) ?? 0)}F`,
      interactive: canUpdate
    });
  }

  if (exhaustion > 0) stats.push({ id: "exhaustion", label: "Exhaustion", value: String(exhaustion), interactive: canUpdate });
  if (hp.tempMax > 0) stats.push({ id: "max-hp-mod", label: "Max HP Mod", value: formatSigned(hp.tempMax), interactive: canUpdate });

  return stats;
}

function buildAbilities(system: Record<string, unknown>, config: Dnd5eDetailsConfig): Dnd5eDetailsAbilityViewModel[] {
  const abilities = getObject(system.abilities) ?? {};

  return ABILITY_ORDER.map(id => {
    const ability = getObject(abilities[id]) ?? {};
    const save = getObject(ability.save) ?? {};
    const modifier = getNumber(ability.mod);
    return {
      id,
      label: getConfigLabel(config.abilities, id, id.toUpperCase()),
      abbreviation: id.toUpperCase(),
      value: getNumber(ability.value),
      modifier,
      modifierLabel: formatSigned(modifier),
      save: getNumber(save.value),
      proficient: (getNumber(save.proficient) ?? getNumber(ability.proficient) ?? 0) > 0
    };
  });
}

function buildSaves(abilities: Dnd5eDetailsAbilityViewModel[], attributes: Record<string, unknown>): Dnd5eDetailsSaveViewModel[] {
  const concentrationSave = getNumber(getObject(getObject(attributes.concentration)?.save)?.value);

  return abilities.map(ability => ({
    id: ability.id,
    label: ability.label,
    ability: ability.abbreviation,
    total: ability.save,
    totalLabel: formatSigned(ability.save),
    proficient: ability.proficient,
    concentration: ability.id === "con" && concentrationSave !== null
  }));
}

async function buildSkills(system: Record<string, unknown>, config: Dnd5eDetailsConfig, canUpdate: boolean): Promise<Dnd5eDetailsSkillViewModel[]> {
  const skills = getObject(system.skills) ?? {};
  const rows = Object.entries(skills)
    .map(([id, rawSkill]) => {
      const skill = getObject(rawSkill) ?? {};
      const skillConfig = getObject(config.skills?.[id]);
      const ability = getString(skill.ability) || "wis";
      const reference = getString(skill.reference) || getString(skillConfig?.reference);
      const canToggleFavorite = canUpdate && hasFavoriteApi(system);
      const proficiencyMultiplier = getProficiencyMultiplier(skill);
      return {
        id,
        label: getConfigLabel(config.skills, id, getString(skill.label) || id),
        ability,
        abilityLabel: ability.toUpperCase(),
        total: getNumber(skill.total),
        totalLabel: formatSigned(getNumber(skill.total)),
        passive: getNumber(skill.passive),
        proficient: proficiencyMultiplier > 0,
        proficiencyIndicator: getProficiencyIndicator(proficiencyMultiplier),
        ...(reference ? { reference } : {}),
        __rawSkill: skill,
        __skillConfig: skillConfig,
        ...(canToggleFavorite ? { favorite: isFavorite(system, "skill", id), canToggleFavorite } : {})
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const detailRows = await Promise.all(rows.map(async row => {
    const detail = await getSkillDetailText(row.__rawSkill, row.__skillConfig, row.reference ?? "");
    const { __rawSkill: _rawSkill, __skillConfig: _skillConfig, ...rest } = row;
    return {
      ...rest,
      ...(detail.text ? { detailText: detail.text } : {}),
      ...(detail.references.length ? { detailReferences: detail.references } : {})
    };
  }));

  return detailRows;
}

function buildSkillGroups(skills: Dnd5eDetailsSkillViewModel[]): Dnd5eDetailsSkillGroupViewModel[] {
  const groups = new Map<string, Dnd5eDetailsSkillViewModel[]>();

  for (const row of skills) {
    groups.set(row.ability, [...(groups.get(row.ability) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => getAbilitySort(a) - getAbilitySort(b))
    .map(([ability, rows]) => ({
      ability,
      abilityLabel: ability.toUpperCase(),
      rows: rows.sort((a, b) => a.label.localeCompare(b.label))
    }));
}

async function buildTools(system: Record<string, unknown>, config: Dnd5eDetailsConfig, canUpdate: boolean): Promise<Dnd5eDetailsToolViewModel[]> {
  const tools = getObject(system.tools) ?? {};

  const rows = Object.entries(tools)
    .map(([id, rawTool]) => {
      const tool = getObject(rawTool) ?? {};
      const toolConfig = getObject(config.tools?.[id]);
      const ability = getString(tool.ability) || "";
      const total = getNumber(tool.total);
      const reference = getString(tool.reference) || getString(toolConfig?.reference);
      const baseItemUuid = getToolBaseItemUuid(toolConfig);
      const canToggleFavorite = canUpdate && hasFavoriteApi(system);
      const proficiencyMultiplier = getProficiencyMultiplier(tool);
      return {
        id,
        label: getToolLabel(config.tools, id, tool),
        ability,
        abilityLabel: ability ? ability.toUpperCase() : "-",
        total,
        totalLabel: formatSigned(total),
        proficient: proficiencyMultiplier > 0,
        proficiencyIndicator: getProficiencyIndicator(proficiencyMultiplier),
        ...(reference || baseItemUuid ? { reference: reference || baseItemUuid } : {}),
        __rawTool: tool,
        __toolConfig: toolConfig,
        __reference: reference,
        __baseItemUuid: baseItemUuid,
        ...(canToggleFavorite ? { favorite: isFavorite(system, "tool", id), canToggleFavorite } : {})
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const detailRows = await Promise.all(rows.map(async row => {
    const detail = await getToolDetailText(row.__rawTool, row.__toolConfig, row.__reference, row.__baseItemUuid);
    const {
      __rawTool: _rawTool,
      __toolConfig: _toolConfig,
      __reference: _reference,
      __baseItemUuid: _baseItemUuid,
      ...rest
    } = row;
    return {
      ...rest,
      ...(detail.text ? { detailText: detail.text } : {}),
      ...(detail.references.length ? { detailReferences: detail.references } : {})
    };
  }));

  return detailRows;
}

function getProficiencyMultiplier(entry: Record<string, unknown>): number {
  const directValue = getNumber(entry.value);
  if (directValue !== null) return directValue;

  const profObject = getObject(entry.prof);
  const profMultiplier = getNumber(profObject?.multiplier);
  if (profMultiplier !== null) return profMultiplier;

  return getNumber(entry.prof) ?? getNumber(entry.proficient) ?? 0;
}

function getProficiencyIndicator(multiplier: number): Dnd5eProficiencyIndicator {
  if (multiplier >= 2) return Dnd5eProficiencyIndicator.Expertise;
  if (multiplier >= 1) return Dnd5eProficiencyIndicator.Full;
  if (multiplier > 0) return Dnd5eProficiencyIndicator.Half;
  return Dnd5eProficiencyIndicator.None;
}

function hasFavoriteApi(system: Record<string, unknown>): boolean {
  return typeof system.addFavorite === "function" || typeof system.removeFavorite === "function";
}

function isFavorite(system: Record<string, unknown>, type: "skill" | "tool", id: string): boolean {
  const favorites = getCollectionContents(system.favorites);
  return favorites.some(favorite => {
    if (typeof favorite === "string") return favorite === id;
    const object = getObject(favorite);
    return getString(object?.type) === type && getString(object?.id) === id;
  });
}

async function buildTraitGroups(actor: Dnd5eDetailsActor, system: Record<string, unknown>, config: Dnd5eDetailsConfig): Promise<Dnd5eDetailsTraitGroupViewModel[]> {
  const details = getObject(system.details) ?? {};
  const attributes = getObject(system.attributes) ?? {};
  const traits = getObject(system.traits) ?? {};
  const armorTrait = getObject(traits.armorProf) ?? getObject(traits.armor);
  const weaponTrait = getObject(traits.weaponProf) ?? getObject(traits.weapon);
  const groups: Dnd5eDetailsTraitGroupViewModel[] = [];
  const speciesItem = getOwnedItem(actor, ["race", "species"]);
  const backgroundItem = getOwnedItem(actor, ["background"]);
  const speciesReferenceUuid = await getTraitReferenceUuid(speciesItem);
  const backgroundReferenceUuid = await getTraitReferenceUuid(backgroundItem);

  addGroup(groups, "origin", "Origin", [
    toTraitPill(getCreatureType(details, config)),
    toTraitPill(speciesItem?.name?.trim() || getString(details.race) || getString(details.species), speciesReferenceUuid),
    toTraitPill(backgroundItem?.name?.trim() || getString(details.background), backgroundReferenceUuid),
    toTraitPill(getConfigLabel(config.actorSizes, getString(traits.size), getString(traits.size)))
  ]);
  addGroup(groups, "senses", "Senses", getSenses(attributes, config).map(value => toTraitPill(value)));
  addGroup(groups, "damage-resistances", "Resistances", getTraitValues(getObject(traits.dr), config.damageTypes).map(value => toTraitPill(value)));
  addGroup(groups, "damage-immunities", "Damage Immunities", getTraitValues(getObject(traits.di), config.damageTypes).map(value => toTraitPill(value)));
  addGroup(groups, "condition-immunities", "Condition Immunities", getTraitValues(getObject(traits.ci), config.conditionTypes).map(value => toTraitPill(value)));
  addGroup(groups, "vulnerabilities", "Vulnerabilities", getTraitValues(getObject(traits.dv), config.damageTypes).map(value => toTraitPill(value)), "warning");
  addGroup(groups, "damage-modifications", "Damage Modifications", getTraitValues(getObject(traits.dm), undefined, actor).map(value => toTraitPill(value)));
  addGroup(groups, "armor", "Armor Proficiency", getTraitValues(armorTrait, config.armorProficiencies).map(value => toTraitPill(value)));
  addGroup(groups, "weapons", "Weapon Proficiency", getWeaponTraits(weaponTrait, config).map(value => toTraitPill(value)));
  addGroup(groups, "languages", "Languages", getTraitValues(getObject(traits.languages), config.languages).map(value => toTraitPill(value)));

  return groups;
}

function getTraitValues(trait: Record<string, unknown> | null, labels?: Dnd5eLabelDictionary, actor?: Dnd5eDetailsActor): string[] {
  if (!trait) return [];
  const values = getArrayStrings(trait.value).map(value => getConfigLabel(labels, value, value));
  const labelValues = getTraitLabelStrings(trait.labels);
  const custom = getString(trait.custom);
  const rollData = actor?.getRollData?.({ deterministic: true });
  const deterministicValues = rollData ? [] : [];
  return uniqueStringsCaseInsensitive([...labelValues, ...values, ...splitTraitText(custom), ...deterministicValues]);
}

function getWeaponTraits(weaponTrait: Record<string, unknown> | null, config: Dnd5eDetailsConfig): string[] {
  if (!weaponTrait) return [];

  const valueKeys = getArrayStrings(weaponTrait.value);
  if (valueKeys.length === 0) return getTraitValues(weaponTrait, config.weaponProficiencies);

  const mastered = new Set(getArrayStrings(getObject(weaponTrait.mastery)?.value).map(value => value.toLocaleLowerCase()));
  return uniqueStringsCaseInsensitive(
    valueKeys.map(key => {
      const label = getConfigLabel(config.weaponProficiencies, key, key);
      return mastered.has(key.toLocaleLowerCase()) ? `${label} Mastery` : label;
    })
  );
}

function getSenses(attributes: Record<string, unknown>, config: Dnd5eDetailsConfig): string[] {
  const senses = getObject(attributes.senses) ?? {};
  const ranges = getObject(senses.ranges) ?? senses;
  const values = Object.entries(ranges)
    .filter(([key]) => key !== "units" && key !== "special")
    .map(([key, value]) => {
      const distance = getNumber(value);
      return distance && distance > 0 ? `${getConfigLabel(config.senses, key, key)} ${distance}` : "";
    });
  return uniqueStrings([...values, ...splitTraitText(getString(senses.special))]);
}

function getCreatureType(details: Record<string, unknown>, config: Dnd5eDetailsConfig): string {
  const type = getObject(details.type) ?? {};
  const value = getString(type.value);
  const custom = getString(type.custom);
  const subtype = getString(type.subtype);
  const label = custom || getConfigLabel(config.creatureTypes, value, value);
  return [label, subtype].filter(Boolean).join(" ");
}

function getClassSummary(actor: Dnd5eDetailsActor): string {
  const classes = getActorClasses(actor);
  if (classes.length === 0) return "";

  return classes
    .map(item => {
      const levels = getNumber(getObject(item.system)?.levels);
      return `${item.name?.trim() || "Class"}${levels === null ? "" : ` ${levels}`}`;
    })
    .join(" / ");
}

function getActorClasses(actor: Dnd5eDetailsActor): Dnd5eDetailsClassLike[] {
  if (actor.classes instanceof Map) return [...actor.classes.values()];
  if (actor.classes && Symbol.iterator in Object(actor.classes)) return [...(actor.classes as Iterable<Dnd5eDetailsClassLike>)];
  if (actor.classes && typeof actor.classes === "object") return Object.values(actor.classes);
  return (getCollectionContents(actor.items) as Dnd5eDetailsClassLike[]).filter(item => item.type === "class");
}

function getOwnedItem(actor: Dnd5eDetailsActor, types: string[]): (Dnd5eDetailsClassLike & {
  uuid?: string;
  richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
  system?: Record<string, unknown> & {
    richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
  };
}) | null {
  const typeSet = new Set(types.map(value => value.toLocaleLowerCase()));
  const item = (getCollectionContents(actor.items) as Dnd5eDetailsClassLike[]).find(candidate => {
    const type = getString(candidate.type).toLocaleLowerCase();
    return typeSet.has(type);
  });
  if (!item) return null;
  return item as Dnd5eDetailsClassLike & {
    uuid?: string;
    richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
    system?: Record<string, unknown> & {
      richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

async function getTraitReferenceUuid(item: (Dnd5eDetailsClassLike & {
  uuid?: string;
  richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
  system?: Record<string, unknown> & {
    richTooltip?: (options?: Record<string, unknown>) => Promise<unknown>;
  };
}) | null): Promise<string | undefined> {
  const uuid = getString(item?.uuid);
  if (!item || !uuid) return undefined;

  const richTooltip = item.richTooltip ?? item.system?.richTooltip;
  if (typeof richTooltip !== "function") return undefined;

  try {
    const tooltip = getObject(await richTooltip.call(item, {}));
    const content = getString(tooltip?.content);
    return content ? uuid : undefined;
  } catch {
    return undefined;
  }
}

function toTraitPill(label: string, referenceUuid?: string): Dnd5eDetailsTraitPillViewModel {
  return referenceUuid ? { label, referenceUuid } : { label };
}

function addGroup(
  groups: Dnd5eDetailsTraitGroupViewModel[],
  id: string,
  label: string,
  rawPills: Dnd5eDetailsTraitPillViewModel[],
  tone: "neutral" | "warning" = "neutral"
): void {
  const pills = uniqueStrings(rawPills.map(pill => pill.label))
    .map(uniqueLabel => rawPills.find(pill => pill.label === uniqueLabel))
    .filter((pill): pill is Dnd5eDetailsTraitPillViewModel => Boolean(pill));
  if (pills.length > 0) groups.push({ id, label, origin: id === "origin", warning: tone === "warning", tone, pills });
}

function getRuntimeDnd5eConfig(): Dnd5eDetailsConfig {
  const config = getObject(getObject((globalThis as { CONFIG?: unknown }).CONFIG)?.DND5E) ?? {};
  return {
    abilities: getObject(config.abilities) as Dnd5eLabelDictionary | undefined,
    skills: getObject(config.skills) as Dnd5eLabelDictionary | undefined,
    movementTypes: getObject(config.movementTypes) as Dnd5eLabelDictionary | undefined,
    senses: getObject(config.senses) as Dnd5eLabelDictionary | undefined,
    actorSizes: getObject(config.actorSizes) as Dnd5eLabelDictionary | undefined,
    creatureTypes: getObject(config.creatureTypes) as Dnd5eLabelDictionary | undefined,
    damageTypes: getObject(config.damageTypes) as Dnd5eLabelDictionary | undefined,
    conditionTypes: getObject(config.conditionTypes) as Dnd5eLabelDictionary | undefined,
    armorProficiencies: getObject(config.armorProficiencies) as Dnd5eLabelDictionary | undefined,
    weaponProficiencies: getObject(config.weaponProficiencies) as Dnd5eLabelDictionary | undefined,
    languages: getObject(config.languages) as Dnd5eLabelDictionary | undefined,
    tools: getObject(config.tools) as Dnd5eLabelDictionary | undefined
  };
}

function getPrimaryMovement(movement: Record<string, unknown>): string {
  const candidates = ["walk", "fly", "swim", "climb", "burrow"];
  for (const key of candidates) {
    const value = getNumber(movement[key]);
    if (value && value > 0) return String(value);
  }
  return "-";
}

function getToolLabel(labels: Dnd5eLabelDictionary | undefined, key: string, preparedTool: Record<string, unknown>): string {
  const preparedLabel = getString(preparedTool.label) || getString(preparedTool.name);
  if (preparedLabel) return preparedLabel;

  const configLabel = getConfigLabel(labels, key, "");
  if (configLabel) return configLabel;

  const baseItemName = getConfiguredToolBaseItemName(labels?.[key]);
  return baseItemName || key;
}

function getToolBaseItemUuid(toolConfig: Record<string, unknown> | null): string {
  return getString(toolConfig?.id) || getString(toolConfig?.uuid);
}

async function getToolDetailText(
  tool: Record<string, unknown>,
  toolConfig: Record<string, unknown> | null,
  reference: string,
  baseItemUuid: string
): Promise<{ text: string; references: RichTextReference[] }> {
  const explicitDetail = [
    getString(tool.detail),
    getString(tool.details),
    getString(tool.description),
    getString(tool.tooltip),
    getString(tool.summary),
    getString(tool.examples),
    getString(toolConfig?.detail),
    getString(toolConfig?.details),
    getString(toolConfig?.description),
    getString(toolConfig?.tooltip),
    getString(toolConfig?.summary),
    getString(toolConfig?.examples)
  ].find(Boolean) ?? "";
  if (explicitDetail) return await summarizeDetailText(explicitDetail);

  const fromReference = await getReferenceExcerpt(reference);
  if (fromReference.text || fromReference.references.length) return fromReference;

  return await getReferenceExcerpt(baseItemUuid);
}

function getConfiguredToolBaseItemName(toolConfig: Dnd5eLabelDictionary[string] | undefined): string {
  const toolObject = getObject(toolConfig);
  const uuid = getString(toolObject?.id) || getString(toolObject?.uuid);
  if (!uuid) return "";

  const parts = uuid.split(".");
  if (parts.length < 5 || parts[0] !== "Compendium") return "";

  const packId = `${parts[1]}.${parts[2]}`;
  const documentId = parts[4];
  const game = getObject((globalThis as { game?: unknown }).game);
  const packs = getObject(game?.packs);
  const pack = getObject(getCollectionEntry(packs, packId));
  const index = getCollectionContents(pack?.index);
  const entry = index.map(getObject).find(row => getString(row?._id) === documentId || getString(row?.id) === documentId);
  return getString(entry?.name);
}

function getCollectionEntry(collection: Record<string, unknown> | null, key: string): unknown {
  const get = collection?.get;
  if (typeof get === "function") return (get as (id: string) => unknown).call(collection, key);
  return collection?.[key];
}

function getArrayStrings(value: unknown): string[] {
  if (value instanceof Set) return [...value].map(getString).filter(Boolean);
  if (Array.isArray(value)) return value.map(getString).filter(Boolean);
  const single = getString(value);
  return single ? [single] : [];
}

function getTraitLabelStrings(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (value instanceof Set) return [...value].flatMap(entry => getTraitLabelStrings(entry));
  if (Array.isArray(value)) return value.flatMap(entry => getTraitLabelStrings(entry));

  const object = getObject(value);
  if (!object) return [];

  const directLabel = getString(object.label);
  const directName = getString(object.name);
  const nested = Object.values(object).flatMap(entry => getTraitLabelStrings(entry));
  return [...(directLabel ? [directLabel] : []), ...(directName ? [directName] : []), ...nested];
}

function splitTraitText(value: string): string[] {
  return value
    .split(/[;,]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function uniqueStringsCaseInsensitive(values: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function getAbilitySort(ability: string): number {
  const index = ABILITY_ORDER.indexOf(ability as (typeof ABILITY_ORDER)[number]);
  return index === -1 ? ABILITY_ORDER.length : index;
}

function formatSigned(value: number | null): string {
  if (value === null) return "-";
  return value >= 0 ? `+${value}` : String(value);
}

function getPercent(value: number | null, max: number | null): number | null {
  if (value === null || max === null || max <= 0) return null;
  return clampNumber(Math.round((value / max) * 100), 0, 100);
}

function clampPipValue(value: number): number {
  return clampNumber(Math.trunc(value), 0, 3);
}

function clampExhaustionValue(value: number): number {
  return clampNumber(Math.trunc(value), 0, 6);
}

function getCurrentHpValue(actor: Dnd5eDetailsActor): number | null {
  return getNumber(getObject(getObject(getObject(actor.system)?.attributes)?.hp)?.value);
}

function normalizeRolls(rollResult: unknown): Array<{ total?: unknown; formula?: unknown }> {
  if (Array.isArray(rollResult)) return rollResult.filter(roll => typeof roll === "object" && roll !== null) as Array<{ total?: unknown; formula?: unknown }>;
  return typeof rollResult === "object" && rollResult !== null ? [rollResult as { total?: unknown; formula?: unknown }] : [];
}

async function getSkillDetailText(
  skill: Record<string, unknown>,
  skillConfig: Record<string, unknown> | null,
  reference: string
): Promise<{ text: string; references: RichTextReference[] }> {
  const explicitDetail = [
    getString(skill.detail),
    getString(skill.details),
    getString(skill.description),
    getString(skill.tooltip),
    getString(skill.summary),
    getString(skill.examples),
    getString(skillConfig?.detail),
    getString(skillConfig?.details),
    getString(skillConfig?.description),
    getString(skillConfig?.tooltip),
    getString(skillConfig?.summary),
    getString(skillConfig?.examples)
  ].find(Boolean) ?? "";
  if (explicitDetail) return await summarizeDetailText(explicitDetail);

  return await getReferenceExcerpt(reference);
}

async function getReferenceExcerpt(reference: string): Promise<{ text: string; references: RichTextReference[] }> {
  if (!reference) return { text: "", references: [] };

  const fromUuid = (globalThis as {
    fromUuid?: (uuid: string) => Promise<unknown>;
    foundry?: { utils?: { fromUuid?: (uuid: string) => Promise<unknown> } };
  }).fromUuid ?? (globalThis as { foundry?: { utils?: { fromUuid?: (uuid: string) => Promise<unknown> } } }).foundry?.utils?.fromUuid;
  if (typeof fromUuid !== "function") return { text: "", references: [] };

  let document: Record<string, unknown> | null = null;
  try {
    document = getObject(await fromUuid(reference));
  } catch {
    // UUID lookup may fail for unavailable references; keep the row stable.
    return { text: "", references: [] };
  }
  if (!document) return { text: "", references: [] };

  const text = getObject(document.text) ?? getObject(getObject(document.system)?.text);
  const description = getObject(getObject(document.system)?.description);
  const rawContent = getString(text?.content)
    || getString(document.content)
    || getString(getObject(document.system)?.content)
    || getString(description?.value)
    || getString(description?.chat)
    || getString(document.description);
  return await summarizeDetailText(rawContent, document);
}

async function summarizeDetailText(value: string, relativeTo?: unknown): Promise<{ text: string; references: RichTextReference[] }> {
  const summary = await summarizeRichTextWithReferences(value, {
    enrichHtml: getTextEnricher(),
    relativeTo,
    maxSentences: 2,
    maxLength: 320
  });
  return { ...summary, text: formatDetailTextForDisplay(summary.text) };
}

function getTextEnricher(): ((content: string, options?: Record<string, unknown>) => Promise<string> | string) | undefined {
  const textEditor = getFoundryRuntime().TextEditor;
  return typeof textEditor?.enrichHTML === "function" ? textEditor.enrichHTML.bind(textEditor) : undefined;
}

function formatDetailTextForDisplay(value: string): string {
  return value
    .replace(/\s+(Ability|Utilize|Craft|Examples?)\s*:/gi, "\n$1:")
    .trim();
}
