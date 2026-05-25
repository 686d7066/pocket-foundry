# `src/services`

This folder contains system-agnostic services for Foundry documents, search, permissions, local storage, recents, item details, journals, and reactive refresh.

Services should be reusable by core and by system adapters without knowing which game system is active.

## Boundary Rules

- Services code must not import from any system in `src/systems/` or any other concrete system folder.
- Services must not hard-code concrete system data structures, pane names, action names, item types, effect types, activity models, or template paths.
- Prefer Foundry document APIs, UUID lookup, permission APIs, and collection abstractions over system-specific assumptions.
- If a system needs special mapping or business logic, implement that inside `src/systems/<system-id>/` and call generic services from there.

## Allowed Responsibilities

- Document lookup by UUID.
- Permission and visibility checks.
- Generic search orchestration and adapters over Foundry collections.
- Journal entry and page loading.
- Local storage and recents.
- Reactive refresh wiring based on Foundry document lifecycle events.

## Not Allowed

- system-specific logic.
- System-specific labels or UI concepts.
- System-owned template paths.
