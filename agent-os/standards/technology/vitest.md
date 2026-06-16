# Vitest

Standards for automated tests.

## Pattern/Rule

- Use the existing Vitest suite for TypeScript tests.
- When creating new features, add tests to the existing test suite.
- After adding or updating code, run all tests with `npm test`.
- When tests fail, do not automatically adjust them. Let the user decide whether logic or tests should change.
- Keep tests focused on behavior and boundary contracts, especially system-agnostic behavior and template bindings.

## Review Rules

- Flag missing coverage for changed behavior.
- Flag tests that encode system-specific behavior outside concrete system boundaries.
- Check that template and view model changes have coverage for important rendering or binding behavior.

## Rationale

The test suite protects strict TypeScript behavior, Foundry-facing service behavior, system boundary rules, and UI model/template contracts.

## References

- `vitest.config.ts`
- `tests/`
- `agent-os/standards/technology/typescript.md`
