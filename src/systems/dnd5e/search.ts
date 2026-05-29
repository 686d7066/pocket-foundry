import type { CompendiumSearchCustomization, CompendiumSearchResultTypeContext, SearchResultType } from "../../services/search.ts";

// Maps dnd5e item subtypes to search filter labels while routing them as generic Items.
const DND5E_COMPENDIUM_ITEM_RESULT_TYPES: Readonly<Record<string, SearchResultType>> = {
  spell: "Spell"
};

export const DND5E_COMPENDIUM_SEARCH_CUSTOMIZATION: CompendiumSearchCustomization = {
  resultTypes: Object.values(DND5E_COMPENDIUM_ITEM_RESULT_TYPES),
  resolveResultType: getDnd5eCompendiumResultType
};

/**
 * Labels dnd5e item compendium entries that should appear as richer search
 * types while keeping their generic document type as Item for routing.
 */
function getDnd5eCompendiumResultType(context: CompendiumSearchResultTypeContext): SearchResultType | null {
  if (context.documentName !== "Item") return null;
  return DND5E_COMPENDIUM_ITEM_RESULT_TYPES[context.entryType] ?? null;
}
