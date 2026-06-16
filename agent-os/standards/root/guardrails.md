# Guardrails

Repository-wide file, collaboration, and review rules.

## Pattern/Rule

- Never modify files inside `node_modules/`, `references/`, or any `References/` folder.
- Do not edit `CHANGELOG.md` without explicit user approval.
- Apply the technology-specific standard for every language, framework, or toolchain touched by a change.

## Collaboration Rules

- When asked a question, answer the question directly without making code changes unless changes are explicitly requested.
- Once a concrete code shape is agreed upon, do not deviate from it without informing the user and getting agreement before changing files.
- Keep answers short but precise instead of writing essays.

## Review Rules

- Focus on real defects, regressions, security issues, missing validation, broken tests, and risky behavior changes.
- Do not comment on subjective style unless it affects maintainability, correctness, or these standards.
- Apply technology-specific review rules from `agent-os/standards/technology/`.

## Rationale

These rules keep generated, vendor, and reference material stable while routing stack-specific guidance to the standards that own it.
