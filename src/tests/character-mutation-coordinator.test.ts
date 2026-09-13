import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createCharacterMutationCoordinator } from "../core/mobile-shell/character-mutation-coordinator.ts";
import { runCharacterSheetMutation } from "../core/mobile-shell/controller-helpers-navigation.ts";
import { createMobileRouter } from "../router/mobile-router.ts";
import { RouteView } from "../router/routes.ts";

function rootFixture() {
  const status = { hidden: true, dataset: {} as Record<string, string>, textContent: "" };
  const root = { querySelector: () => status } as unknown as HTMLElement;
  return { root, status };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

test("slow character writes expose saving state and reject duplicate actor submissions without queuing", async () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  const write = deferred<{ ok: true }>();
  let calls = 0;
  const first = coordinator.run({
    actorUuid: "Actor.slow",
    label: "resource",
    operation: () => { calls += 1; return write.promise; },
    isCurrent: () => true
  });

  assert.equal(coordinator.getStatus().kind, "saving");
  assert.equal(fixture.status.dataset.state, "saving");
  const duplicate = await coordinator.run({
    actorUuid: "Actor.slow",
    label: "resource",
    operation: () => { calls += 1; return { ok: true }; },
    isCurrent: () => true
  });
  assert.equal(duplicate.started, false);
  assert.equal(calls, 1);

  write.resolve({ ok: true });
  assert.deepEqual(await first, { started: true, current: true, result: { ok: true } });
  assert.equal(coordinator.getStatus().kind, "saved");
  coordinator.dispose();
});

test("definite rejection permits manual retry while uncertain failure requires reconciliation", async () => {
  const rejectedFixture = rootFixture();
  const rejected = createCharacterMutationCoordinator(rejectedFixture.root);
  const result = await rejected.run({
    actorUuid: "Actor.rejected",
    label: "inventory",
    operation: () => ({ ok: false, reason: "forbidden" }),
    isCurrent: () => true
  });
  assert.deepEqual(result.result, { ok: false, reason: "forbidden", failure: "rejected", retry: "safe" });
  assert.equal(rejected.isBlocked("Actor.rejected"), false);
  assert.equal(rejected.getStatus().kind, "failed");
  rejected.dispose();

  const uncertainFixture = rootFixture();
  const uncertain = createCharacterMutationCoordinator(uncertainFixture.root);
  const reconcile: string[] = [];
  const failure = new Error("connection lost");
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  uncertain.setReconcileHandler(actorUuid => reconcile.push(actorUuid));
  const uncertainResult = await uncertain.run({
    actorUuid: "Actor.uncertain",
    label: "resource",
    operation: () => { throw failure; },
    isCurrent: () => true
  });
  assert.equal(uncertainResult.current, false);
  assert.equal(uncertainResult.result.failure, "uncertain");
  assert.equal(uncertain.isBlocked("Actor.uncertain"), true);
  assert.deepEqual(reconcile, ["Actor.uncertain"]);
  assert.equal(log.mock.calls.length, 1);
  assert.match(String(log.mock.calls[0]?.[0]), /character mutation \(resource\) failed/);
  assert.equal(log.mock.calls[0]?.[1], failure);
  assert.match(failure.stack ?? "", /connection lost/);
  uncertain.beginRecovery("Actor.uncertain");
  uncertain.completeRecovery("Actor.uncertain", true);
  assert.equal(uncertain.isBlocked("Actor.uncertain"), false);
  uncertain.dispose();
});

test("disconnect retires UI ownership but keeps the actor lease until the uncertain write settles and is reread", async () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  const write = deferred<{ ok: true }>();
  const reconciliations: string[] = [];
  coordinator.setReconcileHandler(actorUuid => reconciliations.push(actorUuid));
  const first = coordinator.run({
    actorUuid: "Actor.disconnect",
    label: "resource",
    operation: () => write.promise,
    isCurrent: () => true
  });

  coordinator.markDisconnected();
  coordinator.beginRecovery("Actor.disconnect");
  coordinator.completeRecovery("Actor.disconnect", true);
  assert.equal(coordinator.getStatus().kind, "recovering");
  assert.equal(coordinator.isPending("Actor.disconnect"), true);
  const whileOldWritePending = await coordinator.run({
    actorUuid: "Actor.disconnect",
    label: "resource",
    operation: () => ({ ok: true }),
    isCurrent: () => true
  });
  assert.equal(whileOldWritePending.started, false);

  write.resolve({ ok: true });
  const late = await first;
  assert.equal(late.current, false);
  assert.equal(late.result.ok, false);
  assert.equal(late.result.failure, "uncertain");
  assert.deepEqual(reconciliations, ["Actor.disconnect"]);
  assert.notEqual(coordinator.getStatus().kind, "saved");
  coordinator.beginRecovery("Actor.disconnect");
  coordinator.completeRecovery("Actor.disconnect", true);
  assert.equal(coordinator.isBlocked("Actor.disconnect"), false);
  assert.equal(coordinator.getStatus().kind, "failed");
  assert.match(coordinator.getStatus().message, /uncertain/i);
  coordinator.dispose();
});

test("reconnecting away from a character keeps writes blocked until that actor is authoritatively refreshed", () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  coordinator.markDisconnected();
  coordinator.markConnected();
  assert.equal(coordinator.isBlocked("Actor.later"), true);
  coordinator.beginRecovery("Actor.later");
  coordinator.completeRecovery("Actor.later", true);
  assert.equal(coordinator.isBlocked("Actor.later"), false);
  assert.equal(coordinator.isBlocked("Actor.other"), true);
  coordinator.beginRecovery("Actor.other");
  coordinator.completeRecovery("Actor.other", true);
  assert.equal(coordinator.isBlocked("Actor.other"), false);
  coordinator.dispose();
});

test("a resume read that finishes before an ordinary pending write requires a second read after settlement", async () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  const write = deferred<{ ok: true }>();
  const reconciliations: string[] = [];
  coordinator.setReconcileHandler(actorUuid => reconciliations.push(actorUuid));
  const pending = coordinator.run({
    actorUuid: "Actor.resume",
    label: "resource",
    operation: () => write.promise,
    isCurrent: () => true
  });
  coordinator.beginRecovery("Actor.resume", true);
  coordinator.completeRecovery("Actor.resume", true);
  write.resolve({ ok: true });

  assert.equal((await pending).current, false);
  assert.deepEqual(reconciliations, ["Actor.resume"]);
  assert.notEqual(coordinator.getStatus().kind, "saved");
  coordinator.beginRecovery("Actor.resume");
  coordinator.completeRecovery("Actor.resume", true);
  assert.equal(coordinator.isBlocked("Actor.resume"), false);
  coordinator.dispose();
});

test("a connected signal without a preceding gap is a no-op", () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  coordinator.markConnected();
  assert.deepEqual(coordinator.getStatus(), { kind: "idle", message: "" });
  assert.equal(coordinator.isBlocked("Actor.current"), false);
  coordinator.dispose();
});

test("a resume away from characters silently requires each later actor to be refreshed", () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  coordinator.markResumeRequired();

  assert.deepEqual(coordinator.getStatus(), { kind: "idle", message: "" });
  assert.equal(coordinator.isBlocked("Actor.later"), true);
  coordinator.beginRecovery("Actor.later");
  coordinator.completeRecovery("Actor.later", true);
  assert.equal(coordinator.isBlocked("Actor.later"), false);
  assert.equal(coordinator.isBlocked("Actor.other"), true);
  coordinator.dispose();
});

test("an acknowledged action with no character change reports neutral completion", async () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  const result = await coordinator.run({
    actorUuid: "Actor.no-change",
    label: "recharge",
    operation: () => ({ ok: true, changed: false }),
    isCurrent: () => true
  });
  assert.equal(result.current, true);
  assert.equal(coordinator.getStatus().kind, "completed");
  assert.match(coordinator.getStatus().message, /no character changes/i);
  coordinator.dispose();
});

test("late recovery for another actor cannot overwrite the visible actor's saving state", async () => {
  const status = { hidden: true, dataset: {} as Record<string, string>, textContent: "" };
  const busyRegion = {
    setAttribute: (_name: string, value: string) => { busyRegion.ariaBusy = value; },
    ariaBusy: "false"
  };
  const actorSheet = {
    dataset: { actorUuid: "Actor.visible" },
    querySelectorAll: () => [busyRegion]
  };
  const root = {
    querySelector: (selector: string) => selector === "[data-character-mutation-status]" ? status : actorSheet
  } as unknown as HTMLElement;
  const coordinator = createCharacterMutationCoordinator(root);
  const write = deferred<{ ok: true }>();
  const visibleMutation = coordinator.run({
    actorUuid: "Actor.visible",
    label: "resource",
    operation: () => write.promise,
    isCurrent: () => true
  });
  assert.equal(status.dataset.state, "saving");
  assert.equal(busyRegion.ariaBusy, "true");

  coordinator.beginRecovery("Actor.background");
  coordinator.completeRecovery("Actor.background", true);
  assert.equal(status.dataset.state, "saving");
  assert.equal(busyRegion.ariaBusy, "true");
  write.resolve({ ok: true });
  await visibleMutation;
  coordinator.dispose();
});

test("a failed authoritative refresh stays visible while writes remain blocked", () => {
  const status = { hidden: true, dataset: {} as Record<string, string>, textContent: "" };
  const actorSheet = { dataset: { actorUuid: "Actor.failed-refresh" }, setAttribute: () => undefined };
  const root = {
    querySelector: (selector: string) => selector === "[data-character-mutation-status]" ? status : actorSheet
  } as unknown as HTMLElement;
  const coordinator = createCharacterMutationCoordinator(root);
  coordinator.markResumeRequired();
  coordinator.beginRecovery("Actor.failed-refresh");
  coordinator.completeRecovery("Actor.failed-refresh", false);

  assert.equal(coordinator.isBlocked("Actor.failed-refresh"), true);
  assert.equal(status.dataset.state, "failed");
  assert.match(status.textContent, /could not be refreshed/i);
  coordinator.dispose();
});

test("disposing a shell retires callbacks without releasing an unsettled actor lease", async () => {
  const firstFixture = rootFixture();
  const firstCoordinator = createCharacterMutationCoordinator(firstFixture.root);
  const write = deferred<{ ok: true }>();
  const pending = firstCoordinator.run({
    actorUuid: "Actor.remount",
    label: "inventory",
    operation: () => write.promise,
    isCurrent: () => true
  });
  firstCoordinator.dispose();

  const secondFixture = rootFixture();
  const secondCoordinator = createCharacterMutationCoordinator(secondFixture.root);
  assert.equal(secondCoordinator.isPending("Actor.remount"), true);
  write.resolve({ ok: true });
  assert.equal((await pending).current, false);
  secondCoordinator.beginRecovery("Actor.remount");
  secondCoordinator.completeRecovery("Actor.remount", true);
  assert.equal(secondCoordinator.isBlocked("Actor.remount"), false);
  secondCoordinator.dispose();
});

test("a late rejected mutation preserves its error without touching newer UI", async () => {
  const fixture = rootFixture();
  const coordinator = createCharacterMutationCoordinator(fixture.root);
  const write = deferred<{ ok: true }>();
  const failure = new Error("late retired mutation failure");
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let current = true;
  const pending = coordinator.run({
    actorUuid: "Actor.retired",
    label: "inventory",
    operation: () => write.promise,
    isCurrent: () => current
  });

  current = false;
  fixture.status.dataset.state = "newer-screen";
  fixture.status.textContent = "Newer screen content";
  write.reject(failure);
  const result = await pending;

  assert.equal(result.current, false);
  assert.equal(result.result.failure, "uncertain");
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0]?.[1], failure);
  assert.equal(fixture.status.dataset.state, "newer-screen");
  assert.equal(fixture.status.textContent, "Newer screen content");
  coordinator.dispose();
});

test("mutation ownership survives scroll state updates but is permanently retired by away-and-back navigation", async () => {
  const scrollFixture = rootFixture();
  const scrollRouter = createMobileRouter({ initialRoute: { view: RouteView.Character, actorUuid: "Actor.scroll", pane: "Overview" } });
  const scrollWrite = deferred<{ ok: true }>();
  const scrollMutation = runCharacterSheetMutation(scrollFixture.root, scrollRouter, "Actor.scroll", "resource", () => scrollWrite.promise);
  scrollRouter.updateCurrentRoute({ ...scrollRouter.getCurrentRoute(), scrollTop: 120 });
  scrollWrite.resolve({ ok: true });
  assert.equal((await scrollMutation).current, true);

  const routeFixture = rootFixture();
  const routeRouter = createMobileRouter({ initialRoute: { view: RouteView.Character, actorUuid: "Actor.route", pane: "Overview" } });
  const routeWrite = deferred<{ ok: true }>();
  const routeMutation = runCharacterSheetMutation(routeFixture.root, routeRouter, "Actor.route", "resource", () => routeWrite.promise);
  const routeCoordinator = createCharacterMutationCoordinator({ querySelector: () => null } as unknown as HTMLElement);
  const reconciliations: string[] = [];
  routeCoordinator.setReconcileHandler(actorUuid => reconciliations.push(actorUuid));
  await routeRouter.push({ view: RouteView.Characters });
  await routeRouter.back();
  routeWrite.resolve({ ok: true });
  assert.equal((await routeMutation).current, false);
  assert.deepEqual(reconciliations, ["Actor.route"]);
  routeCoordinator.beginRecovery("Actor.route");
  routeCoordinator.completeRecovery("Actor.route", true);
  routeCoordinator.dispose();
});
