import assert from "node:assert/strict";
import { test } from "vitest";
import { createConnectionRecoveryController } from "../services/connection-recovery.ts";

type Callback = () => void;

function eventTargetFixture() {
  const callbacks = new Map<string, Set<Callback>>();
  return {
    addEventListener: (name: string, callback: Callback) => {
      const entries = callbacks.get(name) ?? new Set<Callback>();
      entries.add(callback); callbacks.set(name, entries);
    },
    removeEventListener: (name: string, callback: Callback) => callbacks.get(name)?.delete(callback),
    emit: (name: string) => callbacks.get(name)?.forEach(callback => callback()),
    count: () => [...callbacks.values()].reduce((total, entries) => total + entries.size, 0)
  };
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("socket loss and browser resume request recovery and dispose removes every listener", async () => {
  const socketEvents = eventTargetFixture();
  const documentEvents = eventTargetFixture();
  const windowEvents = eventTargetFixture();
  const socket = { connected: true, on: socketEvents.addEventListener, off: socketEvents.removeEventListener };
  const disconnected: string[] = [];
  let recoveries = 0;
  const controller = createConnectionRecoveryController({
    socket,
    document: { visibilityState: "visible", ...documentEvents } as unknown as Document,
    window: windowEvents as unknown as Window,
    onDisconnected: () => disconnected.push("lost"),
    onRecoveryRequested: () => { recoveries += 1; }
  });

  socket.connected = false; socketEvents.emit("disconnect");
  socket.connected = true; socketEvents.emit("connect");
  await Promise.resolve(); await Promise.resolve();
  windowEvents.emit("pageshow");
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(disconnected, ["lost"]);
  assert.equal(recoveries, 2);

  controller.dispose();
  assert.equal(socketEvents.count() + documentEvents.count() + windowEvents.count(), 0);
});

test("a reconnect during a stale recovery schedules one guarded trailing recovery", async () => {
  const socketEvents = eventTargetFixture();
  const socket = { connected: true, on: socketEvents.addEventListener, off: socketEvents.removeEventListener };
  const first = deferred();
  const currentChecks: boolean[] = [];
  let calls = 0;
  createConnectionRecoveryController({
    socket,
    onDisconnected: () => undefined,
    onRecoveryRequested: async isCurrent => {
      calls += 1;
      if (calls === 1) {
        await first.promise;
        currentChecks.push(isCurrent());
      } else currentChecks.push(isCurrent());
    }
  });

  socketEvents.emit("connect");
  await Promise.resolve();
  socket.connected = false; socketEvents.emit("disconnect");
  socket.connected = true; socketEvents.emit("connect");
  first.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.deepEqual(currentChecks, [false, true]);
});
