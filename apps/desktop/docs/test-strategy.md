# Desktop Shell — Test Strategy

This document describes the testing approach for the `@agent-profiler/desktop` application.

## Layers

### 1. Unit Tests (Vitest)

**Scope:** Pure logic functions, utility modules, state management.

- **Tool:** Vitest (shared across the monorepo)
- **Location:** Co-located `__tests__/` directories or `.test.ts` files
- **Coverage target:** ≥ 80% line coverage for logic modules
- **What to test:**
  - Utility functions (e.g. `cn()` class merging)
  - State transformations
  - Data parsing and validation (Zod schemas)

### 2. Integration Tests — IPC Contract

**Scope:** Verify the preload/main process boundary behaves correctly.

- **Tool:** Vitest with mocked Electron APIs
- **Location:** `src/__tests__/` or dedicated `tests/integration/`
- **Coverage target:** All defined IPC channels must have at least one contract test
- **What to test:**
  - Each `ipcMain.handle` returns the expected shape
  - The preload `contextBridge` exposes the correct interface
  - Zod schema validation rejects malformed payloads

### 3. End-to-End Tests (Playwright + Electron)

**Scope:** Full application behaviour from the user's perspective.

- **Tool:** Playwright with `_electron` launcher
- **Location:** `e2e/`
- **Coverage target:** Critical user paths (launch, navigation, session open)
- **What to test:**
  - Application launches and displays the landing pane
  - Theme toggle switches between dark and light mode
  - IPC round-trip: version displayed matches package version
  - Future: session list, open, and timeline navigation

## Running Tests

```bash
# Unit tests
pnpm --filter @agent-profiler/desktop test

# E2E tests (requires a built app)
pnpm --filter @agent-profiler/desktop build
pnpm --filter @agent-profiler/desktop test:e2e
```

## CI Considerations

- Unit and integration tests run on every push (fast, no display required).
- E2E tests require a display server or `xvfb-run` on Linux CI.
- E2E tests run against the built artefact (`out/`) — never against the dev server.

## Conventions

- British English in test descriptions and documentation.
- Tests must be deterministic — no reliance on timing or network.
- Prefer `test()` over `it()` for Vitest consistency with Playwright.
- Each IPC channel added must have a corresponding contract test before merge.
