# Services

Rules for `src/services`, which contains system-agnostic Foundry services.

## Pattern/Rule

Services should be reusable by core and by system adapters without knowing which game system is active.

Services may:

- Look up documents by UUID.
- Perform permission and visibility checks.
- Provide generic search orchestration and adapters over Foundry collections.
- Load journal entries and pages.
- Manage local storage and recents.
- Wire reactive refresh behavior based on Foundry document lifecycle events.

Services must:

- Avoid importing from any system in `src/systems/` or any other concrete system folder.
- Avoid hard-coding concrete system data structures, pane names, action names, item types, effect types, activity models, or template paths.
- Prefer Foundry document APIs, UUID lookup, permission APIs, and collection abstractions over system-specific assumptions.
- Leave special mapping or business logic inside `src/systems/<system-id>/`.

Services must not own system-specific logic, system-specific labels, system UI concepts, or system-owned template paths.

## Rationale

Services form shared infrastructure and should be callable by any future adapter without inheriting another system's assumptions.

## References

- `src/services/`
- `agent-os/standards/architecture/system-boundary.md`
