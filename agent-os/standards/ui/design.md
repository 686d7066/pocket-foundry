# Design

Mobile UI and UX rules for Pocket Foundry.

## Pattern/Rule

- Prefer icons for compact actions where clear icons exist.
- Provide accessible labels or tooltips for icon actions.
- Preserve keyboard access, focus order, and visible focus states for interactive controls.
- Use ARIA roles and attributes when native semantics do not describe drawers, tabs, dialogs, or icon-only actions clearly.
- Keep touch targets large enough for mobile use without reducing information density unnecessarily.
- Respect reduced-motion preferences for animated transitions where practical.
- Avoid scroll traps. Make drawer, sheet, and overlay scrolling behavior intentional.
- Ensure text does not overflow buttons, tabs, list rows, or drawer headers.
- Avoid nested cards and decorative UI that reduces usable screen space.
- Use responsive and reusable templates and CSS with clear mobile and tablet breakpoints.

## Rationale

Pocket Foundry is a compact mobile-first FoundryVTT experience. UI density, accessibility, and responsive behavior matter more than decorative layout.

## References

- `src/templates/`
- `src/styles/`
