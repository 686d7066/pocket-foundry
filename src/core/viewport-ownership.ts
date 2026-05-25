import { MODULE_ID } from "./constants.ts";

type HiddenSurfaceState = {
  element: HTMLElement;
  display: string;
  ariaHidden: string | null;
  inert: boolean | undefined;
};

const DESKTOP_SURFACE_SELECTORS = [
  "#board",
  "#canvas",
  "#ui-left",
  "#ui-middle",
  "#ui-right",
  "#ui-bottom",
  "#hotbar",
  "#sidebar",
  ".window-app",
  ".app"
] as const;

/**
 * Controller that lets the mobile shell temporarily own the Foundry viewport.
 */
export type ViewportOwnershipController = {
  acquire: () => void;
  release: () => void;
};

/**
 * Creates a viewport ownership controller that hides and restores desktop Foundry surfaces.
 */
export function createViewportOwnershipController(): ViewportOwnershipController {
  const hiddenSurfaces = new Map<HTMLElement, HiddenSurfaceState>();

  function acquire(): void {
    const body = globalThis.document?.body;
    if (!body) return;

    body.dataset.pocketFoundryMobileMode = "active";

    for (const element of findDesktopSurfaces()) {
      if (hiddenSurfaces.has(element)) continue;

      // Store each surface's original state so disabling mobile mode restores
      // Foundry's desktop UI without assuming default display values.
      hiddenSurfaces.set(element, {
        element,
        display: element.style.display,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: "inert" in element ? Boolean(element.inert) : undefined
      });

      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
      if ("inert" in element) element.inert = true;
    }
  }

  function release(): void {
    for (const state of hiddenSurfaces.values()) {
      state.element.style.display = state.display;

      if (state.ariaHidden === null) {
        state.element.removeAttribute("aria-hidden");
      } else {
        state.element.setAttribute("aria-hidden", state.ariaHidden);
      }

      if (state.inert !== undefined && "inert" in state.element) {
        state.element.inert = state.inert;
      }
    }

    hiddenSurfaces.clear();
    delete globalThis.document?.body?.dataset.pocketFoundryMobileMode;
  }

  return { acquire, release };
}

function findDesktopSurfaces(): HTMLElement[] {
  const document = globalThis.document;
  if (!document) return [];

  const root = document.getElementById(`${MODULE_ID}-root`);
  const surfaces = new Set<HTMLElement>();

  for (const selector of DESKTOP_SURFACE_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      // Never hide Pocket Foundry's own root even when broad Foundry app
      // selectors match nested content.
      if (element === root || root?.contains(element) || element.closest(`#${MODULE_ID}-root`)) continue;
      surfaces.add(element);
    }
  }

  return [...surfaces];
}
