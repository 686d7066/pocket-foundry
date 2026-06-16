# Router

Rules for `src/router`, which contains generic mobile route state and browser-history integration.

## Pattern/Rule

Routes describe where the mobile shell is, not how a specific game system works.

Router code may:

- Define generic mobile route shapes.
- Maintain internal navigation history.
- Serialize and restore browser hash/history state.
- Preserve generic state such as selected pane id, drawer id, search query, focused result, and scroll position.

Router code must:

- Avoid importing from any system in `src/systems/` or any other concrete system folder.
- Avoid hard-coding concrete system pane names, action names, template paths, or data paths.
- Treat character pane ids as opaque route state. Only the active system adapter may normalize, interpret, or assign system meaning to them.
- Route permission checks through generic route permission contracts, not concrete system logic.

Router code must not own system-specific route branching, concrete pane ordering, swipe behavior, or system-specific document lookup rules beyond generic UUID and permission contracts.

## Rationale

Routing must remain stable across system adapters and only preserve generic navigation state.

## References

- `src/router/`
- `agent-os/standards/architecture/system-boundary.md`
