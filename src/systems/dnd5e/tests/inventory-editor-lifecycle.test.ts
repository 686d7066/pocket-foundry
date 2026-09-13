import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { handleCharacterSheetClickAction } from "../../../core/mobile-shell/actions-character-sheet.ts";
import { disposeCharacterMutationCoordinator, getCharacterMutationCoordinator } from "../../../core/mobile-shell/character-mutation-coordinator.ts";
import { createInitialSearchUiState } from "../../../core/mobile-shell/controller-helpers-search.ts";
import { openConfirmationDialog } from "../../../core/mobile-shell/controller-helpers-ui.ts";
import { createMobileRouter } from "../../../router/mobile-router.ts";
import { RouteView } from "../../../router/routes.ts";
import { handleInventoryManagement } from "../inventory-management-ui.ts";

vi.mock("../../../systems/character-sheet-adapter-registry.ts", () => ({
  getCharacterSheetAdapter: () => ({ handleShellAction: handleInventoryManagement })
}));
vi.mock("../../../core/mobile-shell/controller-helpers-ui.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../../../core/mobile-shell/controller-helpers-ui.ts")>(),
  openConfirmationDialog: vi.fn()
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

/** Minimal connected DOM tree for testing editor lifecycle, without a browser or layout emulation. */
class TestElement extends EventTarget {
  children: TestElement[] = [];
  parent: TestElement | null = null;
  className = "";
  dataset: Record<string, string> = {};
  value = "";
  textContent = "";
  classList = { add: (value: string) => { this.className += ` ${value}`; } };
  constructor(readonly tag: string) { super(); }
  get isConnected(): boolean { return this.tag === "body" || (this.parent?.isConnected ?? false); }
  append(...children: TestElement[]) {
    for (const child of children) { child.remove(); child.parent = this; this.children.push(child); }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  replaceChildren(...children: TestElement[]) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }
  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (selector.split(", ").some(part => part.startsWith(".") ? child.className.split(" ").includes(part.slice(1)) : part === child.tag)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  closest() { return null; }
  setAttribute() { /* Attributes do not affect these lifecycle tests. */ }
  removeAttribute() { /* Attributes do not affect these lifecycle tests. */ }
  reportValidity() { return true; }
  focus() { /* Focus has no layout dependency here. */ }
}

/** Builds the real action context with a test popup and a controllable document refresh observer. */
function fixture() {
  let observeRefresh: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { observeRefresh = callback; }
    observe() { /* Mutations are delivered explicitly by the test. */ }
    disconnect = disconnect;
  });
  const body = new TestElement("body");
  vi.stubGlobal("document", { body, createElement: (tag: string) => new TestElement(tag) });
  const element = document.createElement("div");
  document.body.append(element);
  const target = document.createElement("button");
  target.dataset.action = "inventory-manage-new-bag";
  element.append(target);
  const createItems = vi.fn(async (_kind: string, data: object[]) => data);
  const actor = { type: "character", canUserModify: () => true, items: [], createEmbeddedDocuments: createItems };
  const resolveActor = vi.fn(async () => actor);
  vi.stubGlobal("foundry", { utils: { fromUuid: resolveActor } });
  vi.mocked(openConfirmationDialog).mockImplementation(root => {
    const dialog = document.createElement("section");
    const panel = document.createElement("div"); panel.className = "confirm-dialog-panel";
    const actions = document.createElement("div"); actions.className = "dialog-actions";
    const cancel = document.createElement("button");
    const submit = document.createElement("button"); submit.className = "primary-action";
    const backdrop = document.createElement("button"); backdrop.className = "dialog-backdrop";
    actions.append(cancel, submit); panel.append(document.createElement("p"), actions); dialog.append(backdrop, panel); root.append(dialog);
    return dialog;
  });
  const initialRoute = { view: RouteView.Character, actorUuid: "Actor.first", pane: "inventory" } as const;
  const router = createMobileRouter({ initialRoute });
  const open = () => handleCharacterSheetClickAction({ element, router, searchState: createInitialSearchUiState() }, target, new Event("click"));
  return { element, router, initialRoute, open, createItems, resolveActor, actor, disconnect, refresh: () => observeRefresh?.() };
}

test("same-character refresh retains the entered inventory draft", async () => {
  const f = fixture(); await f.open();
  const form = f.element.querySelector("form");
  const input = form?.querySelector("input");
  assert.ok(input);
  input.value = "Travel bag";
  f.router.updateCurrentRoute({ ...f.initialRoute, scrollTop: 120 });
  f.element.replaceChildren(); f.refresh();
  assert.equal(f.element.querySelector("form"), form);
  assert.equal(input.value, "Travel bag");
  assert.equal(f.disconnect.mock.calls.length, 0);
  f.element.remove(); f.refresh();
  assert.equal(f.disconnect.mock.calls.length, 1);
});

test.each([
  { view: RouteView.Character, actorUuid: "Actor.second", pane: "inventory" },
  { view: RouteView.Character, actorUuid: "Actor.first", pane: "details" },
  { view: RouteView.Characters }
] as const)("navigation to %j closes the draft and prevents its stale submit", async route => {
  const f = fixture(); await f.open();
  const form = f.element.querySelector("form"); assert.ok(form);
  await f.router.restore(route);
  f.element.replaceChildren(); f.refresh();
  assert.equal(f.element.querySelector("form"), null);
  assert.equal(f.disconnect.mock.calls.length, 1);
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(f.createItems.mock.calls.length, 0);
});

test("submit is rejected after navigation even before the refresh observer runs", async () => {
  const f = fixture(); await f.open();
  const form = f.element.querySelector("form"); assert.ok(form);
  await f.router.push({ ...f.initialRoute, actorUuid: "Actor.second" });
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(f.createItems.mock.calls.length, 0);
  assert.equal(form.isConnected, false);
});

test("navigation during actor lookup does not open an editor for the previous character", async () => {
  const f = fixture();
  let resolve: ((actor: typeof f.actor) => void) | undefined;
  f.resolveActor.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = f.open();
  await f.router.push({ ...f.initialRoute, actorUuid: "Actor.second" });
  assert.ok(resolve); resolve(f.actor); await pending;
  assert.equal(vi.mocked(openConfirmationDialog).mock.calls.length, 0);
  assert.equal(f.createItems.mock.calls.length, 0);
});

test("a slow rejected inventory submit is sent once and preserves the entered draft for safe retry", async () => {
  const f = fixture();
  let finish: (value: object[]) => void = () => undefined;
  f.createItems.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await f.open();
  const form = f.element.querySelector("form");
  const field = form?.querySelector("input");
  assert.ok(form); assert.ok(field);
  field.value = "Travel bag";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(f.createItems.mock.calls.length, 1);
  finish([]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(field.value, "Travel bag");
  assert.equal(form.isConnected, true);
});

test("a disconnected inventory submit remains open for review even if its late document call succeeds", async () => {
  const f = fixture();
  let finish: (value: object[]) => void = () => undefined;
  f.createItems.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await f.open();
  const form = f.element.querySelector("form");
  const field = form?.querySelector("input");
  assert.ok(form); assert.ok(field);
  field.value = "Travel bag";
  form.dispatchEvent(new Event("submit", { cancelable: true }));

  const coordinator = getCharacterMutationCoordinator(f.element as unknown as HTMLElement);
  coordinator.markDisconnected();
  finish([{ id: "created-bag" }]);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(field.value, "Travel bag");
  assert.equal(form.isConnected, true);
  assert.match(form.querySelector("p")?.textContent ?? "", /uncertain/i);
  coordinator.beginRecovery("Actor.first");
  coordinator.completeRecovery("Actor.first", true);
  disposeCharacterMutationCoordinator(f.element as unknown as HTMLElement);
});
