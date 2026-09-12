import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { bindNumberWheelDragging } from "../src/core/mobile-shell/number-wheel-drag.ts";
import { updateNumberWheelSelection } from "../src/core/mobile-shell/controller-helpers-navigation.ts";

vi.mock("../src/core/mobile-shell/controller-helpers-navigation.ts", () => ({ updateNumberWheelSelection: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

/** Event target with the scrolling and pointer-capture operations used by the binder. */
class Wheel extends EventTarget {
  style = { scrollSnapType: "y mandatory", userSelect: "text" };
  scrollTop = 100;
  captured = false;
  closest() { return this; }
  querySelector() { return null; }
  setPointerCapture() { this.captured = true; }
  hasPointerCapture() { return this.captured; }
  releasePointerCapture() { this.captured = false; }
}

/** Dispatches pointer data without requiring a browser or a native PointerEvent. */
function dispatch(wheel: Wheel, type: string, properties: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    pointerType: "mouse", button: 0, isPrimary: true, pointerId: 1, clientY: 100, ...properties
  });
  wheel.dispatchEvent(event);
  return event;
}

/** Adapts the limited test DOM to the production event binding interface. */
function setup() {
  const wheel = new Wheel();
  vi.stubGlobal("Element", Wheel);
  const element = new Proxy({} as HTMLElement, {
    get: (_target, property) => {
      const value: unknown = Reflect.get(wheel, property);
      return typeof value === "function" ? value.bind(wheel) : value;
    }
  });
  const controller = new AbortController();
  bindNumberWheelDragging(element, controller.signal);
  return { wheel, controller };
}

test("mouse dragging scrolls the shared wheel and suppresses the release click", () => {
  const { wheel, controller } = setup();
  dispatch(wheel, "pointerdown");
  dispatch(wheel, "pointermove", { clientY: 60 });
  assert.equal(wheel.scrollTop, 140);
  assert.equal(wheel.captured, true);
  assert.equal(wheel.style.scrollSnapType, "none");
  assert.ok(vi.mocked(updateNumberWheelSelection).mock.calls.length > 0);
  dispatch(wheel, "pointerup", { clientY: 60 });
  assert.equal(wheel.captured, false);
  assert.equal(wheel.style.scrollSnapType, "y mandatory");
  assert.equal(wheel.style.userSelect, "text");
  assert.equal(dispatch(wheel, "click", { detail: 1 }).defaultPrevented, true);
  dispatch(wheel, "pointerdown");
  dispatch(wheel, "pointerup");
  assert.equal(dispatch(wheel, "click", { detail: 1 }).defaultPrevented, false);
  controller.abort();
});

test("touch scrolling remains native and abort releases an active mouse drag", () => {
  const { wheel, controller } = setup();
  dispatch(wheel, "pointerdown", { pointerType: "touch" });
  assert.equal(dispatch(wheel, "pointermove", { pointerType: "touch", clientY: 60 }).defaultPrevented, false);
  assert.equal(wheel.scrollTop, 100);
  dispatch(wheel, "pointerdown");
  dispatch(wheel, "pointermove", { clientY: 60 });
  controller.abort();
  assert.equal(wheel.captured, false);
  assert.equal(wheel.style.scrollSnapType, "y mandatory");
  dispatch(wheel, "pointermove", { clientY: 20 });
  assert.equal(wheel.scrollTop, 140);
});
