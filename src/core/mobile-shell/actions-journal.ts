import { RouteView } from "../../router/routes.ts";
import type { MobileJournalService } from "../../services/journal.ts";
import { notifyJournalMutationUnavailable, rememberCurrentRouteScroll, runJournalControl } from "./controller-helpers-navigation.ts";
import { getJournalParentRoute, renderShell } from "./controller-helpers-shell.ts";
import { closeJournalPageDeleteDialog, closeJournalPageDraftDialog, consumeShellActionEvent, getJournalPageDraftFromForm, openJournalPageDeleteDialog, openJournalPageDraftDialog } from "./controller-helpers-ui.ts";
import type { MobileShellActionContext } from "./event-context.ts";

export async function handleJournalClickAction(context: MobileShellActionContext, target: HTMLElement, event: Event): Promise<boolean> {
  const { element, router, searchState } = context;

        if (target.dataset.action === "journal-open-entry") {
          consumeShellActionEvent(event);
          const entryUuid = target.dataset.entryUuid;
          if (!entryUuid) return true;

          rememberCurrentRouteScroll(element, router);
          void router.push({ view: RouteView.Journal, entryUuid }).then(() => renderShell(element, router, searchState));
          return true;
        }

        if (target.dataset.action === "journal-open-page") {
          consumeShellActionEvent(event);
          const entryUuid = target.dataset.entryUuid;
          const pageUuid = target.dataset.pageUuid;
          if (!entryUuid || !pageUuid) return true;

          rememberCurrentRouteScroll(element, router);
          void router.push({ view: RouteView.Journal, entryUuid, pageUuid, scrollTop: 0 }).then(() => renderShell(element, router, searchState));
          return true;
        }

        if (target.dataset.action === "journal-create-page") {
          consumeShellActionEvent(event);
          const entryUuid = target.dataset.entryUuid;
          if (!entryUuid) return true;

          openJournalPageDraftDialog(element, { mode: "create", entryUuid });
          return true;
        }

        if (target.dataset.action === "journal-delete-page") {
          consumeShellActionEvent(event);
          const entryUuid = target.dataset.entryUuid;
          const pageUuid = target.dataset.pageUuid;
          if (!entryUuid || !pageUuid) return true;

          openJournalPageDeleteDialog(element, entryUuid, pageUuid);
          return true;
        }

        if (target.dataset.action === "journal-close-delete-dialog") {
          consumeShellActionEvent(event);
          closeJournalPageDeleteDialog(element);
          return true;
        }

        if (target.dataset.action === "journal-confirm-delete-page") {
          consumeShellActionEvent(event);
          const dialog = target.closest<HTMLElement>("[data-confirm-dialog='journal-page-delete']");
          const entryUuid = dialog?.dataset.entryUuid;
          const pageUuid = dialog?.dataset.pageUuid;
          if (!entryUuid || !pageUuid) return true;

          closeJournalPageDeleteDialog(element);
          void runJournalControl(element, router, searchState, service => service.deletePage(pageUuid, entryUuid), { navigateToResult: true });
          return true;
        }

        if (target.dataset.action === "journal-edit-page") {
          consumeShellActionEvent(event);
          const entryUuid = target.dataset.entryUuid;
          const pageUuid = target.dataset.pageUuid;
          if (!entryUuid || !pageUuid) return true;

          void openJournalPageDraftDialog(element, { mode: "edit", entryUuid, pageUuid });
          return true;
        }

        if (target.dataset.action === "journal-close-page-dialog") {
          consumeShellActionEvent(event);
          closeJournalPageDraftDialog(element);
          return true;
        }

        if (target.dataset.action === "journal-save-page-draft") {
          consumeShellActionEvent(event);
          const form = target.closest<HTMLFormElement>("[data-journal-page-draft-form]");
          if (!form) return true;

          const entryUuid = form.dataset.entryUuid;
          const pageUuid = form.dataset.pageUuid;
          const draft = await getJournalPageDraftFromForm(form);
          if (!entryUuid || !draft) {
            notifyJournalMutationUnavailable(form.dataset.journalUploadFailed === "true" ? "upload-failed" : "invalid");
            delete form.dataset.journalUploadFailed;
            return true;
          }

          const control = pageUuid
            ? (service: MobileJournalService) => service.updatePageFromDraft(pageUuid, entryUuid, draft)
            : (service: MobileJournalService) => service.createPageFromDraft(entryUuid, draft);
          void runJournalControl(element, router, searchState, control, { navigateToResult: true }).then(() => closeJournalPageDraftDialog(element));
          return true;
        }

        if (target.dataset.action === "journal-up") {
          consumeShellActionEvent(event);
          const parentRoute = getJournalParentRoute(router.getCurrentRoute());
          if (!parentRoute) return true;

          rememberCurrentRouteScroll(element, router);
          void router.push(parentRoute).then(() => renderShell(element, router, searchState));
          return true;
        }

  return false;
}

