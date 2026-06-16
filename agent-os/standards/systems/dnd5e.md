# dnd5e System

Rules for `src/systems/dnd5e`, the only allowed home for dnd5e-specific character sheet support.

## Pattern/Rule

All dnd5e pane definitions, view models, action names, templates, helper logic, dnd5e API usage, and dnd5e data-path knowledge belong in `src/systems/dnd5e/`.

The dnd5e adapter may:

- Define dnd5e character panes such as Details, Inventory, Features, Spells, Effects, Biography, and Favorites.
- Build dnd5e pane view models from Foundry and dnd5e document APIs.
- Implement dnd5e pane actions through the adapter.
- Own dnd5e-specific templates and partials.
- Use dnd5e-specific actor, item, effect, activity, rest, spellcasting, advancement, and resource APIs.

The dnd5e adapter must:

- Keep dnd5e-specific code inside `src/systems/dnd5e/`.
- Avoid imports from another concrete system folder.
- Interact with core, router, services, and generic templates only through the generic adapter contract in `src/systems/character-sheet-adapter.ts`.
- Avoid moving dnd5e pane actions, template paths, or data mapping into `src/core`, `src/router`, `src/services`, or generic templates.

The dnd5e adapter must not own generic shell lifecycle, router history, global search orchestration, core mobile settings, or cross-system behavior intended for future adapters.

When a dnd5e need exposes a missing generic shell capability, extend the adapter contract and keep the dnd5e implementation here.

## Research

Depending on the developer environment, the dnd5e system may be available in `references/systems/dnd5e` for read-only research.

If that folder does not exist, use `https://github.com/foundryvtt/dnd5e` or official FoundryVTT API documentation.

## References

- `src/systems/dnd5e/`
- `agent-os/standards/architecture/system-adapters.md`
- `agent-os/standards/repository/references.md`
