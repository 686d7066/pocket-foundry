import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("fillable blips partial is system-agnostic and exposes all configuration parameters", () => {
  const template = readFileSync(new URL("../src/templates/partials/fillable-blips.hbs", import.meta.url), "utf8");

  assert.match(template, /class="fillable-blips/);
  assert.match(template, /\{\{#if \(eq direction "rtl"\)\}\}rtl\{\{else\}\}ltr\{\{\/if\}\}/);
  assert.match(template, /color-\{\{color\}\}/);
  assert.match(template, /data-blip-count="\{\{count\}\}"/);
  assert.match(template, /data-blip-direction="\{\{direction\}\}"/);
  assert.match(template, /data-blip-fill-mode="\{\{fillMode\}\}"/);
  assert.match(template, /data-blip-color="\{\{color\}\}"/);
  assert.match(template, /data-fill-mode="\{\{..\/fillMode\}\}"/);
  assert.match(template, /data-pip-value="\{\{value\}\}"/);
  assert.match(template, /data-pip-active="\{\{#if active\}\}true\{\{else\}\}false\{\{\/if\}\}"/);
  assert.match(template, /data-action="\{\{..\/action\}\}"/);
  assert.match(template, /data-blip-kind="\{\{..\/kind\}\}"/);
  assert.match(template, /\{\{#if ..\/canUpdate\}\}/);
  assert.match(template, /\{\{#each pips\}\}/);
});

