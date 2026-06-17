# Vitest

Standards for automated tests.

## Pattern/Rule

- Use the existing Vitest suite for TypeScript tests.
- When creating new features, add tests to the existing test suite.
- After adding or updating code, run all tests with `npm test`.
- When tests fail, do not automatically adjust them. Let the user decide whether logic or tests should change.
- Keep tests focused on behavior and boundary contracts, especially system-agnostic behavior and template bindings.
- Prefer clear fixture builders and typed mocks over large inline object literals when a test needs repeated Foundry-like data.
- Keep mocks scoped to the test file unless the behavior is shared across multiple suites.
- Avoid brittle tests that only assert implementation details. Assert externally visible behavior, adapter contracts, parsed output, and rendered template bindings.
- Add regression tests for bug fixes whenever the failure can be reproduced without a live Foundry world.

## Review Rules

- Flag missing coverage for changed behavior.
- Flag tests that encode system-specific behavior outside concrete system boundaries.
- Check that template and view model changes have coverage for important rendering or binding behavior.
- Flag broad snapshot-style tests that can pass while important behavior is wrong.
- Check that test names describe the behavior being protected.

## Rationale

The test suite protects strict TypeScript behavior, Foundry-facing service behavior, system boundary rules, and UI model/template contracts.

## References

- `vitest.config.ts`
- `tests/`
- `agent-os/standards/technology/typescript.md`
- `agent-os/standards/architecture/system-boundary.md`
