# Pocket Foundry

Pocket Foundry is a Foundry VTT module that provides a mobile-optimized player experience, including character-sheet workflows and compact content browsing.

- Module ID: `pocket-foundry`
- Foundry compatibility: v14 (`minimum: 14`, `verified: 14`)
- Current built-in system adapter: `dnd5e`
- Release notes: [CHANGELOG.md](CHANGELOG.md)

## Features

- Mobile shell UI with bottom navigation and touch-friendly interactions
- Character picker with favorites
- Mobile character-sheet panes for D&D 5e:
  - Favorites
  - Inventory
  - Features
  - Spells
  - Effects
  - Details
  - Biography
- Search, recents, item detail, and journal browsing views
- Combat view that respects Foundry visibility and optionally supports the [`inverted-encounter-visibility`](https://github.com/686d7066/inverted-encounter-visibility) module flag when that module is active
- User settings for:
  - Mobile View toggle
  - Character Sheet Banner toggle
  - Color-Blind Mode

## Build From Source

## Module Versioning

Module versions use `x.y.z`:

- `x` - Major version equals Foundry VTTs major version developed against
- `y` - module feature version
- `z` - module patch version

When a PR changes the module version, generate and commit the changelog entry after the PR has been approved and before merging:

```bash
npm run changelog
```

### Prerequisites

- Node.js (current LTS recommended)
- npm

### Commands

```bash
npm install
npm test
npm run build
```

Build output is generated at:

- `dist/pocket-foundry/`

Copy this folder into your Foundry VTT module folder to use.

Useful scripts:

- `npm run clean` - remove build output
- `npm run check:unused` - TypeScript no-unused checks
- `npm run test` - type checks + Vitest suite

## Automatic Issue Linking

After `.github/workflows/link-pr-issue.yml` is present on the default branch, pull request branches named `<issue-number>-<description>` automatically receive a closing reference in their description. For example, opening a pull request from `37-recover-search-loading-state` appends `Closes #37` after verifying that #37 is an open issue in this repository.

The workflow runs when a pull request is opened, reopened, edited, or receives a new push, so existing pull requests are handled on their next matching event. GitHub closes the linked issue when the pull request is merged into the default branch; closing an unmerged pull request does not close the issue.

## Install

### Manual local install (recommended for development)

1. Build the module:
   - `npm run build`
2. Copy `dist/pocket-foundry` into your Foundry Data modules directory as:
   - `<FoundryData>/Data/modules/pocket-foundry`
3. In Foundry, enable **Pocket Foundry** for your world.

## Project Layout

- `src/` - module source (TypeScript, templates, styles)
- `scripts/` - build and deployment scripts
- `src/tests/` - shared-module tests and system-neutral fixtures
- `src/systems/<system-id>/tests/` - system-specific tests
- `tests/` - build-script and workflow tests
- `dist/pocket-foundry/` - built module output
