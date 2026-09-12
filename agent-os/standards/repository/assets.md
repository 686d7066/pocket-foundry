# Assets

Standards for static images, icons, stylesheets, templates, and generated module assets.

## Pattern/Rule

- Keep source assets under `src/` in the folder owned by the feature or system that uses them.
- Keep system-specific assets under `src/systems/<system-id>/assets/`.
- Treat `dist/pocket-foundry/` assets as generated output unless the build tooling explicitly documents otherwise.
- Use clear, stable file names that describe the asset's role instead of temporary or source-tool names.
- Prefer optimized assets sized for their actual UI use. Avoid adding large originals when a compressed runtime asset is enough.
- Do not add binary assets to `references/`, `References/`, or `node_modules/`.
- When assets are generated or derived from source material, record the generator or source in nearby notes when licensing or reproduction matters.

## Review Rules

- Flag large or unoptimized assets that affect module size without a clear need.
- Flag system-specific assets outside the owning system folder.
- Flag manual edits to built assets when source assets or build tooling should change instead.
- Check that new assets are referenced by source templates, styles, or build scripts, not only by generated output.

## Rationale

Pocket Foundry ships as a Foundry module. Asset placement and size affect install size, load behavior, and the system boundary.

## References

- `src/`
- `src/systems/`
- `dist/pocket-foundry/`
- `agent-os/standards/technology/npm-build.md`
