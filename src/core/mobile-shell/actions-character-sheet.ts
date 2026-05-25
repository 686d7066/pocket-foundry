import { RouteView, type MobileRoute } from "../../router/routes.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import {
    clearCharacterSheetTransientState,
    getCenteredDetailsWheelOption,
    getDetailsConfirmDelta,
    getDetailsRestActionData,
    rememberCurrentRouteScroll,
    runCharacterSheetAction,
    setDetailsSelectedDelta,
    setDetailsWheelValue,
    setNumberDialogOpen,
    updatePaneSearch
} from "./controller-helpers-navigation.ts";
import { notifyDocumentLinkUnavailable, resolveDocumentLinkRoute } from "./controller-helpers-search.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { closeFavoriteContextMenu, consumeShellActionEvent } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

export async function handleCharacterSheetClickAction(context: MobileShellActionContext, target: HTMLElement, event: Event): Promise<boolean> {
  const { element, router, searchState } = context;
  const action = target.dataset.action;
  const activeRoute = router.getCurrentRoute();
  if (!action || activeRoute.view !== RouteView.Character) return false;

  if (action === "pane-clear-search") {
    consumeShellActionEvent(event);
    const pane = getCharacterSheetAdapter().normalizePane(target.dataset.pane);
    await updatePaneSearch(element, router, searchState, pane, "");
    return true;
  }

  if (action.endsWith("-open-item") && target.dataset.itemUuid) {
    consumeShellActionEvent(event);
    rememberCurrentRouteScroll(element, router);
    const characterSheetAdapter = getCharacterSheetAdapter();
    const nextRoute = characterSheetAdapter.createOwnedDocumentRoute({
      actorUuid: activeRoute.actorUuid,
      documentUuid: target.dataset.itemUuid,
      parentPane: characterSheetAdapter.normalizePane(activeRoute.pane),
      scrollTop: 0
    });
    await router.push(nextRoute);
    await renderShell(element, router, searchState);
    return true;
  }

  if (action.endsWith("-open-source") && target.dataset.sourceUuid) {
    consumeShellActionEvent(event);
    rememberCurrentRouteScroll(element, router);
    const nextRoute: MobileRoute = {
      view: RouteView.DocumentDetail,
      documentUuid: target.dataset.sourceUuid,
      documentType: "unknown",
      ...(target.dataset.sourceName ? { source: target.dataset.sourceName } : {}),
      parentRoute: activeRoute
    };
    await router.push(nextRoute);
    await renderShell(element, router, searchState);
    return true;
  }

  if (action === "details-open-reference" && (target.dataset.referenceUuid || target.dataset.uuid)) {
    consumeShellActionEvent(event);
    const previousRoute = rememberCurrentRouteScroll(element, router);
    const nextRoute = await resolveDocumentLinkRoute(target.dataset.referenceUuid || target.dataset.uuid || "", previousRoute);
    if (!nextRoute) {
      notifyDocumentLinkUnavailable();
      return true;
    }

    await router.push(nextRoute);
    await renderShell(element, router, searchState);
    return true;
  }

  if (action.endsWith("-inspect")) {
    consumeShellActionEvent(event);
    const documentUuid = target.dataset.itemUuid ?? target.dataset.reference ?? target.dataset.favoriteId;
    if (!documentUuid) return true;

    rememberCurrentRouteScroll(element, router);
    const characterSheetAdapter = getCharacterSheetAdapter();
    const nextRoute: MobileRoute = target.dataset.itemUuid
      ? characterSheetAdapter.createOwnedDocumentRoute({
          actorUuid: activeRoute.actorUuid,
          documentUuid,
          parentPane: characterSheetAdapter.normalizePane(activeRoute.pane),
          scrollTop: 0
        })
      : {
          view: RouteView.DocumentDetail,
          documentUuid,
          documentType: "unknown",
          parentRoute: activeRoute
        };
    await router.push(nextRoute);
    await renderShell(element, router, searchState);
    return true;
  }

  if (action.endsWith("-open-number-dialog")) {
    consumeShellActionEvent(event);
    setNumberDialogOpen(element, target.dataset.dialogId, true);
    return true;
  }

  if (action === "inventory-open-currency-dialog") {
    consumeShellActionEvent(event);
    const dialogId = target.dataset.dialogId || "inventory-currency-dialog";
    setNumberDialogOpen(element, dialogId, true);

    const alignCurrencyWheels = (): void => {
      const dialog = element.querySelector<HTMLElement>(`#${CSS.escape(dialogId)}`);
      dialog?.querySelectorAll<HTMLElement>(".inventory-currency-trigger").forEach(trigger => {
        const initial = Number(trigger.dataset.currencyInitialValue ?? "0");
        const initialValue = Number.isFinite(initial) ? Math.max(0, Math.trunc(initial)) : 0;
        const normalized = 0;
        trigger.dataset.currencyValue = String(normalized);
        const valueLabel = trigger.querySelector<HTMLElement>("strong");
        if (valueLabel) valueLabel.textContent = String(initialValue);

        const wheel = trigger.querySelector<HTMLElement>(".spinner-wheel");
        if (!wheel) return;
        wheel.dataset.wheelMin = String(-initialValue);
        setDetailsWheelValue(wheel, normalized);
      });
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(() => alignCurrencyWheels());
      });
    } else {
      alignCurrencyWheels();
    }
    return true;
  }

  if (action === "inventory-select-currency") {
    consumeShellActionEvent(event);
    const wheel = target.closest<HTMLElement>(".spinner-wheel");
    if (!wheel) return true;

    wheel.querySelectorAll<HTMLElement>("button.selected").forEach(option => option.classList.remove("selected"));
    target.classList.add("selected");

    const trigger = wheel.closest<HTMLElement>(".inventory-currency-trigger");
    if (!trigger) return true;

    const selectedValue = Number(target.dataset.delta);
    if (!Number.isFinite(selectedValue)) return true;
    const normalized = Math.trunc(selectedValue);
    wheel.dataset.wheelValue = String(normalized);
    trigger.dataset.currencyValue = String(normalized);
    return true;
  }

  if (action === "inventory-apply-currency") {
    consumeShellActionEvent(event);
    const dialog = element.querySelector<HTMLElement>("#inventory-currency-dialog");
    if (!dialog) return true;

    const data: Record<string, string> = {};
    dialog.querySelectorAll<HTMLElement>(".inventory-currency-trigger[data-currency-id]").forEach(trigger => {
      const currencyId = trigger.dataset.currencyId;
      if (!currencyId) return;

      const wheel = trigger.querySelector<HTMLElement>(".spinner-wheel");
      const centered = wheel ? getCenteredDetailsWheelOption(wheel) : null;
      const selected = centered ?? wheel?.querySelector<HTMLElement>("button.selected");
      if (!selected) return;

      const selectedValue = Number(selected.dataset.delta);
      if (!Number.isFinite(selectedValue)) return;
      const normalized = Math.trunc(selectedValue);
      const initial = Number(trigger.dataset.currencyInitialValue ?? "0");
      const initialValue = Number.isFinite(initial) ? Math.max(0, Math.trunc(initial)) : 0;
      const nextValue = Math.max(0, initialValue + normalized);

      if (wheel) {
        wheel.querySelectorAll<HTMLElement>("button.selected").forEach(option => option.classList.remove("selected"));
        selected.classList.add("selected");
      }

      trigger.dataset.currencyValue = String(normalized);
      data[currencyId] = String(nextValue);
    });

    await runCharacterSheetAction(element, router, searchState, "inventory-confirm-currency", {
      data,
      closeDialogs: true
    });
    return true;
  }

  if (action === "portrait-open-dialog") {
    consumeShellActionEvent(event);
    setNumberDialogOpen(element, target.dataset.dialogId || "portrait-viewer-dialog", true);
    return true;
  }

  if (action === "details-open-dialog") {
    consumeShellActionEvent(event);
    const dialogId = target.dataset.dialog === "hp" ? "hp-spinner" : target.dataset.dialog === "temp" ? "temp-spinner" : undefined;
    setNumberDialogOpen(element, dialogId, true);
    return true;
  }

  if (action.endsWith("-close-number-dialog") || action.endsWith("-close-dialog")) {
    consumeShellActionEvent(event);
    setNumberDialogOpen(element, undefined, false);
    return true;
  }

  if (action.endsWith("-select-delta")) {
    consumeShellActionEvent(event);
    setDetailsSelectedDelta(target);
    return true;
  }

  if (action.endsWith("-confirm-rest")) {
    consumeShellActionEvent(event);
    const data = getDetailsRestActionData(target);
    await runCharacterSheetAction(element, router, searchState, action, {
      data,
      closeDialogs: true,
      onSuccess: () => {
        if (data.restType === "short") clearCharacterSheetTransientState(router);
      }
    });
    return true;
  }

  if (action.endsWith("-roll-hit-die")) {
    consumeShellActionEvent(event);
    const data = getActionDataset(target);
    if (!data.denomination) return true;

    await runCharacterSheetAction(element, router, searchState, action, {
      data,
      onSuccess: result => {
        if (result.data?.["shortRestRoll"] !== undefined) setNumberDialogOpen(element, `${getActionPrefix(action)}-short-rest-dialog`, true);
      }
    });
    return true;
  }

  if (action.endsWith("-rest") && target.dataset.restType) {
    consumeShellActionEvent(event);
    const restType = target.dataset.restType === "long" ? "long" : "short";
    if (restType === "short") clearCharacterSheetTransientState(router);
    setNumberDialogOpen(element, `${getActionPrefix(action)}-${restType}-rest-dialog`, true);
    return true;
  }

  if (action.includes("favorite") || action.includes("context")) {
    closeFavoriteContextMenu(element);
  }

  consumeShellActionEvent(event);
  const data = getActionDataset(target);
  const delta = getActionDelta(action, target);
  if (delta !== null) data.delta = String(delta);
  await runCharacterSheetAction(element, router, searchState, action, {
    data,
    closeDialogs: shouldCloseDialogsAfterAction(action)
  });
  return true;
}

function getActionDataset(target: HTMLElement): Record<string, string> {
  return Object.fromEntries(Object.entries(target.dataset).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function getActionDelta(action: string, target: HTMLElement): number | null {
  if (!action.includes("-confirm-") || !action.endsWith("-delta")) return null;
  const delta = getDetailsConfirmDelta(target);
  return Number.isFinite(delta) ? delta : null;
}

function getActionPrefix(action: string): string {
  return action.split("-", 1)[0] || "character";
}

function shouldCloseDialogsAfterAction(action: string): boolean {
  return action.includes("-confirm-")
    || action.includes("-use-")
    || action.endsWith("-use")
    || action.endsWith("-recharge")
    || action.includes("-favorite")
    || action.includes("-toggle-")
    || action.endsWith("-end-concentration");
}
