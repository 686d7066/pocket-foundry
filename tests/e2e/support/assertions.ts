import { evaluate, waitForRuntimeFlag, type CdpClient } from "./devtools.ts";

export async function assertPageState(cdp: CdpClient, view: string, beforeUnloadCount: number, label: string): Promise<void> {
  try {
    await waitForRuntimeFlag(cdp, `document.querySelector(".mf-app")?.dataset.view === ${JSON.stringify(view)}`);
  } catch (error) {
    const actualView = await evaluate(cdp, "document.querySelector('.mf-app')?.dataset.view");
    const href = await evaluate(cdp, "location.href");
    throw new Error(`${label}: expected view ${view}, got ${String(actualView)} at ${String(href)}. ${String(error)}`);
  }

  const actualBeforeUnloadCount = await evaluate(cdp, "window.__beforeUnloadCount");
  if (actualBeforeUnloadCount !== beforeUnloadCount) {
    throw new Error(`${label}: expected beforeunload count ${beforeUnloadCount}, got ${actualBeforeUnloadCount}`);
  }

  const foundryConfirmResults = await evaluate(cdp, "window.__foundryConfirmResults");
  if (Array.isArray(foundryConfirmResults) && foundryConfirmResults.some(result => result !== false)) {
    throw new Error(`${label}: Foundry leave-game confirm was not suppressed: ${JSON.stringify(foundryConfirmResults)}`);
  }
}
