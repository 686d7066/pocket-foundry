import { RouteView, type MobileRoute } from "./routes.ts";

/**
 * Returns a non-sensitive user-facing label for a route.
 */
export function getRouteLabel(route: MobileRoute): string {
  switch (route.view) {
    case RouteView.Characters:
      return "Characters";
    case RouteView.Combat:
      return "Encounter";
    case RouteView.Character:
      return route.pane ? `Character ${route.pane}` : "Character";
    case RouteView.OwnedDocument:
      return "Character Item";
    case RouteView.Journal:
      return route.pageUuid ? "Journal Page" : "Journal";
    case RouteView.Recents:
      return "Recents";
    case RouteView.Search:
      return "Search";
    case RouteView.Settings:
      return "Settings";
    case RouteView.DocumentDetail:
      return getDocumentTypeLabel(route.documentType);
  }
}

function getDocumentTypeLabel(documentType: Extract<MobileRoute, { view: RouteView.DocumentDetail }>["documentType"]): string {
  switch (documentType) {
    case "character":
      return "Character";
    case "item":
      return "Item";
    case "journal-entry":
      return "Journal Entry";
    case "journal-page":
      return "Journal Page";
    case "unknown":
      return "Document";
  }
}
