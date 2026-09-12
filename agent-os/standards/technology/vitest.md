# Vitest

Standards for automated tests.

## Pattern/Rule

- Use the existing Vitest suite for TypeScript tests.
- Keep shared-module tests and system-neutral fixtures in `tests/`.
- Keep each concrete system's tests in `src/systems/<system-id>/tests/`, with its own `vitest.config.ts` inside that system folder. The root config discovers system projects without naming concrete systems.
- Split mixed tests by ownership. Shared tests may verify adapter contracts with opaque fixtures, but must not require a particular system's mechanics or optional capabilities.
- `npm test` runs all projects. Use `npm test -- --project core` for shared tests or `npm test -- --project <system-id>` for one system.
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
