import assert from "node:assert/strict";
import { test } from "vitest";
import { demoteRollActionLinks } from "../services/rich-text-enrichment.ts";

test("demoteRollActionLinks de-links fixtureSystem-reference content links", () => {
  const input = "<enriched-content enricher=\"fixtureSystem-reference\"><span class=\"reference-link\"><a class=\"content-link\" draggable=\"true\" aria-label=\"Rule Page\" data-link=\"\" data-uuid=\"Compendium.fixtureSystem.content24.JournalEntry.phbAppendixDRule.JournalEntryPage.8R5SMbAGbECNgO8z\" data-id=\"8R5SMbAGbECNgO8z\" data-type=\"JournalEntryPage\" data-pack=\"fixtureSystem.content24\" data-tooltip=\"\"><i class=\"fa-solid fa-book-open\" inert=\"\"></i>Insight</a></span></enriched-content>";
  const output = demoteRollActionLinks(input);

  assert.match(output, /Insight/);
  assert.doesNotMatch(output, /<a\b/i);
  assert.match(output, /<span class="inline-roll-text">Insight<\/span>/);
});
