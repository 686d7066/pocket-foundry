# Lifecycle

Standards for Foundry hooks, DOM listeners, shell controllers, and teardown behavior.

## Pattern/Rule

- Pair every long-lived event listener, hook, observer, timer, and subscription with an explicit cleanup path.
- Avoid duplicate listener registration across rerenders, route changes, shell remounts, and Foundry startup hooks.
- Keep lifecycle ownership clear: the module that creates a listener, controller, observer, or timer should own its disposal.
- Prefer idempotent mount, refresh, and unmount operations.
- Preserve scroll, focus, route, and drawer state intentionally across rerenders. Do not rely on incidental DOM survival.
- When async lifecycle work can race with unmount or route changes, guard the result before mutating state or DOM.
- Use Foundry lifecycle hooks according to their documented timing; document assumptions when the timing is not obvious.

## Review Rules

- Flag listeners, hooks, observers, timers, or subscriptions without cleanup.
- Flag startup or rerender code that can register duplicate handlers.
- Check async shell updates for stale route, stale actor, stale document, or unmounted DOM writes.
- Check teardown behavior for mobile shell, viewport ownership, browser history, and reactive refresh changes.

## Rationale

Pocket Foundry runs inside a long-lived Foundry client where actors, sheets, routes, and rendered DOM can change repeatedly. Lifecycle leaks and stale async writes can cause duplicate actions, broken navigation, or UI state corruption.

## References

- `agent-os/standards/architecture/core.md`
- `agent-os/standards/architecture/router.md`
- `agent-os/standards/architecture/services.md`
- `agent-os/standards/technology/foundryvtt.md`
