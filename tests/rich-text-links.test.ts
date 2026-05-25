import assert from "node:assert/strict";
import { test } from "vitest";
import { summarizeRichTextWithReferences } from "../src/services/rich-text-links.ts";

test("rich text summary extracts fallback UUID references without an enricher", async () => {
  const summary = await summarizeRichTextWithReferences(
    "Craft: @UUID[Compendium.dnd5e.equipment24.Item.phbtrdHerbalism]{Herbalism Kit}"
  );

  assert.equal(summary.text.includes("@UUID["), false);
  assert.deepEqual(summary.references, [
    { uuid: "Compendium.dnd5e.equipment24.Item.phbtrdHerbalism", label: "Herbalism Kit" }
  ]);
});

test("rich text summary prefers data-uuid anchors produced by enrichHTML", async () => {
  const summary = await summarizeRichTextWithReferences("raw", {
    enrichHtml: async () => "Use <a class=\"content-link\" data-uuid=\"JournalEntry.rule.Page.test\">Rule Link</a> now."
  });

  assert.equal(summary.text, "Use Rule Link now.");
  assert.deepEqual(summary.references, [
    { uuid: "JournalEntry.rule.Page.test", label: "Rule Link" }
  ]);
});

