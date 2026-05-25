# `src/templates`

This folder contains system-independent Pocket Foundry templates and shared partials.

Generic templates may render adapter-provided data and adapter-provided template paths, but must not know the internals of a concrete game system.

## Boundary Rules

- System-specific templates belong inside `src/systems/<system-id>/templates/`.
- Generic templates must not hard-code concrete system template paths from `src/systems/dnd5e/` or any other system folder.
- Generic templates must not hard-code concrete system pane names, action names, labels, data paths, or workflow assumptions.
- If a generic template needs system-specific content, render an adapter-provided partial path or adapter-provided opaque data.

## Allowed Responsibilities

- Shell layout.
- Shared empty states, navigation, drawers, and generic controls.
- Adapter-neutral character sheet chrome.
- Rendering generic properties exposed by adapter contracts.
