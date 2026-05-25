import { getObject, getString } from "../../core/utils.ts";
import { canUpdateDocument, canViewDocument, type FoundryUserLike, type PermissionCheckedDocument } from "../../services/permissions.ts";
import { demoteRollActionLinks } from "../../services/rich-text-enrichment.ts";

export type Dnd5eBiographyActor = PermissionCheckedDocument & {
  uuid?: string;
  id?: string;
  type?: string;
  name?: string;
  isOwner?: boolean;
  system?: {
    details?: Record<string, unknown> & {
      biography?: {
        value?: string;
      };
    };
    schema?: {
      fields?: {
        details?: {
          fields?: Record<string, { label?: string }>;
        };
      };
    };
  };
  getRollData?: () => Record<string, unknown>;
};

export type BiographyEnricher = (
  value: string,
  options: {
    secrets: boolean;
    relativeTo: Dnd5eBiographyActor;
    rollData: Record<string, unknown>;
  }
) => Promise<string>;

export type BiographyIdentityFieldViewModel = {
  id: string;
  name: string;
  label: string;
  value: string;
};

export type BiographyTraitCardViewModel = {
  id: string;
  name: string;
  label: string;
  icon: string;
  text: string;
  preview: string;
  empty: boolean;
};

export type Dnd5eBiographyViewModel = {
  unavailable: false;
  actorUuid: string;
  canUpdate: boolean;
  identity: BiographyIdentityFieldViewModel[];
  traits: BiographyTraitCardViewModel[];
  hasIdentity: boolean;
  hasTraits: boolean;
  backstoryHtml: string;
  hasBackstory: boolean;
};

export type UnavailableDnd5eBiographyViewModel = {
  unavailable: true;
  title: "Biography Unavailable";
  body: "This biography is not available to the current user.";
};

export type Dnd5eBiographyModel = Dnd5eBiographyViewModel | UnavailableDnd5eBiographyViewModel;

const IDENTITY_FIELDS = ["alignment", "eyes", "height", "faith", "hair", "weight", "gender", "skin", "age"] as const;
const IDENTITY_FALLBACK_LABELS: Record<(typeof IDENTITY_FIELDS)[number], string> = {
  alignment: "Alignment",
  eyes: "Eyes",
  height: "Height",
  faith: "Faith",
  hair: "Hair",
  weight: "Weight",
  gender: "Gender",
  skin: "Skin",
  age: "Age"
};

const TRAIT_FIELDS = [
  { id: "ideal", label: "Ideals", icon: "fa-solid fa-seedling" },
  { id: "trait", label: "Personality Traits", icon: "fa-solid fa-puzzle-piece" },
  { id: "bond", label: "Bonds", icon: "fa-solid fa-link" },
  { id: "flaw", label: "Flaws", icon: "fa-solid fa-heart-crack" },
  { id: "appearance", label: "Appearance", icon: "fa-solid fa-image-portrait" }
] as const;

export async function buildDnd5eBiographyViewModel(options: {
  actor: Dnd5eBiographyActor | null | undefined;
  user: FoundryUserLike;
  enrichHtml?: BiographyEnricher;
}): Promise<Dnd5eBiographyModel> {
  const actor = options.actor;
  if (!actor || actor.type !== "character" || !canViewDocument(actor, options.user)) {
    return {
      unavailable: true,
      title: "Biography Unavailable",
      body: "This biography is not available to the current user."
    };
  }

  const details = getDetails(actor);
  const biographyValue = getString(getObject(details.biography)?.value);
  const backstoryHtml = await enrichBiography(actor, biographyValue, options.enrichHtml);
  const identity = buildIdentityFields(actor, details);
  const traits = buildTraitCards(details);

  return {
    unavailable: false,
    actorUuid: actor.uuid ?? (actor.id ? `Actor.${actor.id}` : ""),
    canUpdate: canUpdateDocument(actor, options.user),
    identity,
    traits,
    hasIdentity: identity.length > 0,
    hasTraits: traits.some(trait => !trait.empty),
    backstoryHtml,
    hasBackstory: stripHtml(backstoryHtml).trim().length > 0
  };
}

function buildIdentityFields(actor: Dnd5eBiographyActor, details: Record<string, unknown>): BiographyIdentityFieldViewModel[] {
  return IDENTITY_FIELDS.map(id => {
    const value = getString(details[id]);
    return {
      id,
      name: `system.details.${id}`,
      label: getSchemaLabel(actor, id) || IDENTITY_FALLBACK_LABELS[id],
      value
    };
  }).filter(field => field.value.length > 0);
}

function buildTraitCards(details: Record<string, unknown>): BiographyTraitCardViewModel[] {
  return TRAIT_FIELDS.map(field => {
    const text = getString(details[field.id]);
    return {
      id: field.id,
      name: `system.details.${field.id}`,
      label: field.label,
      icon: field.icon,
      text,
      preview: createPreview(text),
      empty: text.length === 0
    };
  }).filter(field => !field.empty);
}

async function enrichBiography(actor: Dnd5eBiographyActor, biographyValue: string, enrichHtml?: BiographyEnricher): Promise<string> {
  const enrich = enrichHtml ?? getFoundryTextEnricher();
  if (!enrich || !biographyValue) return biographyValue;

  const enriched = await enrich(biographyValue, {
    secrets: actor.isOwner === true,
    relativeTo: actor,
    rollData: actor.getRollData?.() ?? {}
  });
  return demoteRollActionLinks(enriched);
}

function getFoundryTextEnricher(): BiographyEnricher | undefined {
  const textEditor = (globalThis as { TextEditor?: { enrichHTML?: BiographyEnricher } }).TextEditor;
  return typeof textEditor?.enrichHTML === "function" ? textEditor.enrichHTML.bind(textEditor) : undefined;
}

function getDetails(actor: Dnd5eBiographyActor): Record<string, unknown> {
  return getObject(actor.system?.details) ?? {};
}

function getSchemaLabel(actor: Dnd5eBiographyActor, field: string): string {
  const label = getString(actor.system?.schema?.fields?.details?.fields?.[field]?.label);
  return localizeLabel(label);
}

function localizeLabel(label: string): string {
  if (!label) return "";
  const i18n = (globalThis as { game?: { i18n?: { localize?: (key: string) => string } } }).game?.i18n;
  return typeof i18n?.localize === "function" ? i18n.localize(label) : label.replace(/^DND5E\./, "");
}

function createPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}
