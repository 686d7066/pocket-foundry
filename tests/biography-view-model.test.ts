import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  buildDnd5eBiographyViewModel,
  type BiographyEnricher,
  type Dnd5eBiographyActor
} from "../src/systems/dnd5e/biography-view-model.ts";

const user = { id: "player" };

test("biography view model maps dnd5e identity, traits, appearance, and enriched backstory", async () => {
  const actor = createBiographyActor();
  const calls: Array<Parameters<BiographyEnricher>> = [];
  const model = await buildDnd5eBiographyViewModel({
    actor,
    user,
    enrichHtml: async (value, options) => {
      calls.push([value, options]);
      return `<p>Enriched ${value}</p><a class="content-link" data-uuid="JournalEntry.glass">Glass Gate</a>`;
    }
  });

  assert.equal(model.unavailable, false);
  if (model.unavailable) return;

  assert.deepEqual(model.identity.map(field => [field.id, field.label, field.value]), [
    ["alignment", "Alignment", "Chaotic Good"],
    ["eyes", "Eyes", "Grey"],
    ["height", "Height", "5 ft. 11 in."],
    ["hair", "Hair", "Black"],
    ["weight", "Weight", "168 lb."],
    ["gender", "Gender", "Man"],
    ["skin", "Skin", "Warm brown"],
    ["age", "Age", "27"]
  ]);
  assert.equal(model.identity.some(field => field.id === "faith"), false);
  assert.deepEqual(model.traits.map(trait => [trait.id, trait.label, trait.preview]), [
    ["ideal", "Ideals", "Knowledge must be used. Secrets are tools, not trophies."],
    ["trait", "Personality Traits", "Arlen is quietly intense, asks one question too many, and writes the answer down."],
    ["bond", "Bonds", "Professor Vael disappeared after studying the Glass Gate, and Arlen intends to find him."],
    ["flaw", "Flaws", "A closed door feels like a direct accusation."],
    ["appearance", "Appearance", "He wears a patched traveling coat and carries a weathered Book of Shadows."]
  ]);
  assert.match(model.backstoryHtml, /data-uuid="JournalEntry\.glass"/);
  assert.equal(model.hasBackstory, true);
  assert.equal(model.canUpdate, true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "<p>Arlen Mire was a junior archivist.</p>");
  assert.equal(calls[0]?.[1].secrets, true);
  assert.equal(calls[0]?.[1].relativeTo, actor);
  assert.deepEqual(calls[0]?.[1].rollData, { abilities: { cha: { mod: 3 } } });
});

test("biography view model requires observer permission before rendering", async () => {
  const hiddenActor = createBiographyActor({
    testUserPermission: () => false,
    getUserLevel: () => 0
  });

  assert.deepEqual(await buildDnd5eBiographyViewModel({ actor: hiddenActor, user }), {
    unavailable: true,
    title: "Biography Unavailable",
    body: "This biography is not available to the current user."
  });
});

test("biography enrichment hides secrets for non-owners and uses empty roll data fallback", async () => {
  const actor = createBiographyActor({ isOwner: false, getRollData: undefined });
  let enrichmentOptions: Parameters<BiographyEnricher>[1] | undefined;

  await buildDnd5eBiographyViewModel({
    actor,
    user,
    enrichHtml: async (_value, options) => {
      enrichmentOptions = options;
      return "";
    }
  });

  assert.equal(enrichmentOptions?.secrets, false);
  assert.deepEqual(enrichmentOptions?.rollData, {});
});

test("biography schema labels call Foundry localization with the i18n context", async () => {
  const previousGame = (globalThis as { game?: unknown }).game;
  const i18n = {
    translations: { "DND5E.Alignment": "Localized Alignment" },
    localize(this: { translations: Record<string, string> }, key: string) {
      return this.translations[key] ?? key;
    }
  };
  (globalThis as { game?: unknown }).game = { i18n };

  try {
    const actor = createBiographyActor({
      system: {
        ...createBiographyActor().system,
        schema: {
          fields: {
            details: {
              fields: {
                alignment: { label: "DND5E.Alignment" }
              }
            }
          }
        }
      }
    });
    const model = await buildDnd5eBiographyViewModel({ actor, user });

    assert.equal(model.unavailable, false);
    if (model.unavailable) return;
    assert.equal(model.identity.find(field => field.id === "alignment")?.label, "Localized Alignment");
  } finally {
    (globalThis as { game?: unknown }).game = previousGame;
  }
});

test("biography template, styles, and shell wiring preserve required regions and suppress play-mode edits", () => {
  const template = readFileSync(new URL("../src/systems/dnd5e/templates/biography.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const css = [
    readFileSync(new URL("../src/styles/pocket-foundry.css", import.meta.url), "utf8"),
    readFileSync(new URL("../src/systems/dnd5e/styles/pocket-foundry-dnd5e.css", import.meta.url), "utf8")
  ].join("\n");
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const searchSource = readFileSync(new URL("../src/core/mobile-shell/controller-helpers-search.ts", import.meta.url), "utf8");

  assert.match(actorShellTemplate, /class="mf-header actor-sheet-header"/);
  assert.match(actorShellTemplate, /railClass="pane-rail"/);
  assert.match(shellTemplate, /bottom-nav/);
  assert.match(template, /class="content sheet-dense biography-pane"/);
  assert.match(template, /class="bio-grid"/);
  assert.match(template, /class="bio-field"/);
  assert.match(template, /class="bio-copy"/);
  assert.match(template, /class="section sheet-group biography-identity-section"/);
  assert.match(template, /class="section-heading sheet-group-heading biography-section-heading"/);
  assert.match(template, /class="sheet-group-body biography-identity-body"/);
  assert.match(template, /class="section sheet-group biography-trait-card"/);
  assert.match(template, /class="section sheet-group biography-backstory"/);
  assert.match(template, /class="sheet-group-body biography-backstory-body"/);
  assert.match(template, /class="reader bio-backstory-content"/);
  assert.match(template, /<h2>Backstory<\/h2>/);
  assert.match(template, /data-biography-links/);
  assert.match(moduleSource, /getTemplatePaths/);
  assert.match(searchSource, /handleBiographyDocumentLinkClick/);
  assert.match(searchSource, /\.biography-pane a\[data-uuid\]/);
  assert.match(searchSource, /createDocumentLookupService/);
  assert.match(searchSource, /router\.push\(nextRoute\)/);
  assert.match(css, /\.pocket-foundry-root \.bio-grid/);
  assert.match(css, /\.pocket-foundry-root \.bio-field/);
  assert.match(css, /\.pocket-foundry-root \.bio-copy/);
  assert.match(css, /\.pocket-foundry-root \.sheet-group-body/);
  assert.match(css, /\.pocket-foundry-root \.biography-backstory/);
  assert.match(css, /\.pocket-foundry-root \.bio-backstory-content/);
  assert.doesNotMatch(template, /sub-rail|biography-mode-rail|data-action="create"|data-action="delete"|data-action="edit"|Open Sheet|prose-mirror|textarea|<input/);
});

function createBiographyActor(overrides: Partial<Dnd5eBiographyActor> = {}): Dnd5eBiographyActor {
  return {
    uuid: "Actor.arlen",
    id: "arlen",
    type: "character",
    name: "Arlen Mire",
    isOwner: true,
    system: {
      schema: {
        fields: {
          details: {
            fields: {
              alignment: { label: "Alignment" },
              eyes: { label: "Eyes" },
              height: { label: "Height" },
              faith: { label: "Faith" },
              hair: { label: "Hair" },
              weight: { label: "Weight" },
              gender: { label: "Gender" },
              skin: { label: "Skin" },
              age: { label: "Age" }
            }
          }
        }
      },
      details: {
        alignment: "Chaotic Good",
        eyes: "Grey",
        height: "5 ft. 11 in.",
        faith: "",
        hair: "Black",
        weight: "168 lb.",
        gender: "Man",
        skin: "Warm brown",
        age: "27",
        ideal: "Knowledge must be used. Secrets are tools, not trophies.",
        trait: "Arlen is quietly intense, asks one question too many, and writes the answer down.",
        bond: "Professor Vael disappeared after studying the Glass Gate, and Arlen intends to find him.",
        flaw: "A closed door feels like a direct accusation.",
        appearance: "He wears a patched traveling coat and carries a weathered Book of Shadows.",
        biography: {
          value: "<p>Arlen Mire was a junior archivist.</p>"
        }
      }
    },
    getRollData: () => ({ abilities: { cha: { mod: 3 } } }),
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    ...overrides
  };
}

