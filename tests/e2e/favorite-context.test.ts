import assert from "node:assert/strict";
import { resolve } from "node:path";
import { launchChrome } from "./support/chrome.ts";
import { click, connectToPage, evaluate, waitForRuntimeFlag } from "./support/devtools.ts";
import { startFixtureServer } from "./support/fixture-server.ts";

const projectRoot = resolve(import.meta.dirname, "../..");
const server = await startFixtureServer(projectRoot);
const chrome = await launchChrome(`http://127.0.0.1:${server.port}/favorite-context.html#character=Actor.arlen&pane=Details`);

try {
  const cdp = await connectToPage(chrome.debuggingPort);

  await waitForRuntimeFlag(cdp, "window.__pocketFoundryFavoriteContextReady === true");
  await waitForRuntimeFlag(cdp, "Boolean(document.querySelector('[data-test-skill=\"acr\"] .favorite-context-menu [data-action=\"context-add-favorite\"]'))");

  await evaluate(cdp, `
    document.querySelector('[data-test-skill="acr"]').dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30
    }))
  `);
  await waitForRuntimeFlag(cdp, "Boolean(document.querySelector('.favorite-action-sheet .favorite-action-button'))");
  assert.equal(await evaluate(cdp, "document.querySelector('.pocket-foundry-root > .favorite-action-sheet') !== null"), true);
  assert.deepEqual(await getActionSheetVisibility(cdp), {
    display: "grid",
    position: "fixed",
    visible: true
  });
  assert.equal(await evaluate(cdp, "document.querySelector('.favorite-action-sheet .favorite-action-button').textContent.trim()"), "Add to Favorites");

  await click(cdp, ".favorite-action-sheet .favorite-action-button");
  await waitForRuntimeFlag(cdp, "window.__favoriteCalls.length === 1");
  assert.deepEqual(await evaluate(cdp, "window.__favoriteCalls"), [["add", { type: "skill", id: "acr" }]]);

  await waitForRuntimeFlag(cdp, "Boolean(document.querySelector('[data-test-tool=\"thieves\"] .favorite-context-menu [data-action=\"context-add-favorite\"]'))");
  await evaluate(cdp, `
    (async () => {
      const row = document.querySelector('[data-test-tool="thieves"]');
      const event = new Event("touchstart", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: [{ clientX: 40, clientY: 40 }] });
      row.dispatchEvent(event);
      await new Promise(resolve => setTimeout(resolve, 650));
    })()
  `);
  await waitForRuntimeFlag(cdp, "Boolean(document.querySelector('.favorite-action-sheet .favorite-action-button'))");
  assert.deepEqual(await getActionSheetVisibility(cdp), {
    display: "grid",
    position: "fixed",
    visible: true
  });
  assert.equal(await evaluate(cdp, "document.querySelector('.favorite-action-sheet .favorite-action-button').textContent.trim()"), "Add to Favorites");

  await cdp.close();
  console.log("Favorite context E2E test passed.");
} finally {
  await chrome.close();
  server.close();
}

async function getActionSheetVisibility(cdp: Awaited<ReturnType<typeof connectToPage>>): Promise<unknown> {
  return evaluate(cdp, `(() => {
    const sheet = document.querySelector(".favorite-action-sheet");
    if (!sheet) return null;
    const style = getComputedStyle(sheet);
    const rect = sheet.getBoundingClientRect();
    return {
      display: style.display,
      position: style.position,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.opacity !== "0"
    };
  })()`);
}
