# npm Build Tooling

Standards for npm scripts, tsx scripts, esbuild bundling, and generated output.

## Pattern/Rule

- Use npm scripts from `package.json` for project commands.
- Use TypeScript for repo scripts under `scripts/`.
- Keep build and deployment tooling in the workspace root or `scripts/`.
- Treat `dist/pocket-foundry/` as generated output.
- Do not edit generated build output when the source in `src/` or `scripts/` should be changed.
- Keep generated files clearly marked with the generator name.
- Keep source assets and generated assets aligned with `agent-os/standards/repository/assets.md`.
- Run `npm run build` when changes affect build scripts, module packaging, generated adapter registration, CSS compilation, or static asset output.

## Review Rules

- Check that build script changes preserve `src/` as the addon source root.
- Check that generated adapter registration remains generated glue, not gameplay logic.
- Flag new build dependencies or pipelines that are not reflected in `package.json` and `agent-os/product/tech-stack.md`.

## Rationale

The module is built from TypeScript, templates, styles, and static assets into `dist/pocket-foundry/`. Source changes should flow through the build pipeline.

## References

- `package.json`
- `scripts/build.ts`
- `agent-os/product/tech-stack.md`
- `agent-os/standards/repository/assets.md`
