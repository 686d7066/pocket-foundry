/**
 * Detects whether the current client is likely a touch-first mobile client.
 */
export function isProbablyMobileClient(): boolean {
  const runtime = globalThis as typeof globalThis & {
    matchMedia?: (query: string) => { matches: boolean };
    navigator?: Navigator;
  };

  const coarsePointer = runtime.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = runtime.matchMedia?.("(max-width: 800px)")?.matches ?? false;
  const touchPoints = runtime.navigator?.maxTouchPoints ?? 0;

  return coarsePointer || (touchPoints > 0 && narrowViewport);
}
