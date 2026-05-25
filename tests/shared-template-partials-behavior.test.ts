import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

function readTemplate(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("fillable blips partial wires all parameters into update and read-only branches", () => {
  const template = readTemplate("src/templates/partials/fillable-blips.hbs");

  assert.match(template, /class="fillable-blips \{\{#if \(eq direction "rtl"\)\}\}rtl\{\{else\}\}ltr\{\{\/if\}\} color-\{\{color\}\}"/);
  assert.match(template, /data-blip-count="\{\{count\}\}"/);
  assert.match(template, /data-blip-direction="\{\{direction\}\}"/);
  assert.match(template, /data-blip-fill-mode="\{\{fillMode\}\}"/);
  assert.match(template, /data-blip-color="\{\{color\}\}"/);

  assert.match(template, /\{\{#if \.\.\/canUpdate\}\}/);
  assert.match(template, /aria-label="\{\{#if ariaLabel\}\}\{\{ariaLabel\}\}\{\{else\}\}\{\{#if \.\.\/ariaLabel\}\}\{\{\.\.\/ariaLabel\}\} \{\{value\}\}\/\{\{\.\.\/count\}\}\{\{\/if\}\}\{\{\/if\}\}"/);
  assert.match(template, /data-action="\{\{\.\.\/action\}\}"/);
  assert.match(template, /data-blip-kind="\{\{\.\.\/kind\}\}"/);
  assert.match(template, /data-pip-value="\{\{value\}\}"/);
  assert.match(template, /data-pip-active="\{\{#if active\}\}true\{\{else\}\}false\{\{\/if\}\}"/);
  assert.match(template, /data-fill-mode="\{\{\.\.\/fillMode\}\}"/);
  assert.match(template, /data-blip-count="\{\{\.\.\/count\}\}"/);
  assert.match(template, /data-blip-direction="\{\{\.\.\/direction\}\}"/);
  assert.match(template, /data-blip-color="\{\{\.\.\/color\}\}"/);

  assert.match(template, /\{\{else\}\}\s*<span class="pip \{\{#if active\}\}active\{\{\/if\}\}" aria-hidden="true"><\/span>/);
});

test("number adjust dialog partial supports id, aria, description, and confirm action fallback branches", () => {
  const template = readTemplate("src/templates/partials/number-adjust-dialog.hbs");

  assert.match(template, /id="\{\{#if dialogId\}\}\{\{dialogId\}\}\{\{else\}\}\{\{dialogIdPrefix\}\}\{\{dialogItemId\}\}\{\{dialogIdMiddle\}\}\{\{dialogAdjustmentId\}\}\{\{dialogIdSuffix\}\}\{\{\/if\}\}"/);
  assert.match(template, /aria-label="\{\{#if dialogAriaLabel\}\}\{\{dialogAriaLabel\}\}\{\{else\}\}\{\{title\}\}\{\{#if dialogAriaLabelName\}\} for \{\{dialogAriaLabelName\}\}\{\{\/if\}\}\{\{\/if\}\}"/);
  assert.match(template, /aria-label="\{\{#if closeAriaLabel\}\}\{\{closeAriaLabel\}\}\{\{else\}\}Close\{\{\/if\}\}"/);
  assert.match(template, /\{\{#if description\}\}\s*\{\{description\}\}\s*\{\{else\}\}\s*\{\{#if descriptionName\}\}\{\{descriptionName\}\}\{\{\/if\}\}\{\{#if descriptionLabel\}\}: \{\{descriptionLabel\}\}\{\{\/if\}\}\s*\{\{\/if\}\}/);
  assert.match(template, /aria-label="\{\{#if wheelAriaLabel\}\}\{\{wheelAriaLabel\}\}\{\{else\}\}\{\{title\}\} amount\{\{\/if\}\}"/);

  assert.match(template, /\{\{#if \.\.\/centerZeroLabel\}\}\s*\{\{#if center\}\}0\{\{else\}\}\{\{label\}\}\{\{\/if\}\}\s*\{\{else\}\}\s*\{\{label\}\}\s*\{\{\/if\}\}/);
  assert.match(template, /\{\{#if cancelLabel\}\}\{\{cancelLabel\}\}\{\{else\}\}Cancel\{\{\/if\}\}/);
  assert.match(template, /\{\{#if confirmLabel\}\}\{\{confirmLabel\}\}\{\{else\}\}OK\{\{\/if\}\}/);

  assert.match(template, /data-action="\{\{confirmActionPrefix\}\}\{\{#if confirmActionMiddle\}\}-\{\{confirmActionMiddle\}\}\{\{\/if\}\}-delta"/);
  assert.match(template, /\{\{#if confirmItemId\}\}data-item-id="\{\{confirmItemId\}\}"\{\{\/if\}\}/);
});

test("favorite context menu partial switches between add and remove actions while preserving optional metadata", () => {
  const template = readTemplate("src/templates/partials/favorite-context-menu.hbs");

  assert.match(template, /\{\{#if canToggleFavorite\}\}/);
  assert.match(template, /role="menu"/);
  assert.match(template, /aria-label="\{\{ariaLabel\}\}"/);

  assert.match(template, /\{\{#if favorite\}\}[\s\S]*data-action="\{\{removeAction\}\}"[\s\S]*\{\{else\}\}[\s\S]*data-action="\{\{addAction\}\}"[\s\S]*\{\{\/if\}\}/);
  assert.match(template, /\{\{#if favoriteType\}\}data-favorite-type="\{\{favoriteType\}\}"\{\{\/if\}\}/);
  assert.match(template, /\{\{#if favoriteId\}\}data-favorite-id="\{\{favoriteId\}\}"\{\{\/if\}\}/);
  assert.match(template, /\{\{#if itemId\}\}data-item-id="\{\{itemId\}\}"\{\{\/if\}\}/);
});

test("pane search toolbar partial parameterizes region, pane wiring, labels, and clear-state branch", () => {
  const template = readTemplate("src/templates/partials/pane-search-toolbar.hbs");

  assert.match(template, /class="\{\{toolbarClass\}\}" data-region="\{\{region\}\}"/);
  assert.match(template, /<label class="\{\{searchClass\}\}">/);
  assert.match(template, /placeholder="\{\{placeholder\}\}"/);
  assert.match(template, /aria-label="\{\{ariaLabel\}\}"/);
  assert.match(template, /value="\{\{value\}\}"/);
  assert.match(template, /data-pane-search-input="\{\{pane\}\}"/);
  assert.match(template, /data-pane="\{\{pane\}\}"/);
  assert.match(template, /\{\{#unless canClear\}\}disabled\{\{\/unless\}\}/);
});

test("pane unavailable partial forwards title/body to empty state and preserves target region", () => {
  const template = readTemplate("src/templates/partials/pane-unavailable.hbs");

  assert.match(template, /class="section character-unavailable" data-region="\{\{region\}\}"/);
  assert.match(template, /\{\{> "modules\/pocket-foundry\/templates\/partials\/empty-state\.hbs" title=title body=body\}\}/);
});

test("settings toggle row partial drives off state class and switch aria semantics from enabled", () => {
  const template = readTemplate("src/templates/partials/settings-toggle-row.hbs");

  assert.match(template, /<strong>\{\{label\}\}<\/strong>/);
  assert.match(template, /<p class="mini">\{\{hint\}\}<\/p>/);
  assert.match(template, /class="toggle \{\{#unless enabled\}\}off\{\{\/unless\}\}"/);
  assert.match(template, /role="switch"/);
  assert.match(template, /aria-checked="\{\{#if enabled\}\}true\{\{else\}\}false\{\{\/if\}\}"/);
  assert.match(template, /aria-label="\{\{ariaLabel\}\}"/);
  assert.match(template, /data-action="\{\{action\}\}"/);
});

test("content list row partial covers class composition, optional data attributes, and aria fallback", () => {
  const template = readTemplate("src/templates/partials/content-list-row.hbs");

  assert.match(template, /class="row content-list-row \{\{rowClass\}\}\{\{#if rowClassExtra\}\} \{\{rowClassExtra\}\}\{\{\/if\}\}"/);
  assert.match(template, /data-action="\{\{action\}\}"/);
  assert.match(template, /\{\{#if entryUuid\}\}data-entry-uuid="\{\{entryUuid\}\}"\{\{\/if\}\}/);
  assert.match(template, /\{\{#if pageUuid\}\}data-page-uuid="\{\{pageUuid\}\}"\{\{\/if\}\}/);
  assert.match(template, /\{\{#if recentId\}\}data-recent-id="\{\{recentId\}\}"\{\{\/if\}\}/);
  assert.match(template, /\{\{#if recentKind\}\}data-recent-kind="\{\{recentKind\}\}"\{\{\/if\}\}/);

  assert.match(template, /aria-label="\{\{#if ariaLabel\}\}\{\{ariaLabel\}\}\{\{else\}\}\{\{title\}\}\{\{#if subtitle\}\}, \{\{subtitle\}\}\{\{\/if\}\}\{\{\/if\}\}"/);
  assert.match(template, /\{\{#if icon\}\}<img src="\{\{icon\}\}" alt="">\{\{else\}\}\{\{iconText\}\}\{\{\/if\}\}/);
  assert.match(template, /\{\{#if hasValue\}\}\s*<span class="content-list-value \{\{valueClass\}\}">\{\{value\}\}<\/span>\s*\{\{else\}\}\s*\{\{#if value\}\}<span class="content-list-value \{\{valueClass\}\}">\{\{value\}\}<\/span>\{\{\/if\}\}\s*\{\{\/if\}\}/);
  assert.match(template, /\{\{#if actionLabel\}\}<span class="row-action content-list-action">\{\{actionLabel\}\}<\/span>\{\{\/if\}\}/);
});

test("expandable detail row partial delegates summary and body slots with configurable classes", () => {
  const template = readTemplate("src/templates/partials/expandable-detail-row.hbs");

  assert.match(template, /<details class="expandable-detail-drawer \{\{drawerClass\}\}">/);
  assert.match(template, /<summary class="sheet-list-row expandable-detail-summary \{\{summaryClass\}\}" data-swipe-ignore>/);
  assert.match(template, /\{\{> summary\}\}/);
  assert.match(template, /<div class="expandable-detail-body \{\{bodyClass\}\}">/);
  assert.match(template, /\{\{> body\}\}/);
});

