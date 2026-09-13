import assert from "node:assert/strict";
import { test } from "vitest";
import { createMobileRouter } from "../../../router/mobile-router.ts";
import { RouteView } from "../../../router/routes.ts";
import { buildCharacterPickerViewModel, type CharacterPickerActor } from "../../../services/character-picker.ts";
import { createCharacterPaneRoute } from "../actor-sheet-navigation.ts";
import { createActor } from "../../../tests/support/character-picker-fixture.ts";
const user = { id: "player" };

test("character picker renders limited characters as identity-only rows", () => {
  const limitedCharacter = {
    ...createActor({
      uuid: "Actor.limited",
      name: "Limited Character",
      updateable: false,
      userLevel: 1,
      system: {
        details: { species: "Human", level: 3 },
        attributes: {
          hp: { value: 24, max: 24 },
          ac: { value: 13 },
          init: { total: 2 }
        }
      },
      items: [{ name: "Warlock", type: "class", system: { levels: 3 } }]
    }),
    testUserPermission: (_user: unknown, level: unknown) => level === "LIMITED",
    getUserLevel: () => 1
  } satisfies CharacterPickerActor;

  const model = buildCharacterPickerViewModel({
    actors: [limitedCharacter],
    user
  });

  const character = model.characters[0];
  assert.equal(character?.name, "Limited Character");
  assert.equal(character?.limited, true);
  assert.equal(character?.ownershipLabel, "Limited");
  assert.equal(character?.subtitle, "");
  assert.equal(character?.summary, "");
  assert.equal(character?.showHeaderStats, false);
  assert.equal(character?.acValue, "");
  assert.equal(character?.hpValue, "");
  assert.deepEqual(character?.chips, []);
  assert.doesNotMatch(JSON.stringify(model), /Human|Warlock|24\/24|"13"|\+2/);
});

test("character picker builds dnd5e summary labels and dashboard chips", () => {
  const model = buildCharacterPickerViewModel({
    actors: [
      createActor({
        uuid: "Actor.arlen",
        name: "Arlen Mire",
        updateable: true,
        system: {
          details: { species: "Human", level: 3 },
          attributes: {
            hp: { value: 24, max: 24 },
            ac: { value: 13 },
            init: { total: 2 }
          }
        },
        items: [{ name: "Warlock", type: "class", system: { levels: 3 } }]
      })
    ],
    user
  });

  const character = model.characters[0];
  assert.equal(character?.typeLabel, "Character");
  assert.equal(character?.iconText, "AM");
  assert.equal(character?.summary, "Human Warlock 3");
  assert.equal(character?.subtitle, "Warlock 3");
  assert.equal(character?.acValue, "13");
  assert.equal(character?.hpValue, "24/24");
  assert.deepEqual(character?.chips, [
    { id: "hp", label: "HP", value: "24/24" },
    { id: "ac", label: "AC", value: "13" },
    { id: "initiative", label: "Init", value: "+2" }
  ]);
});

test("selecting a character creates the expected character route", async () => {
  const router = createMobileRouter({ initialRoute: { view: RouteView.Characters } });

  await router.push(createCharacterPaneRoute({ actorUuid: "Actor.arlen", pane: undefined }));

  assert.deepEqual(router.getCurrentRoute(), { view: RouteView.Character, actorUuid: "Actor.arlen", pane: "Details" });
  assert.deepEqual(router.getHistory(), [{ view: RouteView.Characters }]);
});
