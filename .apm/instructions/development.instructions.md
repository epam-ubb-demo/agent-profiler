---
applyTo: "apps/desktop/**"
description: "Development workflow instructions for the Electron desktop application"
---

# Desktop Application Development

## Starting the App

Always use HMR (hot module replacement) when launching the desktop app:

```sh
pnpm --filter @agent-profiler/desktop dev
```

This runs `electron-vite dev`, which provides live reloading for renderer/UI changes — no restart required.

## Important Constraints

- **Never** use `build && start` during development — those commands produce a production build and are only appropriate for release testing.
- HMR applies to renderer (UI) changes only. Main process changes still require a full restart of the dev server.
