# TypeScript

Standards for TypeScript source, scripts, and tests.

## Type Safety

- Prefer TypeScript source files. Do not add JavaScript source files when TypeScript is used.
- Keep `strict` TypeScript assumptions intact.
- Use explicit types where they make API contracts clearer, especially at Foundry boundaries, adapter contracts, test fixtures, and parsed data.
- Avoid unsafe assumptions about API responses; validate or narrow unknown external data before use.
- Avoid broad type assertions such as `as any`, double assertions, and non-null assertions. Narrow unknown data instead.
- Keep parsing, narrowing, and formatting close to the boundary where external data enters the module.
- Prefer typed constants or discriminated unions for action ids, pane ids, route kinds, and storage keys.

## Style And Maintainability

- Prefer small, cohesive functions with names that describe the domain behavior they perform.
- Keep public module exports intentional. Do not export helpers only to make unrelated code reach across boundaries.
- Prefer immutable data shaping for view models and route state. Use mutation only when it is local, obvious, and simpler.
- Avoid boolean parameter chains when an options object or named helper would make call sites clearer.
- Keep functions free of hidden Foundry global dependencies when the dependency can be passed in or isolated behind a service.
- Use comments to explain non-obvious Foundry behavior, lifecycle constraints, or compatibility assumptions. Do not narrate obvious code.

## Imports And Files

- Preserve strict import behavior used by this repo, including `.ts` import extensions where local source imports already use them.
- Generated TypeScript files must clearly say they are generated and name the generator.

## Documentation

- When creating or updating functions, add or update JSDoc documentation.

## Review Rules

- Check strict typing, error handling, broken template bindings, and unsafe assumptions about API responses.
- Flag new JavaScript source files unless they are explicitly required and approved.
- Flag missing or stale JSDoc on new or changed functions.
- Flag confusing names, oversized functions, broad type assertions, hidden cross-boundary dependencies, and unnecessary exports when they affect maintainability or correctness.
- Check that helper extraction preserves the system boundary instead of creating shared system-specific utilities.
- Check that view-model code stays deterministic enough to test without a live Foundry world where practical.
- Apply `agent-os/standards/technology/error-handling.md` when code crosses Foundry, storage, adapter, route, or rendering boundaries.

## Rationale

The repo is a TypeScript module with strict checking. Type contracts are the main guardrail between generic core code, Foundry APIs, and system-specific adapters.

## References

- `tsconfig.json`
- `agent-os/standards/technology/foundryvtt.md`
- `agent-os/standards/technology/error-handling.md`
- `agent-os/standards/architecture/system-boundary.md`
