import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { captureOpenCharacterDialog } from "../core/mobile-shell/controller-helpers-ui.ts";

test("recovery can restore the exact open dialog node with its entered values", () => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  const entered = { value: "-3" };
  const retained = { id: "hp-dialog", entered };
  let replacement: { replaceWith: (value: unknown) => void } | undefined;
  let restored: unknown;
  const root = {
    querySelector: (selector: string) => selector === ".mock-dialog.open" ? retained
      : selector === "#hp-dialog" ? replacement ?? null : null
  } as unknown as HTMLElement;
  const restore = captureOpenCharacterDialog(root);
  replacement = { replaceWith: value => { restored = value; } };

  restore?.restore();
  assert.equal(restored, retained);
  assert.equal((restored as typeof retained).entered.value, "-3");
  vi.unstubAllGlobals();
});

test("recovery reattaches an adapter dialog without a template id", () => {
  const retained = { id: "" };
  let restored: unknown;
  const host = { append: (value: unknown) => { restored = value; } };
  const root = {
    querySelector: (selector: string) => selector === ".mock-dialog.open" ? retained
      : selector === ".pocket-foundry-root" ? host : null
  } as unknown as HTMLElement;

  captureOpenCharacterDialog(root)?.restore();
  assert.equal(restored, retained);
});
