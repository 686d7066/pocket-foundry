# CSS And Tailwind

Standards for module CSS and Tailwind CLI usage.

## Pattern/Rule

- Keep module styles in `src/styles/` and system-specific styles in `src/systems/<system-id>/styles/`.
- Use responsive CSS with clear mobile and tablet breakpoints.
- Ensure text does not overflow buttons, tabs, list rows, or drawer headers.
- Avoid nested cards and decorative UI that reduces usable screen space.
- Build styles through the repo build tooling instead of editing `dist/` output.
- Keep Tailwind CLI usage in build tooling; do not introduce a separate styling pipeline without approval.

## Review Rules

- Check mobile and tablet layout behavior for changed UI.
- Flag styles that rely on concrete system concepts outside a system folder.
- Flag edits to built CSS output when the source CSS should be changed.

## Rationale

Pocket Foundry is mobile-first. Styling must preserve compact, usable layouts and remain compatible with the existing build pipeline.

## References

- `agent-os/standards/ui/design.md`
- `agent-os/standards/technology/npm-build.md`
