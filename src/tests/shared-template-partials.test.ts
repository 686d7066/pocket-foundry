import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("shared partials expose reusable parameterized hooks", () => {
  const contentListRowTemplate = readFileSync(new URL("../templates/partials/content-list-row.hbs", import.meta.url), "utf8");
  const expandableDetailRowTemplate = readFileSync(new URL("../templates/partials/expandable-detail-row.hbs", import.meta.url), "utf8");
  const favoriteContextMenuTemplate = readFileSync(new URL("../templates/partials/favorite-context-menu.hbs", import.meta.url), "utf8");
  const favoriteBasicGroupTemplate = readFileSync(new URL("../templates/partials/favorite-basic-group.hbs", import.meta.url), "utf8");
  const numberAdjustDialogTemplate = readFileSync(new URL("../templates/partials/number-adjust-dialog.hbs", import.meta.url), "utf8");
  const numberWheelTemplate = readFileSync(new URL("../templates/partials/number-wheel.hbs", import.meta.url), "utf8");
  const paneSearchTemplate = readFileSync(new URL("../templates/partials/pane-search-toolbar.hbs", import.meta.url), "utf8");
  const paneUnavailableTemplate = readFileSync(new URL("../templates/partials/pane-unavailable.hbs", import.meta.url), "utf8");
  const settingsToggleTemplate = readFileSync(new URL("../templates/partials/settings-toggle-row.hbs", import.meta.url), "utf8");

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
  assert.match(favoriteBasicGroupTemplate, /addAction=addAction/);
  assert.match(favoriteBasicGroupTemplate, /removeAction=removeAction/);
  assert.match(favoriteBasicGroupTemplate, /favoriteType=type/);
  assert.match(favoriteBasicGroupTemplate, /favoriteId=id/);

  assert.match(numberAdjustDialogTemplate, /dialogIdPrefix/);
  assert.match(numberAdjustDialogTemplate, /dialogItemId/);
  assert.match(numberAdjustDialogTemplate, /dialogAdjustmentId/);
  assert.match(numberAdjustDialogTemplate, /confirmActionPrefix/);
  assert.match(numberAdjustDialogTemplate, /confirmActionMiddle/);
  assert.match(numberAdjustDialogTemplate, /confirmItemId/);
  assert.match(numberAdjustDialogTemplate, /partials\/number-wheel\.hbs/);
  assert.match(numberWheelTemplate, /centerZeroLabel/);
  assert.match(numberAdjustDialogTemplate, /closeAriaLabel/);
  assert.match(numberAdjustDialogTemplate, /cancelLabel/);
  assert.match(numberAdjustDialogTemplate, /confirmLabel/);

  assert.match(paneSearchTemplate, /data-pane-search-input="\{\{pane\}\}"/);
  assert.match(paneSearchTemplate, /data-pane="\{\{pane\}\}"/);
  assert.match(paneSearchTemplate, /#unless canClear/);

  assert.match(paneUnavailableTemplate, /data-region="\{\{region\}\}"/);
  assert.match(settingsToggleTemplate, /data-action="\{\{action\}\}"/);
});

test("shared partials are preloaded and used by core templates", () => {
  const moduleSource = readFileSync(new URL("../module.ts", import.meta.url), "utf8");
  const shellTemplate = readFileSync(new URL("../templates/shell.hbs", import.meta.url), "utf8");
  const settingsTemplate = readFileSync(new URL("../templates/settings.hbs", import.meta.url), "utf8");
  const actorShellTemplate = readFileSync(new URL("../templates/actor-sheet-shell.hbs", import.meta.url), "utf8");
  const journalTemplate = readFileSync(new URL("../templates/journal.hbs", import.meta.url), "utf8");
  const recentsTemplate = readFileSync(new URL("../templates/recents.hbs", import.meta.url), "utf8");
  const favoritesTemplate = readFileSync(new URL("../templates/favorites.hbs", import.meta.url), "utf8");
  const favoriteBasicGroupTemplate = readFileSync(new URL("../templates/partials/favorite-basic-group.hbs", import.meta.url), "utf8");

  assert.match(moduleSource, /partials\/content-list-row\.hbs/);
  assert.match(moduleSource, /partials\/expandable-detail-row\.hbs/);
  assert.match(moduleSource, /partials\/favorite-basic-group\.hbs/);
  assert.match(moduleSource, /partials\/favorite-context-menu\.hbs/);
  assert.match(moduleSource, /partials\/number-adjust-dialog\.hbs/);
  assert.match(moduleSource, /partials\/number-wheel\.hbs/);
  assert.match(moduleSource, /partials\/pane-search-toolbar\.hbs/);
  assert.match(moduleSource, /partials\/pane-unavailable\.hbs/);
  assert.match(moduleSource, /partials\/settings-toggle-row\.hbs/);

  assert.match(shellTemplate, /partials\/settings-toggle-row\.hbs/);
  assert.match(settingsTemplate, /partials\/settings-toggle-row\.hbs/);
  assert.match(actorShellTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(journalTemplate, /partials\/content-list-row\.hbs/);
  assert.match(recentsTemplate, /partials\/content-list-row\.hbs/);

  assert.match(favoritesTemplate, /partials\/pane-unavailable\.hbs/);
  assert.match(favoritesTemplate, /partials\/favorite-basic-group\.hbs/);
  assert.match(favoriteBasicGroupTemplate, /partials\/favorite-context-menu\.hbs/);

});
