# Project Instructions

This repository is for implementing `src` as the FoundryVTT v14+ addon `pocket-foundry` root.
Build and deploy tooling belongs in the workspace root.

## System Boundary

- The addon core must remain system-agnostic.
- Concrete system code, templates, pane names, action names, helpers, constants, Foundry system API usage, and system data paths are only allowed inside that system's own folder under `src/systems/<system-id>/`.
- Files outside a concrete system folder must never import from, reference, or hard-code files or concepts from any system folder.
- Core, router, services, and generic templates may only interact with character-sheet systems through the generic adapter contracts in `src/systems/character-sheet-adapter.ts` and adapter lookup/registration.
- If core needs new system behavior, extend the generic adapter contract and implement it inside the concrete system folder. Do not special-case a system outside its folder.

## Command And File Guardrails

- Prefer TypeScript source files. Do not add JavaScript source files.
- Never modify files inside a `node_modules` folder.

## Research Permissions

- Use Context7 to look up FoundryVTT v14 APIs and related libraries.
- Alternatively access `https://foundryvtt.com/api/` to learn about the FoundryVTT API.
- Prefer official FoundryVTT API documentation for API behavior. If docs are ambiguous, record the assumption in code comments or implementation notes.

## Design And UX Expectations

- Prefer icons for compact actions where clear icons exist, with accessible labels/tooltips.
- Ensure text does not overflow buttons, tabs, list rows, or drawer headers.
- Avoid nested cards and decorative UI that reduces usable screen space.
- Use responsive and reusable templates and CSS with clear mobile/tablet breakpoints.

## Documentation

- When creating or updating functions make sure JsDoc documentation is added or updated respectively as well.

## Tests

- When creating new features make sure tests are added to the existing test suite.
- When tests fail, do not automatically adjust them. Let the user decide wether the test fails because of errors in the logic or because the test needs to be adjusted.
- After adding or updating code always run all tests to check for potential errors.

## Review guidelines

- Focus on real defects, regressions, security issues, missing validation, broken tests, and risky behavior changes.
- Do not comment on subjective style unless it affects maintainability or correctness or violates previous instructions.
- For TypeScript code, check strict typing, error handling, broken template bindings, and unsafe assumptions about API responses.
- For tests, flag missing coverage for changed behavior.
