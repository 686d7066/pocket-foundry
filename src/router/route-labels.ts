import { localize } from "../core/localization.ts";
import { RouteView, type MobileRoute } from "./routes.ts";

/**
 * Returns a non-sensitive user-facing label for a route.
 */
export function getRouteLabel(route: MobileRoute): string {
  switch (route.view) {
    case RouteView.Characters:
      return localize("POCKETFOUNDRY.Route.Characters", "Characters");
    case RouteView.Combat:
      return localize("POCKETFOUNDRY.Route.Encounter", "Encounter");
    case RouteView.Character:
      return route.pane ? localize("POCKETFOUNDRY.Route.CharacterPane", "Character {pane}", { pane: route.pane }) : localize("POCKETFOUNDRY.Document.Character", "Character");
    case RouteView.OwnedDocument:
      return localize("POCKETFOUNDRY.Route.CharacterItem", "Character Item");
    case RouteView.Journal:
      return route.pageUuid ? localize("POCKETFOUNDRY.Document.JournalPage", "Journal Page") : localize("POCKETFOUNDRY.Route.Journal", "Journal");
    case RouteView.Recents:
      return localize("POCKETFOUNDRY.Recents.Title", "Recents");
    case RouteView.Search:
      return localize("POCKETFOUNDRY.Route.Search", "Search");
    case RouteView.Settings:
      return localize("POCKETFOUNDRY.Settings.Title", "Settings");
    case RouteView.DocumentDetail:
      return getDocumentTypeLabel(route.documentType);
  }
}

function getDocumentTypeLabel(documentType: Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"]): string {
  switch (documentType) {
    case "character":
      return localize("POCKETFOUNDRY.Document.Character", "Character");
    case "item":
      return localize("POCKETFOUNDRY.Document.Item", "Item");
    case "journal-entry":
      return localize("POCKETFOUNDRY.Document.JournalEntry", "Journal Entry");
    case "journal-page":
      return localize("POCKETFOUNDRY.Document.JournalPage", "Journal Page");
    case "unknown":
      return localize("POCKETFOUNDRY.Document.Generic", "Document");
  }
}
