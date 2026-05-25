# `src/systems`

This folder contains the system-adapter layer for Pocket Foundry.

The addon core is system-agnostic. Files outside a concrete system folder must only talk to systems through the generic adapter contracts in this folder, such as `character-sheet-adapter.ts` and `character-sheet-adapter-registry.ts`.

## Folder Roles

`src/systems/character-sheet-adapter.ts` defines the system-neutral contract for character sheet adapters.

`src/systems/character-sheet-adapter-registry.ts` owns adapter registration and lookup for the currently active Foundry system.

`src/systems/character-sheet-adapters.generated.ts` is generated registration glue. Do not add gameplay logic or system-specific view logic there.

`src/systems/<system-id>/` contains all implementation details for one Foundry system.

## System Boundary Rules

System-specific code, templates, constants, action names, view models, helpers, CSS assumptions, and Foundry system API usage must stay inside that system's own folder.

### Example

For dnd5e, that means all dnd5e-specific implementation belongs under:

```text
src/systems/dnd5e/
```

No file outside `src/systems/dnd5e/` may import, reference, or hard-code dnd5e implementation files, dnd5e templates, dnd5e pane names, dnd5e action names, or dnd5e data paths.

The same rule applies to every future system folder. A `pf2e` adapter must stay under `src/systems/pf2e/`, a `CoC7` adapter under `src/systems/CoC7/`, and so on.

## Core Interaction

Core code must remain generic. It may:

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

If core needs something new, add a generic capability to the adapter contract and implement it inside each affected system folder.

## Template Rules

- System-owned templates must live inside the matching system folder.
- Concrete system templates may use that system's pane names, action names, and view model shapes.
- Generic shell templates may render adapter-provided data and adapter-provided template paths, but must not hard-code a concrete system's templates or domain concepts.

## Adding A New System

Create a new folder under `src/systems/<system-id>/`.

Implement the generic adapter contract inside that folder.

Keep all system-specific builders, actions, templates, helpers, and constants inside that folder.

Expose only the adapter entry point needed by the system registration layer.

Do not modify core, router, services, or another system folder to special-case the new system.
