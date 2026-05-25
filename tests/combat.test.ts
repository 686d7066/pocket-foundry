import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { buildCombatViewModel } from "../src/services/combat.ts";

type RuntimeWithGame = typeof globalThis & { game?: unknown };
const ENCOUNTER_VISIBILITY_MODULE_ID = "inverted-encounter-visibility";
const ENCOUNTER_VISIBILITY_FLAG_KEY = "isVisible";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "game");
});

test("combat visibility honors inverted-encounter-visibility flag false when module is active", () => {
  const combat = createCombatFixture({
    visible: true,
    flagValue: false
  });
  setGameFixture({
    user: { id: "Player1", isGM: false },
    combat,
    modules: createModulesFixture(true)
  });

  const viewModel = buildCombatViewModel();

  assert.equal(viewModel.hasCombat, false);
  assert.equal(viewModel.combatants.length, 0);
});

test("combat visibility honors inverted-encounter-visibility flag true when module is active", () => {
  const combat = createCombatFixture({
    visible: false,
    flagValue: true
  });
  setGameFixture({
    user: { id: "Player1", isGM: false },
    combat,
    modules: createModulesFixture(true)
  });

  const viewModel = buildCombatViewModel();

  assert.equal(viewModel.hasCombat, true);
  assert.equal(viewModel.combatants.length, 1);
  assert.equal(viewModel.encounter.id, "Combat.one");
});

test("combat visibility falls back to Foundry visibility when module is inactive", () => {
  const combat = createCombatFixture({
    visible: true,
    flagValue: false
  });
  setGameFixture({
    user: { id: "Player1", isGM: false },
    combat,
    modules: createModulesFixture(false)
  });

  const viewModel = buildCombatViewModel();

  assert.equal(viewModel.hasCombat, true);
  assert.equal(viewModel.combatants.length, 1);
});

test("combat visibility falls back to Foundry visibility when inverted-encounter-visibility flag is undefined", () => {
  const combat = createCombatFixture({
    visible: false
  });
  setGameFixture({
    user: { id: "Player1", isGM: false },
    combat,
    modules: createModulesFixture(true)
  });

  const viewModel = buildCombatViewModel();

  assert.equal(viewModel.hasCombat, false);
  assert.equal(viewModel.combatants.length, 0);
});

function setGameFixture(game: unknown): void {
  (globalThis as RuntimeWithGame).game = game;
}

function createModulesFixture(active: boolean): { get: (id: string) => { active: boolean } | null } {
  return {
    get: (id: string) => (id === ENCOUNTER_VISIBILITY_MODULE_ID ? { active } : null)
  };
}

function createCombatFixture(options: {
  visible: boolean;
  flagValue?: boolean;
}): {
  id: string;
  name: string;
  visible: boolean;
  started: boolean;
  round: number;
  turn: number;
  turns: Array<{ id: string; name: string; hidden: boolean; disposition: number; initiative: number }>;
  getFlag: (scope: string, key: string) => boolean | undefined;
} {
  return {
    id: "Combat.one",
    name: "Goblin Ambush",
    visible: options.visible,
    started: true,
    round: 1,
    turn: 0,
    turns: [
      {
        id: "Combatant.one",
        name: "Goblin",
        hidden: false,
        disposition: -1,
        initiative: 12
      }
    ],
    getFlag: (scope: string, key: string) =>
      scope === ENCOUNTER_VISIBILITY_MODULE_ID && key === ENCOUNTER_VISIBILITY_FLAG_KEY
        ? options.flagValue
        : undefined
  };
}
