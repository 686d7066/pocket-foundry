import type { PermissionCheckedDocument } from "../../../services/permissions.ts";
import type { RichTextReference } from "../../../services/rich-text-links.ts";

/**
 * Minimal dnd5e actor shape required to build the Details pane view model.
 */
export type Dnd5eDetailsActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  name?: string;
  type?: string;
  img?: string | null;
  isOwner?: boolean;
  system?: Record<string, unknown>;
  items?: unknown;
  classes?: Record<string, Dnd5eDetailsClassLike> | Map<string, Dnd5eDetailsClassLike> | Iterable<Dnd5eDetailsClassLike>;
  getRollData?: (options?: { deterministic?: boolean }) => Record<string, unknown>;
  initiateRest?: (config: Dnd5eDetailsRestConfig) => Promise<unknown>;
  rollHitDie?: (config?: { denomination?: string }, dialog?: { configure?: boolean }, message?: { create?: boolean }) => Promise<unknown>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Minimal class item shape used for dnd5e character summaries.
 */
export type Dnd5eDetailsClassLike = {
  name?: string;
  type?: string;
  system?: Record<string, unknown>;
};

/**
 * Optional dnd5e label dictionaries injected by tests or read from CONFIG.DND5E at runtime.
 */
export type Dnd5eDetailsConfig = {
  abilities?: Dnd5eLabelDictionary;
  skills?: Dnd5eLabelDictionary;
  movementTypes?: Dnd5eLabelDictionary;
  senses?: Dnd5eLabelDictionary;
  actorSizes?: Dnd5eLabelDictionary;
  creatureTypes?: Dnd5eLabelDictionary;
  damageTypes?: Dnd5eLabelDictionary;
  conditionTypes?: Dnd5eLabelDictionary;
  armorProficiencies?: Dnd5eLabelDictionary;
  weaponProficiencies?: Dnd5eLabelDictionary;
  languages?: Dnd5eLabelDictionary;
  tools?: Dnd5eLabelDictionary;
};

/**
 * dnd5e config labels are not always plain strings in v14. Some entries, such
 * as tool proficiencies, point at a base item that provides the display name.
 */
export type Dnd5eLabelDictionary = Record<string, string | { label?: string; name?: string; id?: string; uuid?: string }>;

export enum Dnd5eProficiencyIndicator {
  None = "none",
  Half = "half",
  Full = "full",
  Expertise = "expertise"
}

/**
 * Compact value rendered in the high-priority Details dashboard.
 */
export type Dnd5eDetailsDashboardStat = {
  id: string;
  label: string;
  value: string;
  suffix?: string;
  interactive: boolean;
};

/**
 * Named dashboard values used by the Details template where Handlebars should
 * not rely on array indexes.
 */
export type Dnd5eDetailsDashboardSummary = {
  initiative: string;
  speed: string;
  proficiency: string;
  hitDice: string;
  tempHp: string;
};

/**
 * Number-wheel option rendered by HP and temporary HP adjustment dialogs.
 */
export type Dnd5eDetailsDeltaOption = {
  value: number;
  label: string;
  center: boolean;
};

/**
 * Header model for the persistent mobile character identity area.
 */
export type Dnd5eDetailsHeaderViewModel = {
  actorUuid: string;
  characterLabel: "Character";
  name: string;
  portraitImage: string | null;
  classSummary: string;
  level: number | null;
  ac: number | null;
  hp: Dnd5eDetailsHpViewModel;
  inspiration: {
    active: boolean;
    canToggle: boolean;
  };
  epicBoons: number | null;
  xp: Dnd5eDetailsXpViewModel | null;
};

/**
 * Hit point state displayed in the header and dashboard.
 */
export type Dnd5eDetailsHpViewModel = {
  value: number | null;
  max: number | null;
  effectiveMax: number | null;
  temp: number;
  tempMax: number;
  pct: number | null;
  pctLabel: string;
  canUpdateValue: boolean;
  canUpdateTemp: boolean;
};

/**
 * XP progress state, omitted when leveling mode hides XP.
 */
export type Dnd5eDetailsXpViewModel = {
  value: number;
  max: number;
  pct: number;
};

/**
 * Ability score tile rendered in the Details ability strip.
 */
export type Dnd5eDetailsAbilityViewModel = {
  id: string;
  label: string;
  abbreviation: string;
  value: number | null;
  modifier: number | null;
  modifierLabel: string;
  save: number | null;
  proficient: boolean;
};

/**
 * Saving throw row rendered as its own Details group.
 */
export type Dnd5eDetailsSaveViewModel = {
  id: string;
  label: string;
  ability: string;
  total: number | null;
  totalLabel: string;
  proficient: boolean;
  concentration: boolean;
};

/**
 * Skill row rendered inside a dense alphabetical table.
 */
export type Dnd5eDetailsSkillViewModel = {
  id: string;
  label: string;
  ability: string;
  abilityLabel: string;
  total: number | null;
  totalLabel: string;
  passive: number | null;
  proficient: boolean;
  proficiencyIndicator: Dnd5eProficiencyIndicator;
  reference?: string;
  detailText?: string;
  detailReferences?: RichTextReference[];
  favorite?: boolean;
  canToggleFavorite?: boolean;
};

/**
 * Dense skill group keyed by the associated ability.
 */
export type Dnd5eDetailsSkillGroupViewModel = {
  ability: string;
  abilityLabel: string;
  rows: Dnd5eDetailsSkillViewModel[];
};

/**
 * Tool proficiency row rendered separately from skills.
 */
export type Dnd5eDetailsToolViewModel = {
  id: string;
  label: string;
  ability: string;
  abilityLabel: string;
  total: number | null;
  totalLabel: string;
  proficient: boolean;
  proficiencyIndicator: Dnd5eProficiencyIndicator;
  reference?: string;
  detailText?: string;
  detailReferences?: RichTextReference[];
  favorite?: boolean;
  canToggleFavorite?: boolean;
};

/**
 * Trait group rendered as a compact pill cluster.
 */
export type Dnd5eDetailsTraitGroupViewModel = {
  id: string;
  label: string;
  origin: boolean;
  warning: boolean;
  tone: "neutral" | "warning";
  pills: Dnd5eDetailsTraitPillViewModel[];
};

/**
 * Trait pill rendered in compact clusters with optional internal document reference.
 */
export type Dnd5eDetailsTraitPillViewModel = {
  label: string;
  referenceUuid?: string;
};

/**
 * Play-mode death save state and update permission.
 */
export type Dnd5eDetailsDeathSavesViewModel = {
  success: number;
  failure: number;
  successPips: Dnd5eDetailsPipViewModel[];
  failurePips: Dnd5eDetailsPipViewModel[];
  canUpdate: boolean;
};

/**
 * Exhaustion level rendered as compact pips.
 */
export type Dnd5eDetailsExhaustionViewModel = {
  value: number;
  pipGroups: Dnd5eDetailsPipViewModel[][];
  canUpdate: boolean;
};

/**
 * Supported dnd5e rest types exposed by the character Details pane.
 */
export type Dnd5eDetailsRestType = "short" | "long";

/**
 * Mobile-native rest configuration passed through to dnd5e's Actor API.
 */
export type Dnd5eDetailsRestConfig = {
  type: Dnd5eDetailsRestType;
  dialog: false;
  autoHD?: boolean;
  newDay?: boolean;
  recoverTemp?: boolean;
  recoverTempMax?: boolean;
};

/**
 * Rest workflow button rendered in the Details dashboard.
 */
export type Dnd5eDetailsRestActionViewModel = {
  type: Dnd5eDetailsRestType;
  label: string;
  icon: string;
  canRest: boolean;
};

/**
 * Hit die option exposed in the mobile-native short rest dialog.
 */
export type Dnd5eDetailsHitDieOptionViewModel = {
  denomination: string;
  label: string;
  available: number;
  disabled: boolean;
};

/**
 * Short rest state rendered without exposing editable HP controls.
 */
export type Dnd5eDetailsShortRestViewModel = {
  hpValue: number | null;
  hpMax: number | null;
  hpLabel: string;
  hitDice: Dnd5eDetailsHitDieOptionViewModel[];
  canRollHitDice: boolean;
};

/**
 * Result of a mobile short-rest hit-die roll.
 */
export type Dnd5eDetailsHitDieRollViewModel = {
  denomination: string;
  total: number | null;
  formula: string | null;
  hpBefore: number | null;
  hpAfter: number | null;
  hpDelta: number | null;
};

/**
 * Ordered pip rendered for death save controls.
 */
export type Dnd5eDetailsPipViewModel = {
  value: number;
  active: boolean;
};

/**
 * Complete Details pane data model produced for an observable dnd5e character.
 */
export type Dnd5eDetailsViewModel = {
  unavailable: false;
  canUpdate: boolean;
  deltaOptions: Dnd5eDetailsDeltaOption[];
  header: Dnd5eDetailsHeaderViewModel;
  dashboard: Dnd5eDetailsDashboardStat[];
  dashboardSummary: Dnd5eDetailsDashboardSummary;
  abilities: Dnd5eDetailsAbilityViewModel[];
  saves: Dnd5eDetailsSaveViewModel[];
  skills: Dnd5eDetailsSkillViewModel[];
  skillGroups: Dnd5eDetailsSkillGroupViewModel[];
  tools: Dnd5eDetailsToolViewModel[];
  traitGroups: Dnd5eDetailsTraitGroupViewModel[];
  deathSaves: Dnd5eDetailsDeathSavesViewModel;
  exhaustion: Dnd5eDetailsExhaustionViewModel;
  restActions: Dnd5eDetailsRestActionViewModel[];
  shortRest: Dnd5eDetailsShortRestViewModel;
};

/**
 * Non-leaking Details state for missing, hidden, or non-character actors.
 */
export type UnavailableDnd5eDetailsViewModel = {
  unavailable: true;
  title: "Character Unavailable";
  body: "This character is not available to the current user.";
};

/**
 * Details pane model returned to callers after permission gating.
 */
export type Dnd5eDetailsModel = Dnd5eDetailsViewModel | UnavailableDnd5eDetailsViewModel;

/**
 * Result returned by permission-checked play-control helpers.
 */
export type Dnd5eDetailsControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden";
};
