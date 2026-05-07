# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## How it works

1. **When making a change**: Run `pnpm changeset` to create a changeset file describing your changes.
2. **On merge to main**: The GitHub Actions "Version & Release" workflow detects pending changesets and opens a "Version Packages" PR.
3. **When the version PR is merged**: Package versions are bumped, changelogs are updated, and git tags are created.

## Adding a changeset

```bash
pnpm changeset
```

Follow the prompts to:
- Select which packages are affected
- Choose the bump type (patch / minor / major)
- Write a summary of the change

This creates a markdown file in `.changeset/` that should be committed with your PR.

## Bump types

- **patch** — Bug fixes, internal refactors, dependency updates
- **minor** — New features, non-breaking enhancements
- **major** — Breaking changes to the public API

## Linked packages

All library packages (`@agent-profiler/core`, `@agent-profiler/pricing`, `@agent-profiler/ui`, adapters, etc.) are **linked** — they always version together.

## Ignored packages

- `@agent-profiler/desktop` — follows its own release cadence via platform builds
- `@agent-profiler/docs` — documentation site, not versioned
