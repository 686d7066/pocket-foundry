import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const readSource = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("item tables and content lists opt into shared sizing while Details keeps its original layout", () => {
  const templates = [
    "systems/dnd5e/templates/inventory.hbs",
    "systems/dnd5e/templates/partials/inventory-list-row.hbs",
    "systems/dnd5e/templates/features.hbs",
    "systems/dnd5e/templates/spells.hbs",
    "systems/dnd5e/templates/effects.hbs",
    "systems/dnd5e/templates/partials/favorites-group.hbs",
  ];
  for (const path of templates) {
    const source = readSource(path);
    const tables = [...source.matchAll(/<div class="[^"]*(?:sheet-table sheet-list|content-table content-list|detail-table (?:skills-table|tool-table))[^"]*"[^>]*>/g)];
    assert.ok(tables.length, `No tables checked in ${path}`);
    for (const [table] of tables) assert.match(table, /data-table-layout="[^"]+"/, path);
  }
  const containerRow = readSource("systems/dnd5e/templates/partials/inventory-list-row.hbs");
  const details = readSource("systems/dnd5e/templates/details.hbs");
  assert.doesNotMatch(details, /data-table-layout/);
  assert.match(details, /class="detail-table skills-table"/);
  assert.match(details, /class="detail-table tool-table"/);
  assert.match(containerRow, /class="inventory-children">/);
  assert.match(containerRow, /\{\{#each childTables\}\}[\s\S]*partials\/table-head\.hbs[\s\S]*\{\{#each items\}\}/);
  assert.match(readSource("systems/dnd5e/templates/features.hbs"), /data-panel-grid/);
});
test("abbreviated inventory headers retain full accessible and hover labels", () => {
  const template = readSource("systems/dnd5e/templates/partials/table-head.hbs");
  assert.match(template, /title="\{\{label\}\}" aria-label="\{\{label\}\}"/);
  assert.match(template, /\{\{#if shortLabel\}\}\{\{shortLabel\}\}\{\{else\}\}\{\{label\}\}\{\{\/if\}\}/);
  assert.doesNotMatch(template, /aria-hidden="true"/);
});
