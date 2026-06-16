# FoundryVTT

Standards for FoundryVTT v14+ API usage.

## Pattern/Rule

- Pocket Foundry targets FoundryVTT v14+.
- Prefer Foundry document APIs, UUID lookup, permission APIs, collection abstractions, and lifecycle hooks over raw data-shape assumptions.
- Preserve Foundry permission and visibility behavior in user-facing workflows.
- Keep concrete game-system API usage inside that system's folder under `src/systems/<system-id>/`.
- Use adapter contracts when shared code needs system behavior.
- Use Context7 or official FoundryVTT API documentation for API behavior. If documentation is ambiguous, record the assumption in code comments or implementation notes.

## Review Rules

- Flag hard-coded system data paths outside concrete system folders.
- Flag permission, visibility, ownership, or UUID lookup behavior that bypasses Foundry APIs.
- Check assumptions against FoundryVTT v14 docs when behavior is not obvious.

## Rationale

FoundryVTT owns document behavior, permissions, and system APIs. Shared code must stay compatible with Foundry and system-agnostic.

## References

- `agent-os/standards/root/research.md`
- `agent-os/standards/architecture/system-boundary.md`
- `agent-os/standards/architecture/services.md`
