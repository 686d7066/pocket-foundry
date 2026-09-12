import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { disposeTableLayout, initializeTableLayout } from "../src/core/mobile-shell/table-layout.ts";

/** Supplies measured cell widths without opening a browser; this tests observer lifecycle, not CSS rendering. */
function tableFixture(initialWidth: number, hidden = false) {
  const state = { width: initialWidth, hidden };
  const properties = new Map<string, string>();
  const row = Object.assign(Object.create(null) as HTMLElement, {
    children: [30, 250, 20, 25, 40, 44].map(width => ({ hasAttribute: () => false, getBoundingClientRect: () => ({ width }) })),
    classList: { contains: () => false },
    getAttribute: () => null,
    removeAttribute: () => undefined,
    querySelectorAll: () => [],
    style: { setProperty: () => undefined }
  });
  const table = Object.assign(Object.create(null) as HTMLElement, {
    isConnected: true,
    dataset: { tableLayout: "icon-title-3meta-actions" },
    getClientRects: () => state.hidden ? [] : [{}],
    closest: () => state.hidden ? {} : null,
    querySelectorAll: () => [row],
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name)
    }
  });
  Object.defineProperty(table, "clientWidth", { get: () => state.width });
  return { table, state, properties };
}

test("opening and resizing nested tables measures each level independently and clears closed descendants", () => {
  const parent = tableFixture(600);
  const child = tableFixture(480, true);
  const grandchild = tableFixture(360, true);
  const pending: FrameRequestCallback[] = [];
  const listeners = new Map<string, () => void>();
  const disconnect = vi.fn();
  const observe = vi.fn();
  const root = Object.assign(Object.create(null) as HTMLElement, {
    querySelectorAll: () => [parent.table, child.table, grandchild.table],
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    ownerDocument: {}
  });
  const flush = (): void => { pending.splice(0).forEach(callback => callback(0)); };
  const total = (fixture: ReturnType<typeof tableFixture>): number => {
    const widths = fixture.properties.get("--pf-table-columns")?.split(" ").map(parseFloat) ?? [];
    return widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 8;
  };
  vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect = disconnect; });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.push(callback); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("getComputedStyle", () => ({ paddingLeft: "0", paddingRight: "0", getPropertyValue: () => "8" }));
  try {
    initializeTableLayout(root);
    flush();
    assert.equal(observe.mock.calls.length, 3);
    assert.equal(total(parent), 600);
    assert.equal(child.properties.has("--pf-table-columns"), false);
    child.state.hidden = false;
    listeners.get("toggle")?.();
    flush();
    assert.equal(total(child), 480);
    grandchild.state.hidden = false;
    listeners.get("toggle")?.();
    flush();
    assert.equal(total(grandchild), 360);
    child.state.width = 280;
    grandchild.state.hidden = true;
    listeners.get("toggle")?.();
    flush();
    assert.equal(total(parent), 600);
    assert.ok(Math.abs(total(child) - 280) < .001);
    assert.equal(grandchild.properties.has("--pf-table-columns"), false);
    disposeTableLayout(root);
    assert.equal(disconnect.mock.calls.length, 1);
    assert.equal(listeners.size, 0);
  } finally {
    disposeTableLayout(root);
    vi.unstubAllGlobals();
  }
});
