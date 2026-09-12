import assert from "node:assert/strict";
import { test } from "vitest";
import { handleCharacterSheetClickAction } from "../src/core/mobile-shell/actions-character-sheet.ts";
import { getNumberDialogConfirmDelta, updateNumberWheelSelection } from "../src/core/mobile-shell/controller-helpers-navigation.ts";
import { createInitialSearchUiState } from "../src/core/mobile-shell/controller-helpers-search.ts";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { RouteView } from "../src/router/routes.ts";

/** Models wheel geometry so confirmation can independently read its centered option. */
function createWheelFixture() {
  let centeredValue = 0;
  const selectedValues = new Set([0]);
  const confirm = mockElement({
    dataset: { action: "inventory-confirm-charges-delta", delta: "0" },
    closest: () => dialog
  });
  const options = [1, 0].map(value => mockElement({
    dataset: { action: "inventory-select-delta", delta: String(value) },
    classList: {
      add: () => selectedValues.add(value),
      remove: () => selectedValues.delete(value)
    },
    closest: (selector: string) => selector === ".spinner-wheel" ? wheel : dialog,
    getBoundingClientRect: () => ({ top: 58 + (centeredValue - value) * 48, height: 48 }),
    scrollIntoView: () => { centeredValue = value; }
  }));
  const wheel = mockElement({
    dataset: {},
    getBoundingClientRect: () => ({ top: 0, height: 164 }),
    querySelectorAll: () => options,
    querySelector: () => options.find(option => selectedValues.has(Number(option.dataset.delta)))
  });
  const dialog = mockElement({
    querySelectorAll: () => options.filter(option => selectedValues.has(Number(option.dataset.delta))),
    querySelector: (selector: string) => selector === ".spinner-wheel" ? wheel : confirm
  });
  return { confirm, options, wheel, dialog, scrollTo: (value: number) => { centeredValue = value; } };
}

test("clicking a wheel number survives confirmation instead of reverting to the previously centered number", async () => {
  const fixture = createWheelFixture();
  const option = fixture.options[0];
  assert.ok(option);
  await handleCharacterSheetClickAction({
    element: fixture.dialog,
    router: createMobileRouter({ initialRoute: { view: RouteView.Character, actorUuid: "Actor.test", pane: "inventory" } }),
    searchState: createInitialSearchUiState()
  }, option, new Event("click", { cancelable: true }));
  assert.equal(getNumberDialogConfirmDelta(fixture.confirm), 1);

  fixture.scrollTo(0);
  updateNumberWheelSelection(fixture.wheel);
  assert.equal(getNumberDialogConfirmDelta(fixture.confirm), 0);
});

/** Supplies only the DOM operations exercised by the wheel event path. */
function mockElement(properties: Record<string, unknown>): HTMLElement {
  return new Proxy({} as HTMLElement, {
    get: (_target, property) => properties[String(property)]
  });
}
