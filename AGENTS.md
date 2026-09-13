# Agent Instructions

Pocket Foundry uses Agent OS project instructions.

Start with the standards index:

- `agent-os/standards/index.yml`

Before changing files, read the matching standard listed in that index for the path or concern you are touching.

Non-negotiable repository guardrails:

- Never modify files inside `references/`, or any `References/` folder.
- Never manually modify anything inside `node_modules/` folders. Using NPM to do so is allowed.
- AI Agents may never edit `CHANGELOG.md` without explicit user approval.

## Agent orchestration

The root agent is responsible for:

- understanding the user's intent;
- coordinating the work;
- selecting and delegating to the appropriate specialized agents;
- evaluating subagent results;
- resolving conflicts between subagent findings;
- reviewing the overall result before considering the task complete.

Use the available custom agents according to their roles:

- `explorer`: investigate the repository, locate analogous implementations,
  trace dependencies and establish existing architectural patterns.
- `planner`: create an implementation plan for complex or cross-cutting work
  after the relevant repository architecture is understood.
- `implementer`: perform non-trivial implementation and refactoring.
- `debugger`: diagnose and resolve non-trivial bugs, regressions, failing tests
  and unexpected runtime behavior.
- `reviewer`: independently review substantial completed changes.

For non-trivial feature work:

1. Use `explorer` when repository investigation is necessary.
2. Use `planner` when the change is sufficiently complex or cross-cutting that
   an explicit implementation plan improves correctness.
3. Delegate substantial implementation to `implementer`.
4. Use `reviewer` after substantial implementation or refactoring.

For non-trivial debugging work, delegate to `debugger`. Use `explorer` first
when the affected subsystem is not sufficiently understood.

Do not perform substantial implementation directly in the root agent when the
`implementer` agent is available.

Before implementation, ensure that the relevant existing architecture and,
where possible, the closest analogous implementation have been identified.

All agents must treat existing repository patterns as authoritative over generic
best practices unless the task explicitly requires an architectural change.

The root agent must review subagent results against the user's request and the
existing repository architecture before considering the task complete.
