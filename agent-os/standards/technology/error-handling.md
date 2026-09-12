# Error Handling

Standards for failures, user feedback, logging, and graceful degradation.

## Pattern/Rule

- Prefer explicit failure handling at Foundry, adapter, storage, route, and rendering boundaries.
- Use user-facing Foundry notifications only for actionable problems the player or GM can understand.
- Use console logging sparingly for developer diagnostics. Keep logs concise and avoid full document payloads.
- Let permission, visibility, missing document, and stale UUID failures degrade to empty states, disabled actions, warnings, or no-ops where practical.
- Do not swallow errors silently when the failure prevents a requested user action from completing.
- Avoid throwing during module startup for recoverable local storage, setting, route, template, or optional system-adapter issues.
- Preserve original error context when rethrowing or wrapping errors.
- Keep async handlers resilient to stale route, stale actor, stale document, and unmounted DOM state.

## Review Rules

- Flag unhandled promises in event handlers, lifecycle hooks, and adapter actions.
- Flag silent catches that hide broken user workflows.
- Flag noisy logs or notifications that expose private document data or annoy users during normal play.
- Check that recoverable startup and storage failures do not prevent the mobile shell from loading.
- Check that action failures leave UI state consistent and do not duplicate route changes or rerenders.

## Rationale

Pocket Foundry runs inside an interactive Foundry client. Failures should be visible when users can act on them, quiet when they are expected edge cases, and never leave the mobile shell in a corrupted state.

## References

- `agent-os/standards/technology/foundryvtt.md`
- `agent-os/standards/architecture/lifecycle.md`
- `agent-os/standards/technology/security.md`
