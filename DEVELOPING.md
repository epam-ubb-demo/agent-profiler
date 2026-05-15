# Developing

This guide covers the local development workflow for the **Agent Profiler** monorepo.

## Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | ≥ 20.0.0 | LTS recommended |
| pnpm | ≥ 9.0.0 | Installed via `corepack enable` |
| Git | ≥ 2.40 | For worktree / sparse-checkout support |

### Enabling pnpm via Corepack

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Getting Started

```bash
# Clone the repository
git clone https://github.com/epam-ubb-demo/agent-profiler.git
cd agent-profiler

# Install all dependencies
pnpm install

# Run the full build
pnpm build

# Start development mode
pnpm dev
```

## Workspace Commands

All commands are orchestrated via [Turborepo](https://turbo.build/repo):

| Command | Description |
| ------- | ----------- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start dev servers across the monorepo |
| `pnpm lint` | Lint all workspaces with ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run tests with Vitest |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |

### Filtering to a single workspace

```bash
# Run build for a specific package
pnpm --filter @agent-profiler/core build

# Run tests for a specific package
pnpm --filter @agent-profiler/core test
```

## Creating a New Package

1. Create a directory under the appropriate workspace root:
   - `packages/` — shared libraries (domain logic, utilities)
   - `apps/` — deployable applications
   - `tooling/` — internal build/lint/config packages

2. Add a `package.json` with the scope prefix `@agent-profiler/`:

```json
{
  "name": "@agent-profiler/my-package",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@agent-profiler/tsconfig-base": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

3. Add a `tsconfig.json` extending the base:

```json
{
  "extends": "../../tooling/tsconfig-base/tsconfig.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

4. Run `pnpm install` to link the new workspace.

## Running Tests

Tests use [Vitest](https://vitest.dev/). Each package can have its own `vitest.config.ts`:

```bash
# Run all tests
pnpm test

# Run tests in watch mode for a package
pnpm --filter @agent-profiler/core exec vitest
```

## Desktop App UI Stack

The desktop app (`apps/desktop`) uses [EPAM UUI](https://uui.epam.com/) with the **Loveship** skin for all UI components and theming.

### Key packages

| Package | Purpose |
| ------- | ------- |
| `@epam/uui-core` | Core services, `ContextProvider` |
| `@epam/uui` | Higher-level components |
| `@epam/uui-components` | Base component primitives |
| `@epam/loveship` | Loveship skin (buttons, modals, etc.) |
| `@epam/assets` | EPAM brand assets (icons, fonts) |

### Application bootstrap

- The app root in `main.tsx` wraps the component tree with `<ContextProvider>` from `@epam/uui-core`.
- Loveship CSS is imported in `main.tsx` (global styles for the skin).
- An `AppShell` component provides the EPAM-branded header, logo, and navigation.

### Theming

Dark and light themes are toggled by switching CSS classes on the root element:

| Theme | CSS class |
| ----- | --------- |
| Light | `.uui-theme-loveship` |
| Dark  | `.uui-theme-loveship_dark` |

The selected theme is persisted in `localStorage`.

### Icons

Inline SVG icon components live in `components/icons.tsx`. Each component is typed as the UUI `Icon` type so it can be passed directly to UUI component `icon` props.

## Desktop App Testing Utilities

The desktop app has a custom test-render wrapper that should be used instead of raw `@testing-library/react` `render`:

```ts
import { render } from './__tests__/test-utils';
```

### What it does

- Wraps every rendered component in the UUI `ContextProvider` (required for UUI services).
- Flushes the asynchronous UUI context initialisation before returning.

### Setup file

The Vitest setup file (`vitest.setup.ts`) provides polyfills needed by UUI in a jsdom environment:

- `ResizeObserver` — stubbed globally.
- `localStorage` — a simple in-memory implementation.

> **Rule of thumb:** always import `render` from the custom test utilities when writing or updating desktop app tests.

## Architecture Boundaries

ESLint enforces layered architecture rules:

- **packages/** must not import from **apps/** (packages are reusable libraries)
- **packages/core** must not import from **packages/ui** (core is UI-agnostic)

These rules are configured in the root `eslint.config.mjs`.

## Copilot CLI Event Schema Evolution

### Background

Agent Profiler parses raw `events.jsonl` files produced by the GitHub Copilot CLI.
The CLI's event format is **not** a stable public API and can change without notice.

For example, the `session.shutdown` event changed from flat fields (`inputTokens`,
`outputTokens`, `requestCount` directly on each model entry) to nested sub-objects
(`usage: { inputTokens, … }`, `requests: { count, cost }`).

### Data Flow

- Raw `events.jsonl` files in `~/.copilot/session-state/<uuid>/` are the **immutable source of truth**.
- Sessions are always re-parsed from raw events on load — there is no persistent cache.
- This means parser fixes retroactively fix **all** existing sessions. No data migration is ever needed.
- The parsing entry point is `parseCopilotCliSession()` in `packages/adapters-copilot-cli/src/index.ts`.

### Per-Field Fallback Strategy

Instead of detecting the format version and branching, the parser uses **per-field fallback**: it tries the newest known location first, then falls back to older locations.

All format-specific extraction lives in `normalise-model-metrics.ts`. The normaliser handles **two structural formats**: a dictionary (keys are model names) and a legacy array (`modelId` field on each element). Within each entry, the `extractEntry()` function applies per-field fallback:

```ts
inputTokens:     safeInt(usage['inputTokens']      ?? flat['inputTokens']),
cacheReadTokens: safeInt(
  usage['cacheReadTokens']  ?? usage['cacheReadInputTokens']
  ?? flat['cacheReadTokens'] ?? flat['cacheReadInputTokens'],
),
cacheWriteTokens: safeInt(
  usage['cacheWriteTokens'] ?? usage['cacheCreationInputTokens']
  ?? flat['cacheWriteTokens'] ?? flat['cacheCreationInputTokens'],
),
reasoningTokens: safeInt(usage['reasoningTokens']   ?? flat['reasoningTokens']),
requestCount:    safeInt(requests['count']           ?? flat['requestCount']),
```

This tries the nested `usage` / `requests` sub-objects first, then the flat field on the model entry. Cache field names are also aliased across CLI versions (`cacheCreationInputTokens` → `cacheWriteTokens`, `cacheReadInputTokens` → `cacheReadTokens`). The approach handles old, new, mixed, and partial formats gracefully without explicit version detection.

### Post-Parse Validation

After parsing, `parseCopilotCliSession()` checks whether shutdown metrics exist but all token counts are zero. If so, `parseStatus` is set to `'partial'` with a diagnostic warning about a possible schema mismatch.

This acts as an early-warning system: if the CLI changes format again and the fallback chain does not cover it, the validation will catch it and surface a visible warning in the UI.

### Adding Support for a New Format

When the Copilot CLI changes its event format again:

1. **Obtain a sample** — capture a session with the new format and inspect the raw `events.jsonl`.
2. **Update the fallback chain** — in `normalise-model-metrics.ts`, extend the field extraction in `extractEntry()` to try the new location first, keeping existing fallback paths. Note that `event-handlers.ts` no longer contains format-specific logic — it delegates to `normaliseModelMetrics()`.
3. **Add test fixtures** — create a new fixture file in `__tests__/fixtures/` with the new format. Add tests covering the new format and verify that old-format tests still pass.
4. **Verify post-parse validation** — confirm that the validation check in `index.ts` does not trigger a false warning for the new format.
5. **Run all tests**:
   ```bash
   pnpm --filter @agent-profiler/adapters-copilot-cli test
   ```

## Release Pipeline (Electron Desktop)

The `.github/workflows/release-electron.yml` workflow builds signed (when secrets are configured) Electron installers for macOS, Windows and Linux, then publishes them to a GitHub Release.

### Trigger

The workflow runs on any tag pushed to `main` matching the pattern:

```
@agent-profiler/desktop@<version>
```

For example:

- `@agent-profiler/desktop@0.1.0` — stable release.
- `@agent-profiler/desktop@0.1.0-rc.1` — pre-release (detected from the SemVer dash, marked as such on GitHub Releases).

### Cutting a release

1. From an up-to-date `main`, edit `apps/desktop/package.json` and bump `version` to the target SemVer.
2. Make sure `CHANGELOG.md` has a `## [Unreleased]` section listing the user-visible changes for this release (the workflow refuses to run if it is missing or empty).
3. Commit the version bump on `main` (PR is fine, just merge first).
4. Tag and push:

   ```bash
   git checkout main && git pull
   git tag '@agent-profiler/desktop@0.1.0'
   git push origin '@agent-profiler/desktop@0.1.0'
   ```

5. Watch the workflow under **Actions → Release Electron App**. The `prepare` job stamps the CHANGELOG (renaming `[Unreleased]` → `[<version>] - <UTC date>`, scaffolding a new empty `[Unreleased]`) and commits the result back to `main` with `[skip ci]`.

### What gets published

- macOS: `.dmg` (x64 + arm64) and `latest-mac.yml` for auto-update.
- Windows: NSIS `.exe` (x64) and `latest.yml`.
- Linux: `.AppImage` and `.deb` (x64) and `latest-linux.yml`.
- All `.blockmap` side-cars so electron-updater can do delta updates.
- Release notes body is the content of the `[Unreleased]` section captured at stamp time.

### Code signing (optional)

The workflow reads these repository secrets if present and skips signing when they are not:

| Secret | Used by |
| --- | --- |
| `MAC_CERT_P12`, `MAC_CERT_PASSWORD` | macOS code signing (`CSC_LINK` / `CSC_KEY_PASSWORD`) |
| `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` | macOS notarisation (only used once `notarize: true` is flipped in `electron-builder.config.ts`) |
| `WIN_CERT_P12`, `WIN_CERT_PASSWORD` | Windows code signing |

### Troubleshooting

- **`'## [Unreleased]' heading not found`** — Restore the heading at the top of `CHANGELOG.md` and re-tag.
- **`'## [<version>]' section already exists`** — The tag was published before; bump the version and tag again.
- **`prepare` job fails on `git push origin HEAD:main`** — Likely branch protection requires a PR. Either grant the workflow's GH bot direct-push permission or switch the stamp strategy to open a PR.
- **Missing installer in the Release** — `fail_on_unmatched_files: true` is set; check the corresponding platform job log for build errors.

### Pipeline architecture

The release pipeline is split into three layers so the high-risk parts can be tested without producing real releases:

| Layer | File | Purpose |
| --- | --- | --- |
| Unit-tested logic | `tooling/release/stamp-changelog.mjs` (+ `.test.mjs`) | Pure Node ESM that rewrites `CHANGELOG.md`. Run locally with `node --test tooling/release/stamp-changelog.test.mjs`. |
| Composite action | `.github/actions/stamp-changelog/action.yml` | Wraps the script so any workflow can stamp the CHANGELOG identically. |
| Reusable workflow | `.github/workflows/release-electron.reusable.yml` | Owns the full build/publish job graph; gated on a `dry-run` input. |
| Production wrapper | `.github/workflows/release-electron.yml` | Thin: triggers on `@agent-profiler/desktop@*` tags, calls the reusable workflow with `dry-run: false`. |
| Dry-run wrapper | `.github/workflows/release-electron-dryrun.yml` | Triggers on `workflow_dispatch` and on PRs that touch any pipeline file. Runs the same reusable workflow with `dry-run: true`. |

### Dry-running the pipeline

You can validate the release flow without cutting a real release, on any branch:

**Manual (any branch):**

```bash
gh workflow run release-electron-dryrun.yml \
  -f version=0.0.0-dryrun.$(date +%s) \
  -f platforms=linux
```

This runs the unit tests, the CHANGELOG stamp (uploaded as the `changelog-dryrun` artifact instead of committed to `main`), and the requested platform builds end-to-end — but skips the GitHub Release publication.

**Automatic (on PRs):** The dry-run workflow auto-triggers when a PR touches any of:

- `.github/workflows/release-electron*.yml`
- `.github/actions/stamp-changelog/**`
- `tooling/release/**`
- `apps/desktop/electron-builder.config.ts` or `apps/desktop/package.json`

PR dry-runs default to `platforms=linux` to keep runner-minute usage proportionate; trigger a manual dispatch when you need to validate macOS or Windows packaging on a branch.

**Local sanity check:** the stamp script can be exercised offline against any CHANGELOG copy:

```bash
cp CHANGELOG.md /tmp/CHANGELOG.test.md
node tooling/release/stamp-changelog.mjs \
  --version 9.9.9 \
  --changelog /tmp/CHANGELOG.test.md \
  --notes-out /tmp/notes.md
diff CHANGELOG.md /tmp/CHANGELOG.test.md
```
