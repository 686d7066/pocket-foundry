import { canUpdateDocument, canViewDocument, type FoundryUserLike } from "../../../services/permissions.ts";
import { getFoundryRuntime } from "../../../core/foundry-globals.ts";
import { getObject, getNumber } from "../../../core/utils.ts";
import { enrichSectionRows } from "../../../services/rich-text-enrichment.ts";
import { isGmUser } from "../view-model-helpers.ts";
import { buildSpellcastingCards, buildSpellSections, filterSpellSections } from "./builders.ts";
import {
  canPrepareSpell,
  canUpdateOwnedSpell,
  clampNumber,
  findActivity,
  findOwnedSpell,
  isPrepared,
  getRemainingUses,
  getSpellItems,
  getUsableActivities,
  normalizeConfig,
  normalizeSearchQuery
} from "./format.ts";
import type {
  Dnd5eSpellItem,
  Dnd5eSpellsActor,
  Dnd5eSpellsConfig,
  Dnd5eSpellsControlResult,
  Dnd5eSpellsModel,
  Dnd5eSpellSlotTrackViewModel
} from "./types.ts";

export async function buildDnd5eSpellsViewModel(options: {
  actor: Dnd5eSpellsActor | null | undefined;
  user: FoundryUserLike;
  config?: Dnd5eSpellsConfig;
  searchQuery?: string;
}): Promise<Dnd5eSpellsModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Spells Unavailable",
      body: "These spells are not available to the current user."
    };
  }

  const config = normalizeConfig(options.config);
  const canUpdate = canUpdateDocument(actor, options.user);
  const allSpells = getSpellItems(actor, options.user);
  const searchQuery = normalizeSearchQuery(options.searchQuery);
  const textEditor = getFoundryRuntime().TextEditor;
  const enrichHTML = textEditor?.enrichHTML;
  const sectionsInput = filterSpellSections(buildSpellSections(actor, allSpells, config, canUpdate), searchQuery);
  const sections = typeof enrichHTML === "function"
    ? await enrichSectionRows(sectionsInput, {
        getRows: section => section.spells,
        setRows: (section, spells) => ({ ...section, spells }),
        documents: allSpells,
        enrichHtml: enrichHTML.bind(textEditor),
        secrets: isGmUser(options.user)
      })
    : sectionsInput;
  const slotTracks = sections.map(section => section.slotTrack).filter((track): track is Dnd5eSpellSlotTrackViewModel => track !== null);

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate,
    searchQuery,
    canClearSearch: searchQuery.length > 0,
    spellcasting: buildSpellcastingCards(actor, config, canUpdate),
    slotTracks,
    sections
  };
}

export function getNextSpellSlotValue(current: number, selectedPip: number): number {
  return current === selectedPip ? Math.max(selectedPip - 1, 0) : Math.max(selectedPip, 0);
}

export async function toggleSpellSlotPip(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  slotId: string,
  pip: number
): Promise<Dnd5eSpellsControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (typeof actor.update !== "function") return { ok: false, reason: "unsupported" };

  const spells = getObject(getObject(actor.system)?.spells);
  const slot = getObject(spells?.[slotId]);
  if (!slot) return { ok: false, reason: "unavailable" };
  const current = getNumber(slot.value) ?? 0;
  await actor.update({ [`system.spells.${slotId}.value`]: getNextSpellSlotValue(current, pip) });
  return { ok: true };
}

export async function useSpellItem(actor: Dnd5eSpellsActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedSpell(actor, item, user)) return { ok: false, reason: "forbidden" };
  if (typeof item.use !== "function") return { ok: false, reason: "unsupported" };

  const activities = getUsableActivities(item);
  if (activities.length > 1) return { ok: false, reason: "unsupported" };
  await item.use(undefined, { options: { sheet: null } });
  return { ok: true };
}

export async function useSpellActivity(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  activityId: string
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  const activity = item ? findActivity(item, activityId) : null;
  if (!actor || !item || !activity) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedSpell(actor, item, user)) return { ok: false, reason: "forbidden" };
  if (activity.canUse === false || typeof activity.use !== "function") return { ok: false, reason: "unsupported" };

  await activity.use(undefined, { options: { sheet: null } });
  return { ok: true };
}

export async function toggleSpellPrepared(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  config?: Dnd5eSpellsConfig
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const normalizedConfig = normalizeConfig(config);
  if (!canPrepareSpell(item, normalizedConfig, canUpdateOwnedSpell(actor, item, user))) return { ok: false, reason: canUpdateOwnedSpell(actor, item, user) ? "unsupported" : "forbidden" };
  return updateOwnedSpell(actor, user, itemId, { "system.prepared": !isPrepared(item) });
}

export async function adjustSpellRemainingUses(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  delta: number
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };

  const current = getNumber(uses?.value) ?? getRemainingUses(uses) ?? max;
  return setSpellRemainingUses(actor, user, itemId, current + delta);
}

export async function setSpellRemainingUses(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  remainingUses: number
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!item) return { ok: false, reason: "unavailable" };
  const uses = getObject(getObject(item.system)?.uses);
  const max = getNumber(uses?.max);
  if (max === null) return { ok: false, reason: "unsupported" };
  return updateOwnedSpell(actor, user, itemId, { "system.uses.spent": max - clampNumber(Math.trunc(remainingUses), 0, max) });
}

export async function rechargeSpell(actor: Dnd5eSpellsActor | null | undefined, user: FoundryUserLike, itemId: string): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedSpell(actor, item, user)) return { ok: false, reason: "forbidden" };

  const uses = getObject(getObject(item.system)?.uses);
  const rollRecharge = uses?.rollRecharge;
  if (item.hasRecharge !== true || typeof rollRecharge !== "function") return { ok: false, reason: "unsupported" };

  await (rollRecharge as (options: { apply: boolean }) => Promise<unknown>).call(uses, { apply: true });
  return { ok: true };
}

export async function setSpellcastingAbility(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  ability: string
): Promise<Dnd5eSpellsControlResult> {
  if (!actor) return { ok: false, reason: "unavailable" };
  if (!canUpdateDocument(actor, user)) return { ok: false, reason: "forbidden" };
  if (!ability || typeof actor.update !== "function") return { ok: false, reason: "unsupported" };

  await actor.update({ "system.attributes.spellcasting": ability });
  return { ok: true };
}

export async function setSpellFavorite(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  favorite: boolean
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedSpell(actor, item, user)) return { ok: false, reason: "forbidden" };

  const system = getObject(actor.system);
  const action = favorite ? system?.addFavorite : system?.removeFavorite;
  if (typeof action !== "function") return { ok: false, reason: "unsupported" };

  await (action as (target: Dnd5eSpellItem | string) => Promise<unknown>).call(system, item);
  return { ok: true };
}

async function updateOwnedSpell(
  actor: Dnd5eSpellsActor | null | undefined,
  user: FoundryUserLike,
  itemId: string,
  update: Record<string, unknown>
): Promise<Dnd5eSpellsControlResult> {
  const item = findOwnedSpell(actor, user, itemId);
  if (!actor || !item) return { ok: false, reason: "unavailable" };
  if (!canUpdateOwnedSpell(actor, item, user)) return { ok: false, reason: "forbidden" };

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
