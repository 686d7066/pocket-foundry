import { getFoundryRuntime } from "../core/foundry-globals.ts";
import { getCollectionContents, getInitials, getNumber, getObject, getString } from "../core/utils.ts";
import { canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "./permissions.ts";

const ENCOUNTER_VISIBILITY_MODULE_ID = "encounter-visibility";
const ENCOUNTER_VISIBILITY_FLAG_KEY = "isVisible";

export type CombatSummaryViewModel = {
  id: string;
  name: string;
  started: boolean;
  round: number | null;
  turn: number | null;
  roundLabel: string;
  turnLabel: string;
  hasCombatants: boolean;
};

export type CombatantRowViewModel = {
  id: string;
  icon: string | null;
  iconText: string;
  name: string;
  initiative: number | null;
  initiativeLabel: string;
  isHostile: boolean;
  isActive: boolean;
  isNext: boolean;
  hidden: boolean;
  defeated: boolean;
};

export type CombatActionsViewModel = {
  isCombatActive: boolean;
  canEndTurn: boolean;
};

export type CombatViewModel = {
  encounter: CombatSummaryViewModel;
  combatants: CombatantRowViewModel[];
  hasCombat: boolean;
  localUserTurn: boolean;
  actions: CombatActionsViewModel;
};

type CombatCollectionLike = Iterable<CombatDocumentLike> & { contents?: CombatDocumentLike[] };

type CombatDocumentLike = PermissionCheckedDocument & {
  id?: string;
  name?: string;
  visible?: boolean;
  started?: boolean;
  round?: number | null;
  turn?: number | null;
  turns?: CombatantDocumentLike[];
  combatants?: Iterable<CombatantDocumentLike> & { contents?: CombatantDocumentLike[]; size?: number };
  combatant?: CombatantDocumentLike | null;
  nextCombatant?: CombatantDocumentLike | null;
  nextTurn?: () => Promise<unknown>;
  getFlag?: (scope: string, key: string) => unknown;
};

type CombatantDocumentLike = PermissionCheckedDocument & {
  id?: string;
  name?: string;
  img?: string | null;
  initiative?: number | null;
  hidden?: boolean;
  defeated?: boolean;
  isDefeated?: boolean;
  disposition?: number | null;
  actor?: PermissionCheckedDocument | null;
  token?: { actor?: PermissionCheckedDocument | null } | null;
  players?: Array<{ id?: string }>;
  isOwner?: boolean;
};

type FoundryGameCombatLike = {
  combat?: CombatDocumentLike | null;
  combats?: CombatCollectionLike;
  modules?: {
    get?: (id: string) => { active?: boolean } | null | undefined;
  };
  user?: FoundryUserLike & { id?: string; isGM?: boolean };
};

export type CombatService = {
  buildViewModel: () => CombatViewModel;
  canEndTurn: (combatant: unknown, user: FoundryUserLike | null | undefined) => boolean;
  endTurn: () => Promise<boolean>;
};

export function createCombatService(): CombatService {
  return {
    buildViewModel: () => buildCombatViewModel(),
    canEndTurn,
    endTurn: () => endTurn()
  };
}

export function buildCombatViewModel(): CombatViewModel {
  const runtime = getFoundryRuntime();
  const game = runtime.game as FoundryGameCombatLike | undefined;
  const user = game?.user ?? null;
  const combat = getVisibleActiveCombat(game, user);
  const allCombatants = combat ? getCombatantsInOrder(combat) : [];
  const combatants = allCombatants.filter(combatant => isCombatantVisibleToUser(combatant, user));
  const activeCombatant = combat?.combatant ?? getActiveCombatantFromIndex(combat, allCombatants);
  const nextCombatant = combat?.nextCombatant ?? getNextCombatantFromIndex(combat, allCombatants);
  const activeIsHiddenForPlayer = Boolean(
    activeCombatant?.hidden
    && user
    && !isGmUser(user)
  );
  const displayActiveCombatant = activeIsHiddenForPlayer ? null : activeCombatant;
  const displayNextCombatant = activeIsHiddenForPlayer ? null : nextCombatant;
  const hasCombat = Boolean(combat);
  const isCombatActive = hasCombat && allCombatants.length > 0;
  const localUserTurn = isCombatActive && !isGmUser(user ?? {}) && canEndTurn(activeCombatant, user);
  const canEndTurnNow = isCombatActive && canEndTurn(activeCombatant, user);
  const round = getNumber(combat?.round) ?? null;
  const turn = getNumber(combat?.turn) ?? null;

  return {
    encounter: {
      id: combat?.id ?? "",
      name: getCombatEncounterName(combat),
      started: combat?.started === true,
      round,
      turn,
      roundLabel: round === null ? "-" : String(round),
      turnLabel: turn === null ? "-" : String(turn + 1),
      hasCombatants: combatants.length > 0
    },
    combatants: combatants.map(combatant => buildCombatantRow(combatant, displayActiveCombatant, displayNextCombatant)),
    hasCombat,
    localUserTurn,
    actions: {
      isCombatActive,
      canEndTurn: canEndTurnNow
    }
  };
}

export function canEndTurn(combatant: unknown, user: FoundryUserLike | null | undefined): boolean {
  const candidate = combatant as CombatantDocumentLike | null | undefined;
  if (!candidate || !user) return false;
  if (isGmUser(user)) return true;
  if (candidate.isOwner === true) return true;

  if (typeof candidate.testUserPermission === "function" && candidate.testUserPermission(user, "OWNER")) return true;
  if (typeof candidate.getUserLevel === "function" && (candidate.getUserLevel(user) ?? 0) >= 3) return true;

  const actor = candidate.actor ?? candidate.token?.actor ?? null;
  if (typeof actor?.testUserPermission === "function" && actor.testUserPermission(user, "OWNER")) return true;
  if (typeof actor?.getUserLevel === "function" && (actor.getUserLevel(user) ?? 0) >= 3) return true;

  const userId = getString(getObject(user)?.id);
  if (!userId) return false;
  return (candidate.players ?? []).some(player => getString(player.id) === userId);
}

function buildCombatantRow(
  combatant: CombatantDocumentLike,
  activeCombatant: CombatantDocumentLike | null | undefined,
  nextCombatant: CombatantDocumentLike | null | undefined
): CombatantRowViewModel {
  const rowName = getCombatantName(combatant);
  return {
    id: combatant.id ?? "",
    icon: combatant.img ?? null,
    iconText: getInitials(rowName || "Enemy", "E"),
    name: rowName,
    initiative: getNumber(combatant.initiative) ?? null,
    initiativeLabel: formatInitiativeLabel(combatant.initiative),
    isHostile: isHostileCombatant(combatant),
    isActive: Boolean(activeCombatant?.id && activeCombatant.id === combatant.id),
    isNext: Boolean(nextCombatant?.id && nextCombatant.id === combatant.id),
    hidden: combatant.hidden === true,
    defeated: combatant.defeated === true || combatant.isDefeated === true
  };
}

function getActiveCombat(game: FoundryGameCombatLike | undefined): CombatDocumentLike | null {
  if (game?.combat) return game.combat;
  const combats = getCollectionContents(game?.combats) as CombatDocumentLike[];
  return combats[0] ?? null;
}

/**
 * Returns the active combat only when the local user is allowed to view it.
 */
function getVisibleActiveCombat(
  game: FoundryGameCombatLike | undefined,
  user: FoundryUserLike | null | undefined
): CombatDocumentLike | null {
  const combat = getActiveCombat(game);
  if (!combat) return null;
  return isCombatVisibleToUser(combat, user, game) ? combat : null;
}

function getCombatantsInOrder(combat: CombatDocumentLike): CombatantDocumentLike[] {
  if (Array.isArray(combat.turns) && combat.turns.length > 0) return combat.turns;
  return getCollectionContents(combat.combatants) as CombatantDocumentLike[];
}

function getCombatEncounterName(combat: CombatDocumentLike | null): string {
  if (!combat) return "Encounter";
  const name = getString(combat.name);
  return name || "Encounter";
}

function getCombatantName(combatant: CombatantDocumentLike): string {
  const name = getString(combatant.name);
  return name || "Unknown Combatant";
}

function getActiveCombatantFromIndex(
  combat: CombatDocumentLike | null,
  combatants: CombatantDocumentLike[]
): CombatantDocumentLike | null {
  if (!combat || combatants.length === 0) return null;
  const turnIndex = getNumber(combat.turn);
  if (turnIndex === null || turnIndex < 0) return null;
  return combatants[turnIndex] ?? null;
}

function getNextCombatantFromIndex(
  combat: CombatDocumentLike | null,
  combatants: CombatantDocumentLike[]
): CombatantDocumentLike | null {
  if (!combat || combatants.length === 0) return null;
  const turnIndex = getNumber(combat.turn);
  if (turnIndex === null || turnIndex < 0) return combatants[0] ?? null;
  return combatants[(turnIndex + 1) % combatants.length] ?? null;
}

function isHostileCombatant(combatant: CombatantDocumentLike): boolean {
  const disposition = getNumber(combatant.disposition);
  return disposition !== null && disposition < 0;
}

function formatInitiativeLabel(value: unknown): string {
  const numeric = getNumber(value);
  return numeric === null ? "-" : String(numeric);
}

function isGmUser(user: FoundryUserLike): boolean {
  return getObject(user)?.isGM === true;
}

function isCombatVisibleToUser(
  combat: CombatDocumentLike,
  user: FoundryUserLike | null | undefined,
  game: FoundryGameCombatLike | undefined
): boolean {
  if (isGmUser(user ?? {})) return true;

  if (isEncounterVisibilityModuleActive(game)) {
    const moduleVisibility = getEncounterVisibilityFlag(combat);
    if (moduleVisibility !== null) return moduleVisibility;
  }

  return isFoundryCombatVisible(combat, user);
}

function isEncounterVisibilityModuleActive(game: FoundryGameCombatLike | undefined): boolean {
  return game?.modules?.get?.(ENCOUNTER_VISIBILITY_MODULE_ID)?.active === true;
}

function getEncounterVisibilityFlag(combat: CombatDocumentLike): boolean | null {
  const flag = combat.getFlag?.(ENCOUNTER_VISIBILITY_MODULE_ID, ENCOUNTER_VISIBILITY_FLAG_KEY);
  if (flag === true) return true;
  if (flag === false) return false;
  return null;
}

function isFoundryCombatVisible(combat: CombatDocumentLike, user: FoundryUserLike | null | undefined): boolean {
  if (combat.visible === true || combat.visible === false) return combat.visible;
  if (!user) return false;
  return canViewDocument(combat, user);
}

function isCombatantVisibleToUser(combatant: CombatantDocumentLike, user: FoundryUserLike | null | undefined): boolean {
  if (!combatant.hidden) return true;
  if (!user) return false;
  return isGmUser(user);
}

async function endTurn(): Promise<boolean> {
  const runtime = getFoundryRuntime();
  const game = runtime.game as FoundryGameCombatLike | undefined;
  const combat = getActiveCombat(game);
  const user = game?.user ?? null;
  const activeCombatant = combat?.combatant ?? getActiveCombatantFromIndex(combat ?? null, combat ? getCombatantsInOrder(combat) : []);
  if (!combat || !combat.nextTurn || !canEndTurn(activeCombatant, user)) return false;
  try {
    await combat.nextTurn();
    return true;
  } catch {
    return false;
  }
}
