# System Boundary

Pocket Foundry core is system-agnostic. Concrete system behavior lives only inside that system's folder.

## Pattern/Rule

- The addon core must remain system-agnostic.
- Concrete system code, templates, pane names, action names, helpers, constants, Foundry system API usage, and system data paths are only allowed inside that system's own folder under `src/systems/<system-id>/`.
- Files outside a concrete system folder must never import from, reference, or hard-code files or concepts from any system folder.
- Core, router, services, and generic templates may only interact with character-sheet systems through the generic adapter contracts in `src/systems/character-sheet-adapter.ts` and adapter lookup/registration.
- If core needs new system behavior, extend the generic adapter contract and implement it inside the concrete system folder. Do not special-case a system outside its folder.

## Rationale

System support must scale beyond one game system without leaking dnd5e or future system details into shared runtime code.

## References

- `agent-os/standards/architecture/system-adapters.md`
- `agent-os/standards/systems/dnd5e.md`
