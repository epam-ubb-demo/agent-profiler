# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## [Unreleased]

### Changed

- Context window composition visualisation replaced from a stacked horizontal bar chart to an SVG donut chart. Each segment (System prompt, Conversation, Tool definitions) is shown as a proportional arc with the total token count centred in the ring and a colour-coded legend below. The same segment colours and the `ContextWindowBarProps` interface are preserved; the component name and export remain `ContextWindowBar`.

- "Premium cost" column in Cost & Models table renamed to "Premium Request cost" and now shows `totalPremiumRequests × $0.04` instead of token-based pricing estimate. Token-based cost remains in the "Token USD" column.
- Added "Premium Requests" count column to Cost & Models table. Columns reordered: Model, API Requests, Premium Requests, token columns, Premium Request cost, Token USD. "Est. USD" renamed to "Token USD". "Requests" renamed to "API Requests".
- Cost calculation now uses overlapping-input model — `inputTokens` is understood to include `cacheReadTokens`, so non-cached input is computed as `max(0, inputTokens − cacheReadTokens)` before applying the input rate. Cache hit rate is now `cacheReadTokens / inputTokens`.

### Improved

- **Session detail page redesigned** — the 14-section vertical scroll layout is replaced by a sticky header with compact KPI strip and four themed tabs (Overview, Cost & Models, Tools, Timeline). Key stats are always visible, problem-severity colouring highlights anomalies (high cost, task failures, excessive compactions), and tab notification dots surface issues at a glance. Within-tab two-column layouts reduce scrolling further.
- Per-model token breakdown and estimated USD cost now display for all sessions. When shutdown metrics are unavailable, values are aggregated from per-request assistant message data using the existing pricing engine.

### Added

- Non-blocking background refresh spinner in the Session Browser header — a small spinner appears next to the session count badge while a background rescan is in progress, without replacing the session list.
- Push-based IPC for real-time session list updates — renderer auto-refreshes when sessions change on disk via `SESSION_LIST_UPDATED` (#320).
- **Session list performance refactor** — wired `SessionIndexer` into the Electron app lifecycle so `SESSION_LIST` now returns from the in-memory cache, `SESSION_SET_ROOT_DIR` delegates cache invalidation and rescanning, startup begins with a disk-backed indexer, and shutdown flushes cache while stopping the watcher (#317)
- **Session Indexer** — new `SessionIndexer` class in the desktop app that provides dual-layer caching (memory + disk) and background batch scanning for the session list, laying the groundwork for eliminating blocking filesystem reads (#319)
- **Filesystem Watching** — `SessionIndexer` now monitors the session root directory for changes using `fs.watch`. New, modified, and deleted sessions are detected automatically with 500ms debounce. Graceful degradation on Linux where recursive watching is unavailable. (#318)
- Per-tab contextual KPI strips — Cost & Models, Tools, and Timeline tabs now show 3–5 at-a-glance summary metrics with severity colouring at the top of each tab
- Interactive sorting and filtering for all data tables in session detail view — click column headers to sort (asc/desc/reset), use filter input to search rows by text
- Two-layer `ErrorBoundary` — granular boundary on the session detail view recovers from render errors with a "Back to sessions" action; a catch-all boundary at the app level prevents full white-screen crashes. Both layers display errors via the UUI `Alert` component with an expandable stack trace.
- Session data quality alerts — inline UUI `Alert` banners in the session detail view surface parse warnings, schema mismatches, and missing shutdown events with appropriate severity (error/warning/info) and dismissible close buttons
- `reasoningTokens` field is now extracted from shutdown metrics (previously silently dropped).
- Model metrics normalisation extracted into a dedicated module (`normalise-model-metrics.ts`) to isolate Copilot CLI format-specific logic.
- `tooling/validate-sessions.py` script for validating local sessions against the parser.
- Post-parse validation detects when shutdown metrics exist but all token counts are zero, flagging a possible Copilot CLI event schema mismatch as a `partial` parse status.
- Schema evolution guidance documented in `DEVELOPING.md`.
- Documentation split into two independent Astro + Starlight sites: `docs/project/` (architecture decisions, operations runbooks, contributor guides) at base path `/agent-profiler/project/`, and `docs/tool/` (OTel Gateway, desktop app, adapters) at base path `/agent-profiler/tool/`. Each site builds independently and is merged into a single GitHub Pages deployment.
- GitHub Actions workflow updated to build both sites and merge their `dist/` outputs before upload (`.github/workflows/docs.yml`).

### Fixed

- During initial session indexing, the app now shows a "Scanning sessions…" indicator instead of incorrectly displaying "No sessions found".
- Event parser now handles the current Copilot CLI shutdown format where `modelMetrics` uses nested `usage` and `requests` sub-objects. Both the legacy flat format and the current nested format are supported transparently. Premium request cost units are now extracted from `requests.cost`.
- **Desktop**: Prevented duplicate Electron instances via single-instance lock and added EIO/EPIPE pipe error guard to avoid crash dialogs from orphaned processes.

See individual package changelogs for details.
