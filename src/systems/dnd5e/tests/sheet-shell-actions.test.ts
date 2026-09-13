import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { RouteView, type CharacterRoute } from "../../../router/routes.ts";
import type {
  CharacterSheetActionHelpers,
  CharacterSheetActionResult
} from "../../character-sheet-adapter.ts";
import {
  handleDnd5eShellAction,
  runCharacterSheetPaneAction
} from "../actor-sheet-navigation.ts";
import { dnd5eCharacterSheetAdapter } from "../dnd5e-character-sheet-adapter.ts";
import type { Dnd5eDetailsActor, Dnd5eDetailsRestConfig } from "../details/types.ts";

const user = { id: "player", isGM: true };
const route: CharacterRoute = {
  view: RouteView.Character,
  actorUuid: "Actor.arlen",
  pane: "Details",
  scrollTop: 0
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "CSS");
  Reflect.deleteProperty(globalThis, "game");
});

test("short-rest confirmation preserves the auto hit-die checkbox through the dnd5e adapter", async () => {
  installDnd5eRuntime();
  const actor = createActor();
  const harness = createActionHarness(async (action, data) => runCharacterSheetPaneAction({
    actor,
    actorUuid: "Actor.arlen",
    pane: "Details",
    route,
    user,
    action,
    data
  }));

  for (const autoHD of [true, false]) {
    const target = createRestTarget("short", { autoHD });
    const handled = await handleDnd5eShellAction({
      element: asHtmlElement(new TestHtmlElement()),
      target: asHtmlElement(target),
      event: new Event("click", { cancelable: true }),
      action: "details-confirm-rest",
      route,
      helpers: harness.helpers
    });

    assert.equal(handled, true);
  }

  assert.deepEqual(harness.calls, [
    {
      action: "details-confirm-rest",
      data: { restType: "short", type: "short", dialog: "false", autoHD: "true" },
      closeDialogs: true
    },
    {
      action: "details-confirm-rest",
      data: { restType: "short", type: "short", dialog: "false", autoHD: "false" },
      closeDialogs: true
    }
  ]);
  assert.deepEqual(actor.rests, [
    { type: "short", dialog: false, autoHD: true },
    { type: "short", dialog: false, autoHD: false }
  ]);
  assert.equal(harness.transientClearCount, 2);
});

test("long-rest confirmation preserves each recovery checkbox", async () => {
  installDnd5eRuntime();
  const actor = createActor();
  const harness = createActionHarness(async (action, data) => runCharacterSheetPaneAction({
    actor,
    actorUuid: "Actor.arlen",
    pane: "Details",
    route,
    user,
    action,
    data
  }));
  const target = createRestTarget("long", {
    newDay: false,
    recoverTemp: true,
    recoverTempMax: false
  });

  const handled = await handleDnd5eShellAction({
    element: asHtmlElement(new TestHtmlElement()),
    target: asHtmlElement(target),
    event: new Event("click", { cancelable: true }),
    action: "details-confirm-rest",
    route,
    helpers: harness.helpers
  });

  assert.equal(handled, true);
  assert.deepEqual(harness.calls, [{
    action: "details-confirm-rest",
    data: {
      restType: "long",
      type: "long",
      dialog: "false",
      newDay: "false",
      recoverTemp: "true",
      recoverTempMax: "false"
    },
    closeDialogs: true
  }]);
  assert.deepEqual(actor.rests, [{
    type: "long",
    dialog: false,
    newDay: false,
    recoverTemp: true,
    recoverTempMax: false
  }]);
  assert.equal(harness.transientClearCount, 0);
});

test("hit-die actions retain their result for the reopened short-rest dialog until transient state clears", async () => {
  installDnd5eRuntime();
  const actor = createActor();
  const harness = createActionHarness(async (action, data) => {
    const actionContext = {
      actor,
      actorUuid: "Actor.arlen",
      pane: "Details",
      route,
      user,
      action,
      data
    };
    const result = await dnd5eCharacterSheetAdapter.runPaneAction(actionContext);
    await dnd5eCharacterSheetAdapter.onPaneActionResult?.({ actionContext, result });
    return result;
  });
  const target = new TestHtmlElement({ denomination: "d8" });

  const handled = await handleDnd5eShellAction({
    element: asHtmlElement(new TestHtmlElement()),
    target: asHtmlElement(target),
    event: new Event("click", { cancelable: true }),
    action: "details-roll-hit-die",
    route,
    helpers: harness.helpers
  });

  assert.equal(handled, true);
  assert.deepEqual(actor.hitDieRolls, [{ denomination: "d8", configure: false, create: false }]);
  assert.deepEqual(harness.dialogUpdates, [{ dialogId: "details-short-rest-dialog", open: true }]);
  const withRoll = await dnd5eCharacterSheetAdapter.buildPaneViewModel({ pane: "Details", actor, user, route });
  assert.deepEqual(getRecord(withRoll.data)?.shortRestRoll, {
    denomination: "d8",
    total: 7,
    formula: "1d8 + 2",
    hpBefore: 18,
    hpAfter: 24,
    hpDelta: 6
  });

  dnd5eCharacterSheetAdapter.clearTransientState(route);
  const afterClear = await dnd5eCharacterSheetAdapter.buildPaneViewModel({ pane: "Details", actor, user, route });
  assert.equal(getRecord(afterClear.data)?.shortRestRoll, undefined);
});

test("currency confirmation applies centered deltas to the absolute actor values", async () => {
  const gpSelected = new TestHtmlElement({ delta: "8" });
  gpSelected.classList.add("selected");
  const gpCentered = new TestHtmlElement({ delta: "-3" });
  const gpWheel = createCurrencyWheel(gpSelected);
  const gpTrigger = createCurrencyTrigger("gp", "18", gpWheel);

  const spSelected = new TestHtmlElement({ delta: "5" });
  spSelected.classList.add("selected");
  const spWheel = createCurrencyWheel(spSelected);
  const spTrigger = createCurrencyTrigger("sp", "2", spWheel);

  const dialog = new TestHtmlElement();
  dialog.setQueryAll(".inventory-currency-trigger[data-currency-id]", [gpTrigger, spTrigger]);
  const shell = new TestHtmlElement();
  shell.setQuery("#inventory-currency-dialog", dialog);
  const harness = createActionHarness();
  harness.centeredOptions.set(gpWheel, gpCentered);

  const handled = await handleDnd5eShellAction({
    element: asHtmlElement(shell),
    target: asHtmlElement(new TestHtmlElement()),
    event: new Event("click", { cancelable: true }),
    action: "inventory-apply-currency",
    route,
    helpers: harness.helpers
  });

  assert.equal(handled, true);
  assert.deepEqual(harness.calls, [{
    action: "inventory-confirm-currency",
    data: { gp: "15", sp: "7" },
    closeDialogs: true
  }]);
  assert.equal(gpTrigger.dataset.currencyValue, "-3");
  assert.equal(gpCentered.classList.contains("selected"), true);
  assert.equal(gpSelected.classList.contains("selected"), false);
  assert.equal(spTrigger.dataset.currencyValue, "5");
});

type TestActor = Dnd5eDetailsActor & {
  rests: Dnd5eDetailsRestConfig[];
  hitDieRolls: Array<{ denomination: string | undefined; configure: boolean | undefined; create: boolean | undefined }>;
};

/** Creates an updateable dnd5e actor that records rest and hit-die API calls. */
function createActor(): TestActor {
  const actor: TestActor = {
    uuid: "Actor.arlen",
    id: "arlen",
    name: "Arlen Mire",
    type: "character",
    img: null,
    isOwner: true,
    system: {
      attributes: {
        hp: { value: 18, max: 24, effectiveMax: 24, temp: 0 },
        hd: { value: 2, max: 3, bySize: { d8: 2 } }
      },
      details: { level: 3 }
    },
    items: [],
    testUserPermission: (_user, level) => level === "OBSERVER",
    canUserModify: (_user, action) => action === "update",
    getUserLevel: () => 3,
    rests: [],
    hitDieRolls: [],
    update: async data => {
      const nextHp = data["system.attributes.hp.value"];
      const hp = getRecord(getRecord(actor.system)?.attributes)?.hp;
      const hpRecord = getRecord(hp);
      if (typeof nextHp === "number" && hpRecord) hpRecord.value = nextHp;
      return actor;
    },
    initiateRest: async config => {
      actor.rests.push(config);
      return actor;
    },
    rollHitDie: async (config, dialog, message) => {
      actor.hitDieRolls.push({
        denomination: config?.denomination,
        configure: dialog?.configure,
        create: message?.create
      });
      const hp = getRecord(getRecord(actor.system)?.attributes)?.hp;
      const hpRecord = getRecord(hp);
      if (hpRecord) hpRecord.value = 24;
      return [{ total: 7, formula: "1d8 + 2" }];
    }
  };
  return actor;
}

type RunActionCall = {
  action: string;
  data?: Readonly<Record<string, string>>;
  closeDialogs?: boolean;
};

/** Builds the generic shell helpers while recording adapter-facing effects. */
function createActionHarness(
  execute: (action: string, data: Readonly<Record<string, string>> | undefined) => CharacterSheetActionResult | Promise<CharacterSheetActionResult>
    = () => ({ ok: true })
): {
  helpers: CharacterSheetActionHelpers;
  calls: RunActionCall[];
  dialogUpdates: Array<{ dialogId: string | undefined; open: boolean }>;
  centeredOptions: Map<object, TestHtmlElement>;
  readonly transientClearCount: number;
} {
  const calls: RunActionCall[] = [];
  const dialogUpdates: Array<{ dialogId: string | undefined; open: boolean }> = [];
  const centeredOptions = new Map<object, TestHtmlElement>();
  let transientClearCount = 0;
  const harness = {
    calls,
    dialogUpdates,
    centeredOptions,
    get transientClearCount() {
      return transientClearCount;
    },
    helpers: {
      isCurrentRoute: () => true,
      setDialogOpen: (dialogId, open) => dialogUpdates.push({ dialogId, open }),
      setNumberWheelValue: () => undefined,
      getCenteredNumberWheelOption: wheel => {
        const option = centeredOptions.get(wheel);
        return option ? asHtmlElement(option) : null;
      },
      setSelectedNumberDelta: () => undefined,
      runAction: async (action, options) => {
        calls.push({ action, data: options?.data, closeDialogs: options?.closeDialogs });
        const result = await execute(action, options?.data);
        if (result.ok) await options?.onSuccess?.(result);
      },
      clearTransientState: () => {
        transientClearCount += 1;
      },
      closeFavoriteContextMenu: () => undefined
    }
  } satisfies {
    helpers: CharacterSheetActionHelpers;
    calls: RunActionCall[];
    dialogUpdates: Array<{ dialogId: string | undefined; open: boolean }>;
    centeredOptions: Map<object, TestHtmlElement>;
    readonly transientClearCount: number;
  };
  return harness;
}

/** Creates a rest confirmation target with its checkbox-bearing dialog. */
function createRestTarget(type: "short" | "long", checked: Record<string, boolean>): TestHtmlElement {
  const dialog = new TestHtmlElement();
  for (const [name, value] of Object.entries(checked)) {
    dialog.setQuery(`input[name="${name}"]`, new TestHtmlElement({}, value));
  }
  const target = new TestHtmlElement({ restType: type });
  target.setClosest(".mock-dialog", dialog);
  return target;
}

/** Creates a number wheel whose current fallback selection is observable. */
function createCurrencyWheel(selected: TestHtmlElement): TestHtmlElement {
  const wheel = new TestHtmlElement();
  wheel.setQuery("button.selected", selected);
  wheel.setQueryAll("button.selected", [selected]);
  return wheel;
}

/** Creates a currency trigger with the actor's current absolute value. */
function createCurrencyTrigger(currencyId: string, initialValue: string, wheel: TestHtmlElement): TestHtmlElement {
  const trigger = new TestHtmlElement({ currencyId, currencyInitialValue: initialValue });
  trigger.setQuery(".spinner-wheel", wheel);
  return trigger;
}

class TestClassList {
  private readonly values = new Set<string>();

  add(value: string): void {
    this.values.add(value);
  }

  remove(value: string): void {
    this.values.delete(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class TestHtmlElement {
  readonly dataset: Record<string, string>;
  readonly classList = new TestClassList();
  readonly checked: boolean;
  textContent: string | null = null;
  private readonly closestMatches = new Map<string, TestHtmlElement>();
  private readonly queryMatches = new Map<string, TestHtmlElement>();
  private readonly queryAllMatches = new Map<string, TestHtmlElement[]>();

  constructor(dataset: Record<string, string> = {}, checked = false) {
    this.dataset = { ...dataset };
    this.checked = checked;
  }

  setClosest(selector: string, element: TestHtmlElement): void {
    this.closestMatches.set(selector, element);
  }

  setQuery(selector: string, element: TestHtmlElement): void {
    this.queryMatches.set(selector, element);
  }

  setQueryAll(selector: string, elements: TestHtmlElement[]): void {
    this.queryAllMatches.set(selector, elements);
  }

  closest(selector: string): TestHtmlElement | null {
    return this.closestMatches.get(selector) ?? null;
  }

  querySelector(selector: string): TestHtmlElement | null {
    return this.queryMatches.get(selector) ?? null;
  }

  querySelectorAll(selector: string): TestHtmlElement[] {
    return this.queryAllMatches.get(selector) ?? [];
  }
}

/** Installs the minimal browser and Foundry globals used by rest actions. */
function installDnd5eRuntime(): void {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value }
  });
  Object.defineProperty(globalThis, "game", {
    configurable: true,
    value: { user }
  });
}

/** Converts the scoped DOM fixture to the interface consumed by shell handlers. */
function asHtmlElement(element: TestHtmlElement): HTMLElement {
  return element as unknown as HTMLElement;
}

/** Narrows opaque view-model and actor data to a plain record. */
function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
