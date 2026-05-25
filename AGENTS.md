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

- Use `src` as the addon root. Do not recreate a nested `src\pocket-foundry\src` addon tree.
- Prefer TypeScript source files. Do not add JavaScript source files.
- Keep the current way of build and deploy
- Never modify files inside a `node_modules` folder.
- When asked a question, answer directly without making code changes unless the user also explicitly asks for changes.
- Once concrete code changes are agreed upon, do not deviate from the agreed code shape without informing the user first and getting agreement before changing files.
- After code changes, run `npm run check:unused` (equivalent to `tsc --noEmit --noUnusedLocals --noUnusedParameters`) and fix or explicitly report findings before final response.
- Do not deviate materially from the planned implementation, concept documents, or agreed UI/workflow shape when creating proof-of-concepts or implementation code. If a new element, shortcut, screen, workflow, grouping, navigation item, or layout pattern is not clearly supported by the docs or prior agreement, ask before adding it.
- Proof-of-concept UI must follow the provided reference images and concept documents closely. Do not replace dense sheet layouts with simple long lists or oversized generic cards when the docs or references call for information-dense tables, strips, grids, clusters, or grouped panels.
- Do not copy branding, strings, identifiers, module names from reference addons.

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

- When creating or updating functions make sure JsDoc documentation is added/updated as well.

## Tests

- When creating new features make sure tests are added to the existing test suite.
- When updating existing code, evaluate if tests need to be updated or if the updated code is wrong.
- After adding or updating code always run all tests to check for potential errors.

## Review guidelines

- Focus on real defects, regressions, security issues, missing validation, broken tests, and risky behavior changes.
- Do not comment on subjective style unless it affects maintainability or correctness or violates previous instructions.
- For TypeScript code, check strict typing, error handling, broken template bindings, and unsafe assumptions about API responses.
- For tests, flag missing coverage for changed behavior.
