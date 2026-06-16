# System Adapters

Rules for `src/systems`, the system-adapter layer for Pocket Foundry.

## Pattern/Rule

`src/systems/character-sheet-adapter.ts` defines the system-neutral contract for character sheet adapters.

`src/systems/character-sheet-adapter-registry.ts` owns adapter registration and lookup for the currently active Foundry system.

`src/systems/character-sheet-adapters.generated.ts` is generated registration glue. Do not add gameplay logic or system-specific view logic there.

`src/systems/<system-id>/` contains all implementation details for one Foundry system.

System-specific code, templates, constants, action names, view models, helpers, CSS assumptions, and Foundry system API usage must stay inside that system's own folder.

Core code may:

- Ask for the active adapter through `getCharacterSheetAdapter()`.
- Call adapter methods such as `buildPaneViewModel`, `runPaneAction`, `getPaneContext`, and `getPaneTemplatePaths`.
- Store and route generic mobile state such as active route, selected pane id, drawer state, scroll position, and search input.

Core code must not:

- Import from `src/systems/dnd5e/` or any other concrete system folder.
- Switch on concrete system ids to choose UI behavior.
- Know concrete pane names like dnd5e Details, Inventory, Features, Spells, Effects, Biography, or Favorites.
- Know concrete system action names like spell preparation, hit dice, effects, favorites, rest, item use, or similar workflows.
- Hard-code concrete template paths owned by a system folder.
- Reach into actor, item, effect, activity, or system data structures for a specific system.

When adding a new system:

- Create a new folder under `src/systems/<system-id>/`.
- Implement the generic adapter contract inside that folder.
- Keep all system-specific builders, actions, templates, helpers, and constants inside that folder.
- Expose only the adapter entry point needed by the system registration layer.
- Do not modify core, router, services, or another system folder to special-case the new system.

## Rationale

Adapters are the only boundary between generic Pocket Foundry behavior and concrete Foundry game-system implementations.

## References

- `src/systems/`
- `agent-os/standards/architecture/system-boundary.md`
- `agent-os/standards/systems/dnd5e.md`
