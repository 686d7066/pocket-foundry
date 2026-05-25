import type { MobileRouter } from "../router/mobile-router.ts";
import type { MobileRoute, ShellDestination } from "../router/routes.ts";

/**
 * Navigates to a top-level shell destination.
 */
export async function navigateShellDestination(
  router: MobileRouter,
  destination: ShellDestination
): Promise<MobileRoute> {
  return router.openShellDestination(destination);
}
