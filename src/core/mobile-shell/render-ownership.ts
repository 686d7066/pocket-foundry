import type { MobileRouter } from "../../router/mobile-router.ts";
import type { MobileRoute } from "../../router/routes.ts";

type RenderOwner = { isCurrent: () => boolean; release: () => void };
const owners = new WeakMap<HTMLElement, RenderOwner>();
const disposedRoots = new WeakSet<HTMLElement>();

/** Whether a shell root has been retired, including callbacks arriving after teardown. */
export function isShellRenderDisposed(element: HTMLElement): boolean {
  return disposedRoots.has(element);
}

/**
 * Claims the next render for this root. Navigation invalidates the claim even
 * when the user returns to the same route before the pending work completes.
 * Scroll and expanded-detail updates are restored from the latest route state.
 */
export function beginShellRender(element: HTMLElement, router: MobileRouter): () => boolean {
  owners.get(element)?.release();
  let current = !isShellRenderDisposed(element);
  const routeKey = getRenderRouteKey(router.getCurrentRoute());
  const unsubscribe = router.subscribe(() => { current = false; });
  const owner: RenderOwner = {
    isCurrent: () => current && routeKey === getRenderRouteKey(router.getCurrentRoute()),
    release: () => {
      current = false;
      unsubscribe();
    }
  };
  owners.set(element, owner);
  return owner.isCurrent;
}

/** Retires the current render while keeping the mounted root available. */
export function invalidateShellRender(element: HTMLElement): void {
  owners.get(element)?.release();
  owners.delete(element);
}

/** Permanently retires a root so pending renders and deferred DOM work cannot resume. */
export function disposeShellRendering(element: HTMLElement): void {
  disposedRoots.add(element);
  invalidateShellRender(element);
}

/** Separates render inputs from transient state that can change while rendering. */
function getRenderRouteKey(route: MobileRoute): string {
  return JSON.stringify(route, (key, value: unknown) =>
    key === "scrollTop" || key === "expandedDetailKeys" ? undefined : value);
}
