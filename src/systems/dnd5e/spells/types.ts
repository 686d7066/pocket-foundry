import type { PermissionCheckedDocument } from "../../../services/permissions.ts";

export type Dnd5eSpellsActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  type?: string;
  name?: string;
  system?: Record<string, unknown>;
  items?: unknown;
  itemTypes?: { spell?: Dnd5eSpellItem[] };
  spellcastingClasses?: Record<string, Dnd5eSpellcastingClass>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  updateEmbeddedDocuments?: (embeddedName: "Item", updates: Array<Record<string, unknown>>) => Promise<unknown>;
};

export type Dnd5eSpellItem = PermissionCheckedDocument & {
  id?: string;
  _id?: string;
  uuid?: string;
  name?: string;
  type?: string;
  img?: string | null;
  parent?: Dnd5eSpellsActor | null;
  flags?: Record<string, unknown>;
  system?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  hasAttack?: boolean;
  hasRecharge?: boolean;
  hasLimitedUses?: boolean;
  isOnCooldown?: boolean;
  isOwner?: boolean;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  use?: (eventOrOptions?: unknown, options?: unknown) => Promise<unknown>;
  getFlag?: (scope: string, key: string) => unknown;
};

export type Dnd5eSpellActivity = {
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

export type Dnd5eSpellcastingClass = Dnd5eSpellItem & {
  identifier?: string;
  subclass?: Dnd5eSpellItem;
  spellcasting?: {
    ability?: string;
    attack?: number;
    save?: number;
    progression?: string;
    preparation?: { value?: number; max?: number };
  };
};

export type Dnd5eSpellcastingConfig = {
  key?: string;
  order?: number;
  slots?: boolean;
  cantrips?: boolean;
  prepares?: boolean;
  getAvailableLevels?: (actor: Dnd5eSpellsActor) => number[];
  getSpellSlotKey?: (level: number | null) => string;
  getLabel?: (options: { level?: number | null }) => string;
};

export type Dnd5eSpellsConfig = {
  spellcasting?: Record<string, Dnd5eSpellcastingConfig>;
  spellPreparationStates?: Record<string, { value?: unknown; label?: string }>;
  spellSchools?: Record<string, string | { label?: string; icon?: string }>;
  abilities?: Record<string, { label?: string; abbreviation?: string }>;
};

export type Dnd5eSpellcastingCardViewModel = {
  id: string;
  label: string;
  ability: string;
  abilityLabel: string;
  abilityMod: string;
  attack: string;
  save: string;
  prepared: string;
  primary: boolean;
  canSetPrimary: boolean;
};

export type Dnd5eSpellSlotTrackViewModel = {
  id: string;
  label: string;
  levelLabel: string;
  value: number;
  max: number;
  displayMax: number;
  prop: string;
  pips: Dnd5eSpellSlotPipViewModel[];
  canUpdate: boolean;
  favorite: boolean;
  canToggleFavorite: boolean;
};

export type Dnd5eSpellSlotPipViewModel = {
  n: number;
  label: string;
  filled: boolean;
  temporary: boolean;
};

export type Dnd5eSpellSectionViewModel = {
  id: string;
  method: string;
  level: number | null;
  label: string;
  order: number;
  count: number;
  slotTrack: Dnd5eSpellSlotTrackViewModel | null;
  spells: Dnd5eSpellRowViewModel[];
  empty: boolean;
  filtered: boolean;
};

export type Dnd5eSpellRowViewModel = {
  id: string;
  uuid: string;
  name: string;
  icon: string | null;
  iconText: string;
  subtitle: string;
  source: string;
  components: string;
  school: string;
  activation: string;
  range: string;
  target: string;
  roll: string;
  usesLabel: string;
  preparedLabel: string;
  prepared: boolean;
  alwaysPrepared: boolean;
  concentration: boolean;
  ritual: boolean;
  description: string;
  chips: string[];
  facts: Array<{ label: string; value: string }>;
  activities: Dnd5eSpellActivityViewModel[];
  adjustments: Dnd5eSpellAdjustmentViewModel[];
  actions: {
    canUpdate: boolean;
    canUse: boolean;
    canPrepare: boolean;
    canRecharge: boolean;
    canAdjustUses: boolean;
    canToggleFavorite: boolean;
  };
  favorite: boolean;
};

export type Dnd5eSpellActivityViewModel = {
  id: string;
  name: string;
  icon: string | null;
  iconText: string;
  activation: string;
  range: string;
  target: string;
  save: string;
  toHit: string;
  roll: string;
  usesLabel: string;
  canUse: boolean;
};

export type Dnd5eSpellAdjustmentViewModel = {
  id: "uses";
  title: string;
  label: string;
  value: string;
  current: number;
  max: number;
  options: Dnd5eSpellDeltaOption[];
};

export type Dnd5eSpellDeltaOption = {
  value: number;
  label: string;
  center: boolean;
};

export type Dnd5eSpellsViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  searchQuery: string;
  canClearSearch: boolean;
  spellcasting: Dnd5eSpellcastingCardViewModel[];
  slotTracks: Dnd5eSpellSlotTrackViewModel[];
  sections: Dnd5eSpellSectionViewModel[];
};

export type UnavailableDnd5eSpellsViewModel = {
  unavailable: true;
  title: "Spells Unavailable";
  body: "These spells are not available to the current user.";
};

export type Dnd5eSpellsModel = Dnd5eSpellsViewModel | UnavailableDnd5eSpellsViewModel;

export type Dnd5eSpellsControlResult = {
  ok: boolean;
  reason?: "unavailable" | "forbidden" | "unsupported";
};

const ordinal = (value: number): string => {
  const abs = Math.abs(Math.trunc(value));
  const suffix = abs % 100 >= 11 && abs % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[abs % 10] ?? "th";
  return `${value}${suffix}`;
};

export const DEFAULT_SPELLCASTING: Record<string, Dnd5eSpellcastingConfig> = {
  spell: {
    key: "spell",
    order: 100,
    slots: true,
    cantrips: true,
    prepares: true,
    getSpellSlotKey: level => `spell${level ?? 1}`,
    getLabel: ({ level }) => (level === 0 ? "Cantrips" : `${ordinal(level ?? 1)} Level`)
  },
  pact: {
    key: "pact",
    order: 200,
    slots: true,
    prepares: false,
    getSpellSlotKey: () => "pact",
    getLabel: ({ level }) => `Pact Magic${level ? ` (${ordinal(level)} Level)` : ""}`
  },
  innate: {
    key: "innate",
    order: 300,
    slots: false,
    prepares: false,
    getSpellSlotKey: () => "innate",
    getLabel: () => "Innate"
  },
  atwill: {
    key: "atwill",
    order: 250,
    slots: false,
    prepares: false,
    getSpellSlotKey: () => "atwill",
    getLabel: () => "At-will"
  }
};

