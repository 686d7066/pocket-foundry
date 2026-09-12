import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Handlebars from "handlebars";
import { test } from "vitest";

test("quantity popup uses the existing dialog and wheel without leaking the item's description", () => {
  const renderer = Handlebars.create();
  renderer.registerHelper("localize", (key: string) => key);
  for (const partial of ["number-wheel", "number-adjust-dialog"]) {
    renderer.registerPartial(`modules/pocket-foundry/templates/partials/${partial}.hbs`,
      readFileSync(new URL(`../src/templates/partials/${partial}.hbs`, import.meta.url), "utf8"));
  }
  const itemTemplate = readFileSync(new URL("../src/systems/dnd5e/templates/partials/inventory-list-row.hbs", import.meta.url), "utf8");
  const quantityCall = itemTemplate.match(/\{\{> "modules\/pocket-foundry\/templates\/partials\/number-adjust-dialog\.hbs"[\s\S]*?\}\}/)?.[0];
  assert.ok(quantityCall);
  const render = renderer.compile(quantityCall);
  const html = render({
    name: "Ball Bearings", id: "bearings", dialogItemId: "bearings", quantity: 998,
    description: '<div class="ddb">ITEM DESCRIPTION MUST NOT APPEAR</div>',
    closeAction: "inventory-close-number-dialog", dynamicWheel: true,
    initialValue: 998, dynamicMin: 0, step: 1, selectAction: "inventory-select-delta",
    confirmActionPrefix: "inventory-confirm-set-quantity", confirmItemId: "bearings"
  });
  assert.doesNotMatch(html, /ITEM DESCRIPTION|class=&quot;ddb/);
  assert.match(html, /Ball Bearings/);
  assert.match(html, /class="dialog-backdrop"[\s\S]*data-action="inventory-close-number-dialog"/);
  assert.match(html, /class="spinner-wheel"[\s\S]*data-wheel-value="998"/);
  assert.match(html, /data-action="inventory-confirm-set-quantity-delta"/);
});

