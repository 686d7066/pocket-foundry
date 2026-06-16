import { getFoundryRuntime } from "../foundry-globals.ts";
import { createCombatService } from "../../services/combat.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { consumeShellActionEvent } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

export async function handleCombatClickAction(context: MobileShellActionContext, target: HTMLElement, event: Event): Promise<boolean> {
  const action = target.dataset.action;
  if (!action?.startsWith("combat-")) return false;
  consumeShellActionEvent(event);

  // Combat view now exposes only End Turn.
  if (action !== "combat-end-turn") return true;

  const game = getFoundryRuntime().game;
  const isCombatActive = Number(game?.combat?.turns?.length ?? 0) > 0;
  if (!isCombatActive) return true;

  const combatService = createCombatService();
  await combatService.endTurn();
  await renderShell(context.element, context.router, context.searchState);
  return true;
}
