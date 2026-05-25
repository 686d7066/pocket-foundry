import type { MobileRouter } from "../../router/mobile-router.ts";
import type { SearchUiState } from "./types.ts";

export type MobileShellActionContext = {
  element: HTMLElement;
  router: MobileRouter;
  searchState: SearchUiState;
};
