import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getDnd5eWorkflowOutcome,
  snapshotDnd5eMutationState
} from "../action-outcome.ts";

test("native workflow snapshots fail closed when any document source is unreadable", () => {
  const source = { _source: { system: { value: 1 } } };

  assert.equal(snapshotDnd5eMutationState(source, { id: "missing" }), null);
  assert.equal(snapshotDnd5eMutationState(source, { toObject: () => undefined }), null);
  assert.equal(snapshotDnd5eMutationState(source, { toObject: () => null }), null);
  assert.equal(snapshotDnd5eMutationState(source, { toObject: () => { throw new Error("unreadable"); } }), null);
  assert.deepEqual(getDnd5eWorkflowOutcome({ result: true }, null, "after"), {
    ok: false,
    failure: "uncertain",
    retry: "review"
  });
});

test("native workflow outcomes distinguish unchanged and changed document sources", () => {
  const before = snapshotDnd5eMutationState({ _source: { system: { value: 1 } } });
  const unchanged = snapshotDnd5eMutationState({ _source: { system: { value: 1 } } });
  const changed = snapshotDnd5eMutationState({ _source: { system: { value: 2 } } });

  assert.deepEqual(getDnd5eWorkflowOutcome({ result: true }, before, unchanged), { ok: true, changed: false });
  assert.deepEqual(getDnd5eWorkflowOutcome({ result: true }, before, changed), { ok: true });
});
