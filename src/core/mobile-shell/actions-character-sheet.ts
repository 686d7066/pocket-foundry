import { RouteView, type MobileRoute } from "../../router/routes.ts";
import { getCharacterSheetAdapter } from "../../systems/character-sheet-adapter-registry.ts";
import {
    clearCharacterSheetTransientState,
    getNumberDialogConfirmDelta,
    getCenteredNumberWheelOption,
    rememberCurrentRouteScroll,
    runCharacterSheetAction,
    setNumberWheelSelectedDelta,
    setNumberWheelValue,
    setNumberDialogOpen,
    updatePaneSearch
} from "./controller-helpers-navigation.ts";
import { notifyDocumentLinkUnavailable, resolveDocumentLinkRoute } from "./controller-helpers-search.ts";
import { renderShell } from "./controller-helpers-shell.ts";
import { closeFavoriteContextMenu, consumeShellActionEvent, openConfirmationDialog } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

/**
 * Routes character-sheet click actions through generic shell behavior first and
 * then through the active system adapter. Wheel clicks center the chosen value
 * so confirmation and scroll selection agree with the explicit selection.
 */
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

  if (action === "document-open-reference" && (target.dataset.referenceUuid || target.dataset.uuid)) {
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

  if (action === "portrait-open-dialog") {
    consumeShellActionEvent(event);
    setNumberDialogOpen(element, target.dataset.dialogId || "portrait-viewer-dialog", true);
    return true;
  }

  if (action.endsWith("-close-number-dialog") || action.endsWith("-close-dialog")) {
    consumeShellActionEvent(event);
    setNumberDialogOpen(element, undefined, false);
    return true;
  }

  if (action.endsWith("-select-delta")) {
    consumeShellActionEvent(event);
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    setNumberWheelSelectedDelta(target);
    return true;
  }

  const characterSheetAdapter = getCharacterSheetAdapter();
  const handledByAdapter = await characterSheetAdapter.handleShellAction?.({
    element,
    target,
    event,
    action,
    route: activeRoute,
    helpers: {
      openFormDialog: title => openConfirmationDialog(element, {
        id: "adapter-form", title, body: "", confirmLabel: "", confirmAction: "", cancelAction: ""
      }),
      setDialogOpen: (dialogId, open) => setNumberDialogOpen(element, dialogId, open),
      setNumberWheelValue,
      getCenteredNumberWheelOption,
      setSelectedNumberDelta: setNumberWheelSelectedDelta,
      runAction: (actionName, options) => runCharacterSheetAction(element, router, searchState, actionName, options),
      clearTransientState: () => clearCharacterSheetTransientState(router),
      closeFavoriteContextMenu: () => closeFavoriteContextMenu(element)
    }
  });
  if (handledByAdapter) return true;

  if (event.defaultPrevented) {
    return true;
  }

  consumeShellActionEvent(event);
  const data = getActionDataset(target);
  const delta = getActionDelta(action, target);
  if (delta !== null) data.delta = String(delta);
  await runCharacterSheetAction(element, router, searchState, action, {
    data,
    closeDialogs: shouldCloseGenericDialogsAfterAction(action) || getCharacterSheetAdapter().shouldCloseDialogsAfterAction?.(action) === true
  });
  return true;
}

function getActionDataset(target: HTMLElement): Record<string, string> {
  return Object.fromEntries(Object.entries(target.dataset).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function getActionDelta(action: string, target: HTMLElement): number | null {
  if (!action.includes("-confirm-") || !action.endsWith("-delta")) return null;
  const delta = getNumberDialogConfirmDelta(target);
  return Number.isFinite(delta) ? delta : null;
}

function shouldCloseGenericDialogsAfterAction(action: string): boolean {
  return action.includes("-confirm-");
}
