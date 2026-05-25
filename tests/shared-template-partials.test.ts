import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("shared partials are preloaded and used by core and dnd5e templates", () => {
  const moduleSource = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../src/templates/shell.hbs", import.meta.url), "utf8");
  const settingsTemplate = readFileSync(new URL("../src/templates/settings.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../src/templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const journalTemplate = readFileSync(new URL("../src/templates/journal.hbs", import.meta.url), "utf8");
  const recentsTemplate = readFileSync(new URL("../src/templates/recents.hbs", import.meta.url), "utf8");
  const detailsTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/details.hbs", import.meta.url), "utf8");
  const inventoryTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/inventory.hbs", import.meta.url), "utf8");
  const biographyTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/biography.hbs", import.meta.url), "utf8");
  const favoritesTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/favorites.hbs", import.meta.url), "utf8");
  const spellsTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/spells.hbs", import.meta.url), "utf8");
  const featuresTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/features.hbs", import.meta.url), "utf8");
  const effectsTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/effects.hbs", import.meta.url), "utf8");
  const featureRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/feature-row.hbs", import.meta.url), "utf8");
  const spellRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/spell-row.hbs", import.meta.url), "utf8");
  const inventoryRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/inventory-list-row.hbs", import.meta.url), "utf8");
  const skillRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/details-skill-row.hbs", import.meta.url), "utf8");
  const toolRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/details-tool-row.hbs", import.meta.url), "utf8");
  const effectRowTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/effect-row.hbs", import.meta.url), "utf8");

  assert.match(moduleSource, /partials\/content-list-row\.hbs/);
  assert.match(moduleSource, /partials\/expandable-detail-row\.hbs/);
  assert.match(moduleSource, /partials\/favorite-context-menu\.hbs/);
  assert.match(moduleSource, /partials\/number-adjust-dialog\.hbs/);
  assert.match(moduleSource, /partials\/pane-search-toolbar\.hbs/);
  assert.match(moduleSource, /partials\/pane-unavailable\.hbs/);
  assert.match(moduleSource, /partials\/settings-toggle-row\.hbs/);

  assert.match(shellTemplate, /partials\/settings-toggle-row\.hbs/);
  assert.match(settingsTemplate, /partials\/settings-toggle-row\.hbs/);
  assert.match(actorShellTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(actorShellTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(journalTemplate, /partials\/content-list-row\.hbs/);
  assert.match(recentsTemplate, /partials\/content-list-row\.hbs/);

  assert.match(detailsTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(inventoryTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(biographyTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(favoritesTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(spellsTemplate, /partials\/pane-search-toolbar\.hbs/);
  assert.match(featuresTemplate, /partials\/pane-search-toolbar\.hbs/);
  assert.match(effectsTemplate, /partials\/pane-search-toolbar\.hbs/);

  assert.doesNotMatch(featureRowTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(featureRowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(featureRowTemplate, /partials\/favorite-context-menu\.hbs/);
  assert.match(spellRowTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(spellRowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(spellRowTemplate, /partials\/favorite-context-menu\.hbs/);
  assert.match(inventoryRowTemplate, /partials\/number-adjust-dialog\.hbs/);
  assert.match(inventoryRowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(inventoryRowTemplate, /partials\/favorite-context-menu\.hbs/);
  assert.match(skillRowTemplate, /partials\/favorite-context-menu\.hbs/);
  assert.match(toolRowTemplate, /partials\/favorite-context-menu\.hbs/);
  assert.match(effectRowTemplate, /partials\/expandable-detail-row\.hbs/);
  assert.match(effectRowTemplate, /partials\/favorite-context-menu\.hbs/);
});

test("shared partials expose reusable parameterized hooks", () => {
  const contentListRowTemplate = readFileSync(new URL("../src/templates/partials/content-list-row.hbs", import.meta.url), "utf8");
  const expandableDetailRowTemplate = readFileSync(new URL("../src/templates/partials/expandable-detail-row.hbs", import.meta.url), "utf8");
  const favoriteContextMenuTemplate = readFileSync(new URL("../src/templates/partials/favorite-context-menu.hbs", import.meta.url), "utf8");
  const numberAdjustDialogTemplate = readFileSync(new URL("../src/templates/partials/number-adjust-dialog.hbs", import.meta.url), "utf8");
  const paneSearchTemplate = readFileSync(new URL("../src/templates/partials/pane-search-toolbar.hbs", import.meta.url), "utf8");
  const paneUnavailableTemplate = readFileSync(new URL("../src/templates/partials/pane-unavailable.hbs", import.meta.url), "utf8");
  const settingsToggleTemplate = readFileSync(new URL("../src/templates/partials/settings-toggle-row.hbs", import.meta.url), "utf8");

  assert.match(contentListRowTemplate, /rowClassExtra/);
  assert.match(contentListRowTemplate, /data-action="\{\{action\}\}"/);
  assert.match(contentListRowTemplate, /data-recent-id="\{\{recentId\}\}"/);
  assert.match(contentListRowTemplate, /data-entry-uuid="\{\{entryUuid\}\}"/);
  assert.match(contentListRowTemplate, /data-page-uuid="\{\{pageUuid\}\}"/);
  assert.match(contentListRowTemplate, /hasValue/);

  assert.match(expandableDetailRowTemplate, /drawerClass/);
  assert.match(expandableDetailRowTemplate, /summaryClass/);
  assert.match(expandableDetailRowTemplate, /bodyClass/);
  assert.match(expandableDetailRowTemplate, /\{\{> summary\}\}/);
  assert.match(expandableDetailRowTemplate, /\{\{> body\}\}/);

  assert.match(favoriteContextMenuTemplate, /data-action="\{\{removeAction\}\}"/);
  assert.match(favoriteContextMenuTemplate, /data-action="\{\{addAction\}\}"/);
  assert.match(favoriteContextMenuTemplate, /data-favorite-type="\{\{favoriteType\}\}"/);
  assert.match(favoriteContextMenuTemplate, /data-favorite-id="\{\{favoriteId\}\}"/);
  assert.match(favoriteContextMenuTemplate, /data-item-id="\{\{itemId\}\}"/);

  assert.match(numberAdjustDialogTemplate, /dialogIdPrefix/);
  assert.match(numberAdjustDialogTemplate, /dialogItemId/);
  assert.match(numberAdjustDialogTemplate, /dialogAdjustmentId/);
  assert.match(numberAdjustDialogTemplate, /confirmActionPrefix/);
  assert.match(numberAdjustDialogTemplate, /confirmActionMiddle/);
  assert.match(numberAdjustDialogTemplate, /confirmItemId/);
  assert.match(numberAdjustDialogTemplate, /centerZeroLabel/);
  assert.match(numberAdjustDialogTemplate, /closeAriaLabel/);
  assert.match(numberAdjustDialogTemplate, /cancelLabel/);
  assert.match(numberAdjustDialogTemplate, /confirmLabel/);

  assert.match(paneSearchTemplate, /data-pane-search-input="\{\{pane\}\}"/);
  assert.match(paneSearchTemplate, /data-pane="\{\{pane\}\}"/);
  assert.match(paneSearchTemplate, /#unless canClear/);

  assert.match(paneUnavailableTemplate, /data-region="\{\{region\}\}"/);
  assert.match(settingsToggleTemplate, /data-action="\{\{action\}\}"/);
});

