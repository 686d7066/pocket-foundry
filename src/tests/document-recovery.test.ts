import assert from "node:assert/strict";
import { test } from "vitest";
import { refreshDocumentFromDatabase } from "../services/document-recovery.ts";

test("authoritative recovery reads the persisted root and refreshes its retained identity", async () => {
  const requests: unknown[] = [];
  class ActorDocument {
    static database = {
      get: async (documentClass: Function, operation: unknown) => {
        requests.push({ documentClass, operation });
        return [new ActorDocument({ _id: "hero", hp: 7 })];
      }
    };
    id = "hero";
    documentName = "Actor";
    constructorSource: Record<string, unknown>;
    constructor(source: Record<string, unknown>) { this.constructorSource = source; }
    toObject(_source?: boolean) { return { ...this.constructorSource }; }
    updateSource(source: object, options?: { recursive?: boolean }) {
      this.constructorSource = { ...source };
      assert.deepEqual(options, { recursive: false });
    }
  }
  const actor = new ActorDocument({ _id: "hero", hp: 3 });

  assert.equal(await refreshDocumentFromDatabase(actor, { isCurrent: () => true }), true);
  assert.deepEqual(actor.toObject(true), { _id: "hero", hp: 7 });
  assert.deepEqual(requests, [{
    documentClass: ActorDocument,
    operation: { action: "get", documentName: "Actor", query: { _id: "hero" } }
  }]);
});

test("recovery retries when local source changes during the read and never applies a stale response", async () => {
  let finishFirst: (value: unknown) => void = () => undefined;
  let calls = 0;
  class ActorDocument {
    static database = {
      get: async () => {
        calls += 1;
        if (calls === 1) return new Promise(resolve => { finishFirst = resolve; });
        return [new ActorDocument({ _id: "hero", value: 9 })];
      }
    };
    id = "hero";
    documentName = "Actor";
    constructor(private source: Record<string, unknown>) {}
    toObject() { return { ...this.source }; }
    updateSource(source: object) { this.source = { ...source }; }
  }
  const actor = new ActorDocument({ _id: "hero", value: 1 });
  const recovery = refreshDocumentFromDatabase(actor, { isCurrent: () => true });
  actor.updateSource({ _id: "hero", value: 2 });
  finishFirst([new ActorDocument({ _id: "hero", value: 8 })]);

  assert.equal(await recovery, true);
  assert.equal(calls, 2);
  assert.deepEqual(actor.toObject(), { _id: "hero", value: 9 });
});

test("recovery fails closed when public database APIs are unavailable or ownership becomes stale", async () => {
  const unsupported = { id: "hero", documentName: "Actor", toObject: () => ({ _id: "hero" }), updateSource: () => undefined };
  assert.equal(await refreshDocumentFromDatabase(unsupported, { isCurrent: () => true }), false);

  let current = true;
  class ActorDocument {
    static database = { get: async () => { current = false; return [new ActorDocument()]; } };
    id = "hero";
    documentName = "Actor";
    toObject() { return { _id: "hero" }; }
    updateSource() { throw new Error("stale recovery must not update source"); }
  }
  assert.equal(await refreshDocumentFromDatabase(new ActorDocument(), { isCurrent: () => current }), false);
});

test("recovery reports failure when source conversion or application throws", async () => {
  class ActorDocument {
    static database = { get: async () => [new ActorDocument(true)] };
    id = "hero";
    documentName = "Actor";
    constructor(private fresh = false) {}
    toObject() {
      if (this.fresh) return { _id: "hero", value: 2 };
      return { _id: "hero", value: 1 };
    }
    updateSource() { throw new Error("invalid source"); }
  }
  assert.equal(await refreshDocumentFromDatabase(new ActorDocument(), { isCurrent: () => true }), false);
});
