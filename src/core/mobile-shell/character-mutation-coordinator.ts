import { localize } from "../localization.ts";
import type { CharacterSheetActionResult } from "../../systems/character-sheet-adapter.ts";
import { reportShellActionDiagnostic } from "./controller-helpers-ui.ts";

export type CharacterMutationStatusKind = "idle" | "saving" | "saved" | "completed" | "failed" | "disconnected" | "recovering";

export type CharacterMutationStatus = {
  kind: CharacterMutationStatusKind;
  message: string;
  actorUuid?: string;
};

export type CharacterMutationRunResult = {
  started: boolean;
  current: boolean;
  result: CharacterSheetActionResult;
};

type PendingMutation = {
  id: number;
  actorUuid: string;
  connectionEpoch: number;
  retired: boolean;
};

export type CharacterMutationCoordinator = {
  run(options: {
    actorUuid: string;
    label: string;
    operation: () => Promise<CharacterSheetActionResult> | CharacterSheetActionResult;
    isCurrent: () => boolean;
  }): Promise<CharacterMutationRunResult>;
  isPending(actorUuid: string): boolean;
  isBlocked(actorUuid: string): boolean;
  markDisconnected(): void;
  markConnected(): void;
  markResumeRequired(): void;
  beginRecovery(actorUuid?: string, connectionResume?: boolean): void;
  completeRecovery(actorUuid: string | undefined, successful: boolean): void;
  setReconcileHandler(handler: (actorUuid: string) => void): void;
  syncStatus(): void;
  getStatus(): CharacterMutationStatus;
  dispose(): void;
};

const coordinators = new WeakMap<HTMLElement, CharacterMutationCoordinator>();
const actorExecutionLeases = new Map<string, PendingMutation>();
const actorsRequiringRecovery = new Set<string>();
const actorsWithUncertainOutcome = new Set<string>();
const reconcileHandlers = new Set<(actorUuid: string) => void>();

/** Returns the mutation coordinator owned by one mounted shell root. */
export function getCharacterMutationCoordinator(element: HTMLElement): CharacterMutationCoordinator {
  const existing = coordinators.get(element);
  if (existing) return existing;
  const created = createCharacterMutationCoordinator(element);
  coordinators.set(element, created);
  return created;
}

/** Disposes transient mutation state owned by a retired shell root. */
export function disposeCharacterMutationCoordinator(element: HTMLElement): void {
  coordinators.get(element)?.dispose();
  coordinators.delete(element);
}

/** Creates an actor-wide, no-queue mutation guard for one shell root. */
export function createCharacterMutationCoordinator(element: HTMLElement): CharacterMutationCoordinator {
  const ownedMutations = new Set<PendingMutation>();
  let connectionEpoch = 0;
  let nextOperationId = 0;
  let connected = true;
  let disconnected = false;
  let recoveryEpoch = 0;
  let connectionGapOpen = false;
  const recoveredActorEpochs = new Map<string, number>();
  const recoveringActors = new Set<string>();
  let disposed = false;
  let reconcileHandler: ((actorUuid: string) => void) | undefined;
  let status: CharacterMutationStatus = { kind: "idle", message: "" };
  let globalStatus: CharacterMutationStatus = status;
  const actorStatuses = new Map<string, CharacterMutationStatus>();

  /** Publishes state without replacing the surrounding shell or current inputs. */
  function publish(next: CharacterMutationStatus): void {
    if (disposed) return;
    status = next;
    if (next.actorUuid) actorStatuses.set(next.actorUuid, next);
    else globalStatus = next;
    syncStatus();
  }

  function syncStatus(): void {
    const actorSheet = element.querySelector?.<HTMLElement>("[data-region='actor-sheet-shell']");
    const activeActorUuid = actorSheet?.dataset.actorUuid;
    const activeActorStatus = activeActorUuid ? actorStatuses.get(activeActorUuid) : undefined;
    const visibleStatus = globalStatus.kind === "disconnected"
      ? globalStatus
      : activeActorStatus?.kind === "failed"
        ? activeActorStatus
      : activeActorUuid && actorNeedsRecovery(activeActorUuid)
        ? {
            kind: "recovering" as const,
            message: localize("POCKETFOUNDRY.Character.Status.Recovering", "Reconnected. Refreshing the character…"),
            actorUuid: activeActorUuid
          }
      : activeActorUuid
        ? activeActorStatus ?? globalStatus
        : status;
    const node = element.querySelector?.<HTMLElement>("[data-character-mutation-status]");
    if (node) {
      node.hidden = visibleStatus.kind === "idle";
      node.dataset.state = visibleStatus.kind;
      node.textContent = visibleStatus.message;
    }
    const busy = visibleStatus.kind === "saving" || visibleStatus.kind === "recovering";
    actorSheet?.querySelectorAll?.<HTMLElement>(
      ".actor-sheet-header, .pane-rail, [data-region='actor-pane-content'], [data-region='limited-character-view']"
    ).forEach(region => region.setAttribute("aria-busy", busy ? "true" : "false"));
  }

  async function run(options: {
    actorUuid: string;
    label: string;
    operation: () => Promise<CharacterSheetActionResult> | CharacterSheetActionResult;
    isCurrent: () => boolean;
  }): Promise<CharacterMutationRunResult> {
    if (disposed || actorExecutionLeases.has(options.actorUuid) || !connected || actorNeedsRecovery(options.actorUuid)
      || recoveringActors.has(options.actorUuid) || actorsRequiringRecovery.has(options.actorUuid)) {
      return { started: false, current: false, result: { ok: false, reason: "busy", failure: "rejected" } };
    }

    const mutation: PendingMutation = {
      id: ++nextOperationId,
      actorUuid: options.actorUuid,
      connectionEpoch,
      retired: false
    };
    actorExecutionLeases.set(options.actorUuid, mutation);
    ownedMutations.add(mutation);
    publish({
      kind: "saving",
      message: localize("POCKETFOUNDRY.Character.Status.Saving", "Saving {label}…", { label: options.label }),
      actorUuid: options.actorUuid
    });

    let result: CharacterSheetActionResult;
    try {
      result = await options.operation();
    } catch (error) {
      reportShellActionDiagnostic(error, { action: `character mutation (${options.label})` });
      result = { ok: false, reason: "failed", failure: "uncertain", retry: "review" };
    }

    const ownsLease = actorExecutionLeases.get(options.actorUuid)?.id === mutation.id;
    if (ownsLease) actorExecutionLeases.delete(options.actorUuid);
    ownedMutations.delete(mutation);
    const current = !disposed && ownsLease && !mutation.retired
      && mutation.connectionEpoch === connectionEpoch && options.isCurrent();
    if (result.failure === "uncertain") actorsWithUncertainOutcome.add(options.actorUuid);

    if (mutation.retired || mutation.connectionEpoch !== connectionEpoch) {
      actorsRequiringRecovery.add(options.actorUuid);
      actorsWithUncertainOutcome.add(options.actorUuid);
      for (const handler of reconcileHandlers) handler(options.actorUuid);
      return {
        started: true,
        current: false,
        result: { ...result, ok: false, failure: "uncertain", retry: "review" }
      };
    }

    if (actorsRequiringRecovery.has(options.actorUuid) || !options.isCurrent()) {
      actorsRequiringRecovery.add(options.actorUuid);
      for (const handler of reconcileHandlers) handler(options.actorUuid);
      return { started: true, current: false, result };
    }

    if (result.failure === "uncertain") {
      actorsRequiringRecovery.add(options.actorUuid);
      publish({
        kind: "failed",
        message: localize("POCKETFOUNDRY.Character.Status.Uncertain", "The save result is uncertain. Review the refreshed character before trying again."),
        actorUuid: options.actorUuid
      });
      for (const handler of reconcileHandlers) handler(options.actorUuid);
      return { started: true, current: false, result: { ...result, retry: "review" } };
    }

    if (!current) return { started: true, current: false, result };

    if (result.ok) {
      actorsWithUncertainOutcome.delete(options.actorUuid);
      publish(result.changed === false
        ? {
            kind: "completed",
            message: localize("POCKETFOUNDRY.Character.Status.Completed", "Action completed; no character changes."),
            actorUuid: options.actorUuid
          }
        : { kind: "saved", message: localize("POCKETFOUNDRY.Character.Status.Saved", "Saved"), actorUuid: options.actorUuid });
    } else {
      actorsWithUncertainOutcome.delete(options.actorUuid);
      publish({
        kind: "failed",
        message: localize("POCKETFOUNDRY.Character.Status.Failed", "Save failed. Your input was kept; try again."),
        actorUuid: options.actorUuid
      });
    }
    return {
      started: true,
      current: true,
      result: result.ok ? result : { failure: "rejected", retry: "safe", ...result }
    };
  }

  function actorNeedsRecovery(actorUuid: string): boolean {
    return (recoveredActorEpochs.get(actorUuid) ?? 0) < recoveryEpoch;
  }

  return {
    run,
    isPending: actorUuid => actorExecutionLeases.has(actorUuid),
    isBlocked: actorUuid => !connected || actorNeedsRecovery(actorUuid) || recoveringActors.has(actorUuid)
      || actorExecutionLeases.has(actorUuid) || actorsRequiringRecovery.has(actorUuid),
    markDisconnected: () => {
      if (disposed) return;
      connected = false;
      disconnected = true;
      connectionGapOpen = true;
      recoveryEpoch += 1;
      recoveringActors.clear();
      connectionEpoch += 1;
      for (const mutation of ownedMutations) {
        mutation.retired = true;
        actorsRequiringRecovery.add(mutation.actorUuid);
        actorsWithUncertainOutcome.add(mutation.actorUuid);
      }
      publish({
        kind: "disconnected",
        message: localize("POCKETFOUNDRY.Character.Status.Disconnected", "Disconnected. Character changes cannot be saved.")
      });
    },
    markConnected: () => {
      if (disposed) return;
      connected = true;
      if (!disconnected) return;
      disconnected = false;
      publish({
        kind: "recovering",
        message: localize("POCKETFOUNDRY.Character.Status.Recovering", "Reconnected. Refreshing the character…")
      });
    },
    markResumeRequired: () => {
      if (disposed) return;
      connected = true;
      disconnected = false;
      if (!connectionGapOpen) recoveryEpoch += 1;
      connectionGapOpen = false;
      globalStatus = { kind: "idle", message: "" };
      status = globalStatus;
      syncStatus();
    },
    beginRecovery: (actorUuid, connectionResume = false) => {
      if (disposed) return;
      connected = true;
      disconnected = false;
      if (connectionResume && !connectionGapOpen) recoveryEpoch += 1;
      connectionGapOpen = false;
      if (actorUuid) recoveringActors.add(actorUuid);
      if (actorUuid) actorsRequiringRecovery.add(actorUuid);
      globalStatus = { kind: "idle", message: "" };
      publish({
        kind: "recovering",
        message: (actorUuid ? actorExecutionLeases.has(actorUuid) : ownedMutations.size > 0)
          ? localize("POCKETFOUNDRY.Character.Status.RecoveringPending", "Reconnected. Checking Foundry while the previous save finishes…")
          : localize("POCKETFOUNDRY.Character.Status.Recovering", "Reconnected. Refreshing the character…"),
        ...(actorUuid ? { actorUuid } : {})
      });
    },
    completeRecovery: (actorUuid, successful) => {
      if (disposed) return;
      if (!successful) {
        if (actorUuid) recoveringActors.delete(actorUuid);
        if (actorUuid) actorsRequiringRecovery.add(actorUuid);
        publish({
          kind: "failed",
          message: localize("POCKETFOUNDRY.Character.Status.RecoveryFailed", "The character could not be refreshed. Reconnect before making another change."),
          ...(actorUuid ? { actorUuid } : {})
        });
        return;
      }
      if (actorUuid && !actorExecutionLeases.has(actorUuid)) {
        actorsRequiringRecovery.delete(actorUuid);
        recoveredActorEpochs.set(actorUuid, recoveryEpoch);
      }
      const actorRecovering = Boolean(actorUuid && (actorExecutionLeases.has(actorUuid)
        || actorsRequiringRecovery.has(actorUuid) || actorNeedsRecovery(actorUuid)));
      if (actorUuid && !actorRecovering) recoveringActors.delete(actorUuid);
      publish(actorRecovering
        ? {
            kind: "recovering",
            message: localize("POCKETFOUNDRY.Character.Status.RecoveringPending", "Reconnected. Checking Foundry while the previous save finishes…"),
            ...(actorUuid ? { actorUuid } : {})
          }
        : actorsWithUncertainOutcome.has(actorUuid ?? "")
          ? {
              kind: "failed",
              message: localize("POCKETFOUNDRY.Character.Status.Uncertain", "The save result is uncertain. Review the refreshed character before trying again."),
              ...(actorUuid ? { actorUuid } : {})
            }
          : {
            kind: "saved",
            message: localize("POCKETFOUNDRY.Character.Status.Current", "Connected. Character data is current."),
            ...(actorUuid ? { actorUuid } : {})
          });
    },
    setReconcileHandler: handler => {
      if (reconcileHandler) reconcileHandlers.delete(reconcileHandler);
      reconcileHandler = handler;
      reconcileHandlers.add(handler);
    },
    syncStatus,
    getStatus: () => status,
    dispose: () => {
      disposed = true;
      for (const mutation of ownedMutations) mutation.retired = true;
      ownedMutations.clear();
      recoveredActorEpochs.clear();
      recoveringActors.clear();
      actorStatuses.clear();
      if (reconcileHandler) reconcileHandlers.delete(reconcileHandler);
      reconcileHandler = undefined;
      status = { kind: "idle", message: "" };
    }
  };
}
