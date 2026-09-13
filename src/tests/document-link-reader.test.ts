import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { createMobileRouter } from "../router/mobile-router.ts";
import { RouteView } from "../router/routes.ts";
import { createInitialSearchUiState, handleEnrichedDocumentLinkClick } from "../core/mobile-shell/controller-helpers-search.ts";
import { createDocument, createElement, createInput, installShellFixtureRuntime } from "./support/search-ui-fixture.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Element");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "game");
  Reflect.deleteProperty(globalThis, "history");
  Reflect.deleteProperty(globalThis, "location");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "renderTemplate");
  Reflect.deleteProperty(globalThis, "foundry");
});

test("enriched links in a synthetic document reader are consumed and routed through the mobile shell", async () => {
  const root = createElement();
  const actor = createDocument({ uuid: "Actor.pilot", name: "Kei Voss", documentName: "Actor", type: "pilot" });
  installShellFixtureRuntime({
    root,
    searchInput: createInput(),
    actors: [actor],
    systemId: "synthetic-unsupported",
    renderTemplate: async () => "<main></main>"
  });
  let receivedSelector = "";
  const link = {
    dataset: { uuid: actor.uuid },
    getAttribute: () => null
  } as unknown as HTMLAnchorElement;
  const target = {
    closest(selector: string) {
      receivedSelector = selector;
      return link;
    }
  };
  let prevented = false;
  let stopped = false;
  const event = {
    target,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
    stopImmediatePropagation: () => undefined
  } as unknown as MouseEvent;
  const router = createMobileRouter({ initialRoute: { view: RouteView.Journal } });

  await handleEnrichedDocumentLinkClick(event, root as unknown as HTMLElement, router, createInitialSearchUiState());

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.pilot" });
  assert.match(receivedSelector, /\[data-document-links\] a\[data-uuid\]/);
  assert.doesNotMatch(receivedSelector, /biography|journal-reader|item-detail/);
});
