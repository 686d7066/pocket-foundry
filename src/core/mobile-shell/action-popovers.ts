/** Keeps native action popovers beside their invoker and inside the visible viewport. */
export function bindActionPopoverPositioning(root: HTMLElement, signal: AbortSignal): void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  let active: HTMLElement | undefined;
  const position = (): void => {
    if (!active?.isConnected || !active.matches(":popover-open")) { active = undefined; return; }
    const trigger = [...root.querySelectorAll<HTMLElement>("[popovertarget]")]
      .find(button => button.getAttribute("popovertarget") === active?.id);
    if (!trigger) { active.hidePopover(); active = undefined; return; }
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
    active.style.maxWidth = `${rightEdge - leftEdge}px`;
    active.style.maxHeight = `${bottomEdge - topEdge}px`;
    const anchor = trigger.getBoundingClientRect();
    const menu = active.getBoundingClientRect();
    const left = Math.max(leftEdge, Math.min(anchor.right - menu.width, rightEdge - menu.width));
    const preferredTop = anchor.bottom + 6 + menu.height <= bottomEdge ? anchor.bottom + 6 : anchor.top - menu.height - 6;
    const top = Math.max(topEdge, Math.min(preferredTop, bottomEdge - menu.height));
    active.style.left = `${left}px`;
    active.style.top = `${top}px`;
  };
  root.addEventListener("toggle", event => {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute("data-action-popover")) return;
    active = event.target.matches(":popover-open") ? event.target : undefined;
    position();
  }, { capture: true, signal });
  window.addEventListener("scroll", position, { capture: true, passive: true, signal });
  window.addEventListener("resize", position, { passive: true, signal });
  window.visualViewport?.addEventListener("resize", position, { passive: true, signal });
  window.visualViewport?.addEventListener("scroll", position, { passive: true, signal });
}
