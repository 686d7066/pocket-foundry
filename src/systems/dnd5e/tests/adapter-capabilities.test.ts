import assert from "node:assert/strict";
import { test } from "vitest";
import { characterSheetAdapter } from "../index.ts";

test("dnd5e opts into the shared favorites capability", () => {
  assert.ok(characterSheetAdapter.getFavoritesCapability?.());
});
