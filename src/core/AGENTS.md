# `src/core`

This folder contains system-agnostic addon infrastructure.

Core owns mobile startup, settings, mobile detection, viewport ownership, shell lifecycle, browser integration, and generic shell helpers.

## Boundary Rules

- Core must not import from any system in `src/systems/` or any other concrete system folder.
- Core must not hard-code concrete system pane names, action names, template paths, data paths, or Foundry system APIs.
- Core may use generic system contracts from `src/systems/character-sheet-adapter.ts` and adapter lookup from `src/systems/character-sheet-adapter-registry.ts`.
- If core needs system-dependent behavior, add a generic adapter capability and implement it inside the concrete system folder.

## Allowed Responsibilities

- Mounting, unmounting, and refreshing the mobile shell.
- Mobile mode settings and startup decisions.
- Browser history, route restoration, and viewport ownership.
- Generic event binding that forwards character-sheet actions through the active adapter.
- Generic rendering glue that consumes adapter-provided view models and template paths.

## Not Allowed

- system-specific code, including spells, effects, features, inventory, biography, favorites, rest, hit dice, activities, or system data paths.
- System-specific templates or partial paths.
- System-specific action dispatch modules.
