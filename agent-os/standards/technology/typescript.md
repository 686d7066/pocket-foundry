# TypeScript

Standards for TypeScript source, scripts, and tests.

## Pattern/Rule

- Prefer TypeScript source files. Do not add JavaScript source files when TypeScript is used.
- Keep `strict` TypeScript assumptions intact.
- Use explicit types where they make API contracts clearer, especially at Foundry boundaries, adapter contracts, test fixtures, and parsed data.
- Avoid unsafe assumptions about API responses; validate or narrow unknown external data before use.
- Preserve strict import behavior used by this repo, including `.ts` import extensions where local source imports already use them.
- When creating or updating functions, add or update JSDoc documentation.
- Generated TypeScript files must clearly say they are generated and name the generator.

## Review Rules

- Check strict typing, error handling, broken template bindings, and unsafe assumptions about API responses.
- Flag new JavaScript source files unless they are explicitly required and approved.
- Flag missing or stale JSDoc on new or changed functions.

## Rationale

The repo is a TypeScript module with strict checking. Type contracts are the main guardrail between generic core code, Foundry APIs, and system-specific adapters.

## References

- `tsconfig.json`
- `agent-os/standards/technology/foundryvtt.md`
- `agent-os/standards/architecture/system-boundary.md`
