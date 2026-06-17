# Handlebars

Standards for Handlebars templates.

## Pattern/Rule

- Generic templates in `src/templates/` must stay system-independent.
- System-specific templates belong in `src/systems/<system-id>/templates/`.
- Generic templates may render adapter-provided data and adapter-provided template paths.
- Generic templates must not hard-code concrete system pane names, action names, labels, data paths, workflow assumptions, or system-owned template paths.
- Keep bindings aligned with the TypeScript view models that render each template.
- Prefer escaped text output. Render HTML only when the value is trusted, Foundry-enriched, or explicitly sanitized.
- Keep interactive controls accessible with labels, titles, or ARIA attributes when visible text is not enough.

## Review Rules

- Check for broken template bindings after view model changes.
- Flag system-specific concepts in generic templates.
- Flag duplicated partials when a shared partial or adapter-provided partial path is the correct boundary.
- Flag unsafe HTML rendering or direct injection of untrusted document/system data.

## Rationale

Handlebars templates are part of the system boundary. Generic UI should render adapter-neutral data, while system folders own concrete gameplay presentation.

## References

- `agent-os/standards/ui/templates.md`
- `agent-os/standards/technology/security.md`
- `agent-os/standards/architecture/system-boundary.md`
