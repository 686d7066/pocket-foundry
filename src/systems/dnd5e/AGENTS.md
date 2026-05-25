# `src/systems/dnd5e`

This folder is the only allowed home for dnd5e-specific character sheet support.

All dnd5e pane definitions, view models, action names, templates, helper logic, dnd5e API usage, and dnd5e data-path knowledge belong here.

Depending on the developers environment you may find the dnd5e system in `references/systems/dnd5e` to look up details.
If this folder does not exist, look it up on `https://github.com/foundryvtt/dnd5e`

## Boundary Rules

- dnd5e-specific code must stay inside this folder.
- Files outside this folder must not import from this folder directly, except generated or explicit adapter registration glue.
- Core, router, services, and generic templates must interact with dnd5e only through the generic adapter contract in `src/systems/character-sheet-adapter.ts`.
- Do not move dnd5e pane actions, template paths, or data mapping into `src/core`, `src/router`, `src/services`, or generic templates.

## Allowed Responsibilities

- Define dnd5e character panes such as Details, Inventory, Features, Spells, Effects, Biography, and Favorites.
- Build dnd5e pane view models from Foundry and dnd5e document APIs.
- Implement dnd5e pane actions through the adapter.
- Own dnd5e-specific templates and partials.
- Use dnd5e-specific actor, item, effect, activity, rest, spellcasting, advancement, and resource APIs.

## Not Allowed

- Generic shell lifecycle, router history, global search orchestration, or core mobile settings.
- Cross-system behavior intended for future adapters.
- Imports from another concrete system folder.

When a dnd5e need exposes a missing generic shell capability, extend the adapter contract and keep the dnd5e implementation here.
