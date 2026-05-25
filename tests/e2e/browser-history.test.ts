import { resolve } from "node:path";
import { assertPageState } from "./support/assertions.ts";
import { launchChrome } from "./support/chrome.ts";
import { click, connectToPage, evaluate, waitForRuntimeFlag } from "./support/devtools.ts";
import { startFixtureServer } from "./support/fixture-server.ts";
import { ShellDestination } from "../../src/router/routes.ts";

const projectRoot = resolve(import.meta.dirname, "../..");
const server = await startFixtureServer(projectRoot);
const chrome = await launchChrome(`http://127.0.0.1:${server.port}/browser-history.html`);

try {
  const cdp = await connectToPage(chrome.debuggingPort);

  await waitForRuntimeFlag(cdp, "window.__pocketFoundryBrowserTestReady === true");

  await assertPageState(cdp, ShellDestination.Characters, 0, "initial route");
  await click(cdp, `[data-route='${ShellDestination.Search}']`);
  await assertPageState(cdp, ShellDestination.Search, 0, "after Search click");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Characters, 0, "after browser back from Search");

  await click(cdp, `[data-route='${ShellDestination.Journal}']`);
  await click(cdp, `[data-route='${ShellDestination.Recents}']`);
  await assertPageState(cdp, ShellDestination.Recents, 0, "after Recents click");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Journal, 0, "after browser back from Recents");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Characters, 0, "after second browser back from Journal");

  await click(cdp, `[data-route='${ShellDestination.Search}']`);
  await click(cdp, `[data-route='${ShellDestination.Settings}']`);
  await click(cdp, `[data-route='${ShellDestination.Recents}']`);
  await click(cdp, `[data-route='${ShellDestination.Journal}']`);
  await assertPageState(cdp, ShellDestination.Journal, 0, "after multi-step navigation");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Recents, 0, "after first multi-step browser back");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Settings, 0, "after second multi-step browser back");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Search, 0, "after third multi-step browser back");
  await evaluate(cdp, "history.back()");
  await assertPageState(cdp, ShellDestination.Characters, 0, "after fourth multi-step browser back");

  await cdp.close();
  console.log("Browser history E2E test passed.");
} finally {
  await chrome.close();
  server.close();
}
