# Handlebars

Standards for Handlebars templates.

## Pattern/Rule

- Generic templates in `src/templates/` must stay system-independent.
- System-specific templates belong in `src/systems/<system-id>/templates/`.
- Generic templates may render adapter-provided data and adapter-provided template paths.
- Generic templates must not hard-code concrete system pane names, action names, labels, data paths, workflow assumptions, or system-owned template paths.
- Keep bindings aligned with the TypeScript view models that render each template.

## Review Rules

- Check for broken template bindings after view model changes.
- Flag system-specific concepts in generic templates.
- Flag duplicated partials when a shared partial or adapter-provided partial path is the correct boundary.

## Rationale

Handlebars templates are part of the system boundary. Generic UI should render adapter-neutral data, while system folders own concrete gameplay presentation.

## References

- `agent-os/standards/ui/templates.md`
- `agent-os/standards/architecture/system-boundary.md`
