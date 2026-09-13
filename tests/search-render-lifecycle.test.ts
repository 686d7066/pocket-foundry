import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createInitialSearchUiState, executeSearch, scheduleSearch } from "../src/core/mobile-shell/controller-helpers-search.ts";
import { renderShell } from "../src/core/mobile-shell/controller-helpers-shell.ts";
import { disposeShellRendering } from "../src/core/mobile-shell/render-ownership.ts";
import type { SearchUiState } from "../src/core/mobile-shell/types.ts";
import { createMobileRouter } from "../src/router/mobile-router.ts";
import { RouteView } from "../src/router/routes.ts";
import type { MobileSearchResponse, MobileSearchService } from "../src/services/search.ts";
import { createDocument, createElement, createInput, installShellFixtureRuntime, type SearchFixtureDocument } from "./support/search-ui-fixture.ts";

const roots: HTMLElement[] = [];

afterEach(() => {
  vi.useRealTimers();
  roots.splice(0).forEach(disposeShellRendering);
  for (const key of ["document", "Element", "addEventListener", "removeEventListener", "game", "history", "location", "localStorage", "renderTemplate", "foundry"]) {
    Reflect.deleteProperty(globalThis, key);
  }
});

/** Explicit gates control search completion order without timing delays. */
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Deferred not initialized"); };
  let reject: (reason: unknown) => void = () => { throw new Error("Deferred not initialized"); };
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Advances promise continuations until an async shell condition is observable. */
async function settleUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  assert.ok(condition(), "Expected asynchronous shell work to settle");
}

type SearchRequest = ReturnType<typeof deferred<SearchFixtureDocument[]>> & { query: string };
type RenderedSearchModel = {
  search?: {
    query: string;
    loading: boolean;
    results: Array<{ name: string }>;
  };
};

/** Real shell rendering with only collection search held behind explicit gates. */
function fixture(documents: SearchFixtureDocument[]) {
  const root = Object.assign(Object.create(null) as HTMLElement, createElement());
  const requests: SearchRequest[] = [];
  let nextRequest = deferred<void>();
  const models: RenderedSearchModel[] = [];
  const actors = {
    contents: documents,
    search: ({ query = "" }: { query?: string }) => {
      const request = { query, ...deferred<SearchFixtureDocument[]>() };
      requests.push(request);
      nextRequest.resolve();
      return request.promise;
    }
  };

  installShellFixtureRuntime({
    root,
    searchInput: createInput(),
    actors,
    renderTemplate: async (_path, model) => {
      const rendered = model as RenderedSearchModel;
      models.push(rendered);
      const search = rendered.search;
      return search ? `${search.query}:${search.loading}:${search.results.map(result => result.name).join(",")}` : "non-search";
    }
  });
  roots.push(root);

  return {
    root,
    models,
    requests,
    async request(): Promise<SearchRequest> {
      await nextRequest.promise;
      nextRequest = deferred<void>();
      const request = requests.at(-1);
      assert.ok(request);
      return request;
    }
  };
}

test("a same-route successor awaits the shared search and commits its results", async () => {
  const alpha = createDocument({ uuid: "Actor.alpha", name: "Alpha", documentName: "Actor" });
  const f = fixture([alpha]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "alpha" } });
  const searchState = createInitialSearchUiState();

  const firstRender = renderShell(f.root, router, searchState);
  const search = await f.request();
  const successorRender = renderShell(f.root, router, searchState);
  search.resolve([alpha]);
  await Promise.all([firstRender, successorRender]);

  assert.equal(f.requests.length, 1);
  assert.equal(f.root.innerHTML, "alpha:false:Alpha");
  assert.equal(f.models.length, 1);
});

test("restoring a different search starts promptly and suppresses the older result", async () => {
  const alpha = createDocument({ uuid: "Actor.alpha", name: "Alpha", documentName: "Actor" });
  const beta = createDocument({ uuid: "Actor.beta", name: "Beta", documentName: "Actor" });
  const f = fixture([alpha, beta]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "alpha" } });
  const searchState = createInitialSearchUiState();

  const alphaRender = renderShell(f.root, router, searchState);
  const alphaSearch = await f.request();
  router.updateCurrentRoute({ view: RouteView.Search, query: "beta" });
  const betaRender = renderShell(f.root, router, searchState);
  const betaSearch = await f.request();

  assert.equal(betaSearch.query, "beta");
  betaSearch.resolve([beta]);
  await assert.doesNotReject(betaRender);
  alphaSearch.resolve([alpha]);
  await assert.doesNotReject(alphaRender);

  assert.equal(f.root.innerHTML, "beta:false:Beta");
  assert.equal(searchState.completedKey, "beta\u0000all");
});

test("returning to cached results clears loading owned by an incompatible request", async () => {
  const alpha = createDocument({ uuid: "Actor.alpha", name: "Alpha", documentName: "Actor" });
  const beta = createDocument({ uuid: "Actor.beta", name: "Beta", documentName: "Actor" });
  const f = fixture([alpha, beta]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "beta" } });
  const searchState = createInitialSearchUiState();

  const initialRender = renderShell(f.root, router, searchState);
  const initialSearch = await f.request();
  initialSearch.resolve([beta]);
  await initialRender;

  router.updateCurrentRoute({ view: RouteView.Search, query: "alpha" });
  const alphaRender = renderShell(f.root, router, searchState);
  const alphaSearch = await f.request();
  router.updateCurrentRoute({ view: RouteView.Search, query: "beta" });
  await renderShell(f.root, router, searchState);

  assert.equal(f.requests.length, 2);
  assert.equal(f.root.innerHTML, "beta:false:Beta");
  assert.equal(searchState.loading, false);

  alphaSearch.resolve([alpha]);
  await alphaRender;
  assert.equal(f.root.innerHTML, "beta:false:Beta");
});

test("clearing a query prevents its pending search from restoring stale results", async () => {
  const alpha = createDocument({ uuid: "Actor.alpha", name: "Alpha", documentName: "Actor" });
  const f = fixture([alpha]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "alpha" } });
  const searchState = createInitialSearchUiState();

  const alphaRender = renderShell(f.root, router, searchState);
  const alphaSearch = await f.request();
  router.updateCurrentRoute({ view: RouteView.Search, query: "" });
  await renderShell(f.root, router, searchState);

  assert.equal(f.root.innerHTML, ":false:");
  assert.equal(searchState.results.length, 0);
  assert.equal(searchState.loading, false);

  alphaSearch.resolve([alpha]);
  await alphaRender;
  assert.equal(f.root.innerHTML, ":false:");
  assert.deepEqual(searchState.results, []);
});

test.each(["beta", ""])("debouncing A through %j and back to A invalidates the old A response", async intermediateQuery => {
  vi.useFakeTimers();
  const staleAlpha = createDocument({ uuid: "Actor.alpha-stale", name: "Alpha stale", documentName: "Actor" });
  const freshAlpha = createDocument({ uuid: "Actor.alpha-fresh", name: "Alpha fresh", documentName: "Actor" });
  const f = fixture([staleAlpha, freshAlpha]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "alpha" } });
  const searchState = createInitialSearchUiState();

  const oldRender = renderShell(f.root, router, searchState);
  const oldSearch = await f.request();

  router.updateCurrentRoute({ view: RouteView.Search, query: intermediateQuery });
  scheduleSearch(f.root, router, searchState);
  router.updateCurrentRoute({ view: RouteView.Search, query: "alpha" });
  scheduleSearch(f.root, router, searchState);
  await settleUntil(() => f.models.some(model => model.search?.query === "alpha" && model.search.loading));

  oldSearch.resolve([staleAlpha]);
  await oldRender;
  assert.equal(searchState.results.length, 0);
  assert.equal(searchState.loading, true);
  assert.notEqual(searchState.completedKey, "alpha\u0000all");

  await vi.advanceTimersByTimeAsync(249);
  assert.equal(f.requests.length, 1);
  await vi.advanceTimersByTimeAsync(1);
  const freshSearch = await f.request();
  assert.equal(freshSearch.query, "alpha");
  freshSearch.resolve([freshAlpha]);
  await settleUntil(() => f.root.innerHTML === "alpha:false:Alpha fresh");

  assert.equal(f.requests.length, 2);
  assert.deepEqual(searchState.results.map(result => result.name), ["Alpha fresh"]);
  assert.equal(searchState.loading, false);
});

test("debouncing a cached query keeps its refresh spinner until fresh results arrive", async () => {
  vi.useFakeTimers();
  const cachedAlpha = createDocument({ uuid: "Actor.alpha-cached", name: "Alpha cached", documentName: "Actor" });
  const freshAlpha = createDocument({ uuid: "Actor.alpha-fresh", name: "Alpha fresh", documentName: "Actor" });
  const f = fixture([cachedAlpha, freshAlpha]);
  const router = createMobileRouter({ initialRoute: { view: RouteView.Search, query: "alpha" } });
  const searchState = createInitialSearchUiState();

  const initialRender = renderShell(f.root, router, searchState);
  const initialSearch = await f.request();
  initialSearch.resolve([cachedAlpha]);
  await initialRender;

  scheduleSearch(f.root, router, searchState);
  await settleUntil(() => f.root.innerHTML === "alpha:true:Alpha cached");
  assert.equal(searchState.loading, true);

  await vi.advanceTimersByTimeAsync(249);
  assert.equal(f.requests.length, 1);
  await vi.advanceTimersByTimeAsync(1);
  const freshSearch = await f.request();
  freshSearch.resolve([freshAlpha]);
  await settleUntil(() => f.root.innerHTML === "alpha:false:Alpha fresh");

  assert.equal(f.requests.length, 2);
  assert.equal(searchState.loading, false);
});

test("a rejected current request clears ownership and a later execution can retry", async () => {
  const searchState: SearchUiState = {
    ...createInitialSearchUiState(),
    query: "alpha"
  };
  const failed = deferred<MobileSearchResponse>();
  const recovered: MobileSearchResponse = { query: "alpha", typeFilter: searchState.typeFilter, results: [], errors: [] };
  const service: MobileSearchService = {
    search: async () => [],
    searchWithDiagnostics: () => failed.promise,
    getResultTypes: () => []
  };

  const execution = executeSearch(searchState, service);
  failed.reject(new Error("search failed"));
  await assert.rejects(execution, /search failed/);
  assert.equal(searchState.inFlightRequest, undefined);
  assert.equal(searchState.loading, false);

  await executeSearch(searchState, { ...service, searchWithDiagnostics: async () => recovered });
  assert.equal(searchState.completedKey, "alpha\u0000all");
  assert.equal(searchState.inFlightRequest, undefined);
});

test("an explicit same-key execution supersedes an older captured search", async () => {
  const searchState: SearchUiState = {
    ...createInitialSearchUiState(),
    query: "alpha"
  };
  const oldResponse = deferred<MobileSearchResponse>();
  const freshResponse = deferred<MobileSearchResponse>();
  const responses = [oldResponse.promise, freshResponse.promise];
  let calls = 0;
  const service: MobileSearchService = {
    search: async () => [],
    searchWithDiagnostics: () => {
      const response = responses[calls];
      calls += 1;
      assert.ok(response);
      return response;
    },
    getResultTypes: () => []
  };

  const oldExecution = executeSearch(searchState, service);
  const freshExecution = executeSearch(searchState, service);
  assert.equal(calls, 2);

  oldResponse.resolve({ query: "alpha", typeFilter: searchState.typeFilter, results: [], errors: [] });
  await oldExecution;
  assert.equal(searchState.loading, true);
  assert.equal(searchState.completedKey, "");

  freshResponse.resolve({ query: "alpha", typeFilter: searchState.typeFilter, results: [], errors: [] });
  await freshExecution;
  assert.equal(searchState.loading, false);
  assert.equal(searchState.completedKey, "alpha\u0000all");
});
