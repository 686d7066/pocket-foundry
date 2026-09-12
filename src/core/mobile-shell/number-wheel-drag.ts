import { updateNumberWheelSelection } from "./controller-helpers-navigation.ts";

/** Adds mouse dragging to shared wheels while retaining native touch scrolling. */
export function bindNumberWheelDragging(element: HTMLElement, signal: AbortSignal): void {
  let drag: { wheel: HTMLElement; pointerId: number; startY: number; lastY: number; moved: boolean; snap: string; selection: string } | undefined;
  let suppressClick: HTMLElement | undefined;

  const finish = (): void => {
    const current = drag;
    drag = undefined;
    if (!current) return;
    current.wheel.style.scrollSnapType = current.snap;
    current.wheel.style.userSelect = current.selection;
    if (current.wheel.hasPointerCapture(current.pointerId)) current.wheel.releasePointerCapture(current.pointerId);
    if (current.moved) {
      suppressClick = current.wheel;
      updateNumberWheelSelection(current.wheel);
      current.wheel.querySelector<HTMLElement>("button.selected")?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    }
  };

  element.addEventListener("pointerdown", event => {
    suppressClick = undefined;
    if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    const wheel = event.target instanceof Element ? event.target.closest<HTMLElement>(".spinner-wheel") : null;
    if (!wheel) return;
    finish();
    drag = { wheel, pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, moved: false,
      snap: wheel.style.scrollSnapType, selection: wheel.style.userSelect };
    wheel.style.userSelect = "none";
  }, { signal });

  element.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.wheel.setPointerCapture(event.pointerId);
      drag.wheel.style.scrollSnapType = "none";
    }
    event.preventDefault();
    drag.wheel.scrollTop += drag.lastY - event.clientY;
    drag.lastY = event.clientY;
    updateNumberWheelSelection(drag.wheel);
  }, { signal });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    element.addEventListener(type, event => {
      if (drag?.pointerId === event.pointerId) finish();
    }, { signal });
  }
  element.addEventListener("click", event => {
    const wheel = event.target instanceof Element ? event.target.closest(".spinner-wheel") : null;
    if (!suppressClick || wheel !== suppressClick || event.detail === 0) return;
    suppressClick = undefined;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { signal, capture: true });
  element.addEventListener("dragstart", event => {
    if (event.target instanceof Element && event.target.closest(".spinner-wheel")) event.preventDefault();
  }, { signal });
  signal.addEventListener("abort", finish, { once: true });
}
