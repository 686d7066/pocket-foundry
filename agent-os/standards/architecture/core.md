# Core

Rules for `src/core`, the system-agnostic addon infrastructure.

## Pattern/Rule

Core owns mobile startup, settings, mobile detection, viewport ownership, shell lifecycle, browser integration, and generic shell helpers.

Core may:

- Mount, unmount, and refresh the mobile shell.
- Own mobile mode settings and startup decisions.
- Manage browser history, route restoration, and viewport ownership.
- Bind generic events that forward character-sheet actions through the active adapter.
- Render generic glue that consumes adapter-provided view models and template paths.

Core must:

- Avoid importing from any system in `src/systems/` or any other concrete system folder.
- Avoid hard-coding concrete system pane names, action names, template paths, data paths, or Foundry system APIs.
- Use generic system contracts from `src/systems/character-sheet-adapter.ts` and adapter lookup from `src/systems/character-sheet-adapter-registry.ts`.
- Add generic adapter capabilities when system-dependent behavior is needed.

Core must not own system-specific code, including spells, effects, features, inventory, biography, favorites, rest, hit dice, activities, or system data paths.

## Rationale

Core should support any character-sheet system through adapter contracts rather than direct knowledge of one system.

## References

- `src/core/`
- `agent-os/standards/architecture/system-boundary.md`
