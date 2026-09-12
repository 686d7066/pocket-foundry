import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { allocateTableColumns } from "../src/core/mobile-shell/table-layout.ts";

const readSource = (path: string): string => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("shared table schemas reserve spare width for names and size metadata to content", () => {
  const css = readSource("styles/pocket-foundry.css");
  assert.match(css, /--pf-list-title: minmax\(0,1fr\)/);
  assert.match(css, /--pf-list-meta: fit-content\(16%\)/);
  for (const schema of ["icon-title-3meta-actions", "icon-title-2meta-actions", "icon-title-4meta-actions", "icon-title-source-actions", "indicator-meta-title-2meta", "indicator-meta-title-meta", "title-5meta"]) {
    const declaration = css.match(new RegExp(`\\[data-table-layout="${schema}"\\] \\{ ([^}]+) \\}`))?.[1];
    assert.ok(declaration, `Missing shared schema: ${schema}`);
    assert.match(declaration, /var\(--pf-list-title\)/);
    assert.match(declaration, /var\(--pf-list-meta\)/);
    assert.doesNotMatch(declaration, /\dfr|\dpx \dpx/);
  }
  assert.doesNotMatch(css, /subgrid/);
  assert.match(css, /grid-template-columns: var\(--pf-table-columns, var\(--pf-list-cols\)\)/);
  const headerRule = css.slice(css.lastIndexOf(".pocket-foundry-root .content-list-head > *"));
  assert.match(headerRule, /white-space: normal/);
  assert.match(headerRule, /overflow-wrap: anywhere/);
  assert.match(headerRule, /text-overflow: clip/);
});

test("all table views and favorites opt into the shared column layout", () => {
  const templates = [
    "systems/dnd5e/templates/inventory.hbs",
    "systems/dnd5e/templates/partials/inventory-list-row.hbs",
    "systems/dnd5e/templates/features.hbs",
    "systems/dnd5e/templates/spells.hbs",
    "systems/dnd5e/templates/effects.hbs",
    "systems/dnd5e/templates/details.hbs",
    "systems/dnd5e/templates/partials/favorites-group.hbs",
    "templates/journal.hbs",
    "templates/journal-entry.hbs",
    "templates/recents.hbs"
  ];
  for (const path of templates) {
    const source = readSource(path);
    const tables = [...source.matchAll(/<div class="[^"]*(?:sheet-table sheet-list|content-table content-list|detail-table (?:skills-table|tool-table))[^"]*"[^>]*>/g)];
    assert.ok(tables.length, `No tables checked in ${path}`);
    for (const [table] of tables) assert.match(table, /data-table-layout="[^"]+"/, path);
  }
  const containerRow = readSource("systems/dnd5e/templates/partials/inventory-list-row.hbs");
  assert.match(containerRow, /class="inventory-children">/);
  assert.match(containerRow, /\{\{#each childTables\}\}[\s\S]*partials\/table-head\.hbs[\s\S]*\{\{#each items\}\}/);
  assert.match(readSource("systems/dnd5e/templates/features.hbs"), /data-panel-grid/);
  assert.match(readSource("styles/pocket-foundry.css"), /minmax\(min\(100%,var\(--pf-panel-min-width,320px\)\),1fr\)/);
});

test("abbreviated inventory headers retain full accessible and hover labels", () => {
  const template = readSource("systems/dnd5e/templates/partials/table-head.hbs");
  assert.match(template, /title="\{\{label\}\}" aria-label="\{\{label\}\}"/);
  assert.match(template, /\{\{#if shortLabel\}\}\{\{shortLabel\}\}\{\{else\}\}\{\{label\}\}\{\{\/if\}\}/);
  assert.doesNotMatch(template, /aria-hidden="true"/);
});

test("additional table width goes entirely to names when metadata fits", () => {
  const preferred = [30, 300, 19, 22, 44, 44];
  const narrow = allocateTableColumns(400, 8, preferred, 1, [0, 5]);
  const wide = allocateTableColumns(600, 8, preferred, 1, [0, 5]);
  assert.deepEqual(narrow, [30, 201, 19, 22, 44, 44]);
  assert.deepEqual(wide, [30, 401, 19, 22, 44, 44]);
});

test("narrow tables wrap long metadata without allocating width beyond the available space", () => {
  const columns = allocateTableColumns(280, 6, [30, 400, 200, 100, 150, 44], 1, [0, 5]);
  assert.equal(columns[0], 30);
  assert.equal(columns[5], 44);
  assert.ok(columns[1] >= 80);
  assert.ok(Math.abs(columns.reduce((sum, value) => sum + value, 0) + 30 - 280) < .001);
});

test("ordinary row grids retain native disclosure boxes", () => {
  const css = readSource("styles/pocket-foundry.css");
  assert.doesNotMatch(css, /subgrid|::details-content/);
  assert.match(css, /expandable-detail-drawer \{ display: block; min-width: 0; \}/);
  const sharedRows = css.slice(css.indexOf("/* Explicit shared tracks"));
  assert.match(sharedRows, /column-gap: var\(--pf-table-gap\)/);
  assert.doesNotMatch(sharedRows, /column-gap: inherit/);
  assert.match(readSource("core/mobile-shell/table-layout.ts"), /getPropertyValue\("--pf-table-gap"\)/);
});
