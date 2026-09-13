import { localize, localizeSystemKey } from "../../core/localization.ts";
import { getNumber, getObject } from "../../core/utils.ts";
import type {
  CharacterPickerPresentation,
  CharacterSheetNavigationActor
} from "../character-sheet-adapter.ts";
import { getCharacterSummary, getClassSummary } from "./actor-sheet-navigation.ts";

/**
 * Identifies dnd5e player-character actors for the shared character picker.
 */
export function isDnd5eCharacterPickerActor(actor: CharacterSheetNavigationActor): boolean {
  return actor.type === "character";
}

/**
 * Builds dnd5e-specific picker text and compact statistics for an observable actor.
 */
export function buildDnd5eCharacterPickerPresentation(actor: CharacterSheetNavigationActor): CharacterPickerPresentation {
  const summary = getCharacterSummary(actor);
  const classSummary = getClassSummary(actor);
  const attributes = getObject(actor.system?.attributes);
  const hp = getObject(attributes?.hp);
  const ac = getObject(attributes?.ac);
  const initiative = getObject(attributes?.init);
  const hpValue = getNumber(hp?.value);
  const hpMax = getNumber(hp?.max);
  const acValue = getNumber(ac?.value);
  const initiativeValue = getNumber(initiative?.total) ?? getNumber(initiative?.mod) ?? getNumber(initiative?.value);
  const chips: CharacterPickerPresentation["chips"] = [];

  if (hpValue !== null || hpMax !== null) {
    chips.push({
      id: "hp",
      label: localizeSystemKey("DND5E.HitPoints", "HP"),
      value: `${hpValue ?? "-"}${hpMax === null ? "" : `/${hpMax}`}`
    });
  }
  if (acValue !== null) {
    chips.push({ id: "ac", label: localizeSystemKey("DND5E.ArmorClass", "AC"), value: String(acValue) });
  }
  if (initiativeValue !== null) {
    chips.push({ id: "initiative", label: localizeSystemKey("DND5E.InitiativeAbbr", "Init"), value: formatSignedNumber(initiativeValue) });
  }

  return {
    typeLabel: localize("POCKETFOUNDRY.Document.Character", "Character"),
    summary,
    subtitle: classSummary || summary || localize("POCKETFOUNDRY.Document.Character", "Character"),
    headerStats: [
      { id: "ac", label: localizeSystemKey("DND5E.ArmorClass", "AC"), value: acValue === null ? "-" : String(acValue) },
      {
        id: "hp",
        label: localizeSystemKey("DND5E.HitPoints", "HP"),
        value: hpValue === null && hpMax === null ? "-/-" : `${hpValue ?? "-"}/${hpMax ?? "-"}`
      }
    ],
    chips
  };
}

/** Formats a modifier with an explicit plus sign for non-negative values. */
function formatSignedNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
