# Security And Data Safety

Standards for user-provided data, rendered content, routes, storage, and Foundry document access.

## Pattern/Rule

- Treat Foundry documents, system data, route parameters, UUIDs, storage values, enriched content, and template input as untrusted until narrowed or validated.
- Prefer Handlebars escaping for text. Only render trusted or Foundry-sanitized HTML through explicit template paths.
- Do not introduce direct `innerHTML` writes unless the content is sanitized, the source is documented, and no safer rendering path fits.
- Preserve Foundry permissions, ownership, visibility, and document lookup behavior before exposing actor, item, journal, combat, or effect data.
- Validate route and action identifiers against known generic contracts or adapter-provided capabilities before executing behavior.
- Keep local storage and settings data version-tolerant. Handle missing, malformed, or stale values without breaking startup.
- Do not log sensitive player content, private GM data, or full document payloads unless the user explicitly asks for debugging output.
- Keep external links and rich-text links constrained to Foundry-supported behavior and safe browser navigation patterns.

## Review Rules

- Flag unsafe HTML rendering, direct DOM injection, unchecked route/action execution, and unvalidated storage reads.
- Flag permission, ownership, visibility, or UUID lookup shortcuts that bypass Foundry APIs.
- Check that failures from malformed input degrade to empty states, warnings, or no-ops instead of throwing during startup.
- Check that logs and notifications do not expose private document data unnecessarily.

## Rationale

Pocket Foundry renders data from Foundry worlds and game systems into a compact mobile UI. Defensive parsing and Foundry-native permission checks protect player privacy and keep corrupt local state from breaking the module.

## References

- `agent-os/standards/technology/foundryvtt.md`
- `agent-os/standards/technology/handlebars.md`
- `agent-os/standards/architecture/services.md`
- `agent-os/standards/architecture/router.md`
