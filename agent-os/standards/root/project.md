# Project

Pocket Foundry is a FoundryVTT v14+ addon implemented from `src/`.

## Pattern/Rule

- Treat `src/` as the addon root.
- Keep build and deploy tooling in the workspace root.
- Keep generated build output in `dist/pocket-foundry/`.
- Use Agent OS standards from `agent-os/standards/index.yml`.
- Do not create Agent OS Claude slash commands; this project is not using Claude.

## Rationale

The source tree is the canonical addon implementation. Root-level tooling supports building, testing, and packaging without becoming part of the runtime addon.

## References

- `agent-os/standards/index.yml`
- `README.md`
