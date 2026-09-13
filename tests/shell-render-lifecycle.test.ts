import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createMobileShellController } from "../src/core/mobile-shell/controller.ts";
import { renderShell } from "../src/core/mobile-shell/controller-helpers-shell.ts";
import { disposeShellRendering } from "../src/core/mobile-shell/render-ownership.ts";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { RouteView } from "../src/router/routes.ts";
import { createReactiveRefreshController } from "../src/services/reactive-refresh.ts";
import { createElement, createInput, installShellFixtureRuntime, settle } from "./support/search-ui-fixture.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ["document", "Element", "addEventListener", "removeEventListener", "game", "history", "location", "localStorage", "renderTemplate", "foundry"]) {
    Reflect.deleteProperty(globalThis, key);
  }
});

/** Explicit gates control completion order without relying on timing delays. */
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Deferred not initialized"); };
  let reject: (reason: unknown) => void = () => { throw new Error("Deferred not initialized"); };
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Real shell models and routing with only Foundry's asynchronous template boundary replaced. */
function fixture() {
  const root = Object.assign(Object.create(null) as HTMLElement, createElement());
  const input = createInput();
  const requests: Array<ReturnType<typeof deferred<string>> & { model: object }> = [];
  let nextRequest = deferred<void>();
  installShellFixtureRuntime({ root, searchInput: input, renderTemplate: (_path, model) => {
    const request = { ...deferred<string>(), model };
    requests.push(request);
    nextRequest.resolve();
    return request.promise;
  } });
  cleanups.push(() => disposeShellRendering(root));
  return {
    root, input, requests,
    async request() {
      await nextRequest.promise;
      nextRequest = deferred<void>();
      const request = requests.at(-1);
      assert.ok(request);
      return request;
    }
  };
}

test("a late Settings render cannot overwrite Characters after navigation", async () => {
  const f = fixture();
  const router = createMobileRouter({ initialRoute: { view: RouteView.Settings } });
  const oldRender = renderShell(f.root, router);
  const old = await f.request();
  await router.push({ view: RouteView.Characters });
  const newRender = renderShell(f.root, router);
  const latest = await f.request();
  latest.resolve("characters");
  await newRender;
  old.resolve("settings");
  await oldRender;
  assert.equal(f.root.innerHTML, "characters");
  assert.equal(router.getCurrentRoute().view, RouteView.Characters);
});

test("newer content wins when same-route renders finish out of order", async () => {
  const f = fixture();
  const router = createMobileRouter();
  const firstRender = renderShell(f.root, router);
  const first = await f.request();
  const secondRender = renderShell(f.root, router);
  const second = await f.request();
  second.resolve("updated content");
  await secondRender;
  first.resolve("old content");
  await firstRender;
  assert.equal(f.root.innerHTML, "updated content");
});

test("leaving and returning to a route invalidates its pending render before another render starts", async () => {
  const f = fixture();
  const router = createMobileRouter();
  f.root.innerHTML = "previous committed screen";
  const rendering = renderShell(f.root, router);
  const pending = await f.request();
  await router.push({ view: RouteView.Settings });
  await router.back();
  pending.resolve("obsolete content");
  await rendering;
  assert.equal(f.root.innerHTML, "previous committed screen");
});

test("superseded and unmounted frames cannot restore scroll or steal search focus", async () => {
  const f = fixture();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "", scrollTop: 50 } });
  const first = renderShell(f.root, router);
  (await f.request()).resolve("search");
  await first;
  const obsoleteFrames = frames.splice(0);
  await router.push({ view: RouteView.Characters, scrollTop: 120 });
  const second = renderShell(f.root, router);
  (await f.request()).resolve("characters");
  await second;
  frames.splice(0).forEach(frame => frame(0));
  obsoleteFrames.forEach(frame => frame(0));
  assert.equal(f.root.scrollTop, 120);
  assert.equal(f.input.focused, false);

  await router.push({ view: RouteView.Search, query: "", scrollTop: 220 });
  const third = renderShell(f.root, router);
  (await f.request()).resolve("search again");
  await third;
  disposeShellRendering(f.root);
  frames.splice(0).forEach(frame => frame(0));
  assert.equal(f.root.scrollTop, 120);
  assert.equal(f.input.focused, false);
});

test("current render restores focus and the latest scroll state", async () => {
  const f = fixture();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "" } });
  const rendering = renderShell(f.root, router);
  const pending = await f.request();
  router.updateCurrentRoute({ ...router.getCurrentRoute(), scrollTop: 75 }, { writeHistory: false });
  pending.resolve("search");
  await rendering;
  frames.forEach(frame => frame(0));
  assert.equal(f.root.scrollTop, 75);
  assert.equal(f.input.focused, true);
});

test("failed render preserves committed content and a later render recovers", async () => {
  const f = fixture();
  const router = createMobileRouter();
  f.root.innerHTML = "committed";
  const failed = renderShell(f.root, router);
  const rejection = assert.rejects(failed, /template failed/);
  (await f.request()).reject(new Error("template failed"));
  await rejection;
  assert.equal(f.root.innerHTML, "committed");
  const recovery = renderShell(f.root, router);
  (await f.request()).resolve("recovered");
  await recovery;
  assert.equal(f.root.innerHTML, "recovered");
});

test("an obsolete render failure does not reach the newer screen's error UI", async () => {
  const f = fixture();
  const router = createMobileRouter();
  const oldRender = renderShell(f.root, router);
  const old = await f.request();
  await router.push({ view: RouteView.Settings });
  const newRender = renderShell(f.root, router);
  (await f.request()).resolve("settings");
  await newRender;
  old.reject(new Error("obsolete template failure"));
  await assert.doesNotReject(oldRender);
  assert.equal(f.root.innerHTML, "settings");
});

test("unmount cancels a pending mount and late renders cannot write to its retired root", async () => {
  const f = fixture();
  const controller = createMobileShellController();
  cleanups.push(controller.unmount);
  const mounting = controller.mount();
  const pending = await f.request();
  controller.unmount();
  pending.resolve("obsolete mount");
  await mounting;
  assert.equal(controller.isMounted(), false);
  assert.equal(f.root.children.length, 0);
  assert.equal(f.root.innerHTML, "");
  await renderShell(f.root, createMobileRouter());
  assert.equal(f.requests.length, 1);
});

test("a stale failed mount cannot remove a newly mounted root", async () => {
  const f = fixture();
  const controller = createMobileShellController();
  cleanups.push(controller.unmount);
  const oldMount = controller.mount();
  const old = await f.request();
  controller.unmount();
  const replacement = Object.assign(Object.create(null) as HTMLElement, createElement());
  vi.spyOn(document, "createElement").mockReturnValue(replacement);
  const newMount = controller.mount();
  const latest = await f.request();
  latest.resolve("new root");
  await newMount;
  old.reject(new Error("obsolete failure"));
  await oldMount;
  assert.equal(controller.isMounted(), true);
  assert.equal(replacement.innerHTML, "new root");
  assert.deepEqual(f.root.children, [replacement]);
});

test("concurrent mount calls initialize the root once", async () => {
  const f = fixture();
  const controller = createMobileShellController();
  cleanups.push(controller.unmount);
  const first = controller.mount();
  const second = controller.mount();
  (await f.request()).resolve("mounted");
  await Promise.all([first, second]);
  assert.equal(f.requests.length, 1);
  assert.equal(f.root.children.length, 1);
});

test("a Foundry hook refresh cannot overwrite a newer navigation render", async () => {
  const f = fixture();
  const router = createMobileRouter();
  const hooks = new Map<string, (...args: unknown[]) => void>();
  const refresh = createReactiveRefreshController({
    hooks: {
      on: (name, callback) => { hooks.set(name, callback); },
      off: name => { hooks.delete(name); }
    },
    getRoute: router.getCurrentRoute,
    onRefresh: () => renderShell(f.root, router)
  });
  cleanups.push(refresh.dispose);
  hooks.get("updateActor")?.({ uuid: "Actor.one" });
  const old = await f.request();
  await router.push({ view: RouteView.Settings });
  const navigation = renderShell(f.root, router);
  (await f.request()).resolve("settings");
  await navigation;
  old.resolve("old actor list");
  await settle();
  assert.equal(f.root.innerHTML, "settings");
});

test("a refresh already running at unmount cannot replace the retired screen", async () => {
  const f = fixture();
  const controller = createMobileShellController();
  cleanups.push(controller.unmount);
  const mounting = controller.mount();
  (await f.request()).resolve("mounted");
  await mounting;
  const refreshing = controller.refresh();
  const pending = await f.request();
  controller.unmount();
  pending.resolve("obsolete refresh");
  await refreshing;
  assert.equal(f.root.innerHTML, "mounted");
  assert.equal(controller.isMounted(), false);
});
