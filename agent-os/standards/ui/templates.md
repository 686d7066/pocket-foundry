# Templates

Rules for `src/templates`, which contains system-independent Pocket Foundry templates and shared partials.

## Pattern/Rule

Generic templates may render adapter-provided data and adapter-provided template paths, but must not know the internals of a concrete game system.

Generic templates may own:

- Shell layout.
- Shared empty states, navigation, drawers, and generic controls.
- Adapter-neutral character sheet chrome.
- Rendering generic properties exposed by adapter contracts.

Generic templates must:

- Leave system-specific templates inside `src/systems/<system-id>/templates/`.
- Avoid hard-coding concrete system template paths from `src/systems/dnd5e/` or any other system folder.
- Avoid hard-coding concrete system pane names, action names, labels, data paths, or workflow assumptions.
- Render adapter-provided partial paths or adapter-provided opaque data when system-specific content is needed.

## Rationale

Templates shared by the shell must remain adapter-neutral so new systems can provide their own content safely.

## References

- `src/templates/`
- `agent-os/standards/architecture/system-boundary.md`
