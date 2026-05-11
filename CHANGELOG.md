# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## [Unreleased]

### Changed

- "Premium cost" column in Cost & Models table renamed to "Premium Request cost" and now shows `totalPremiumRequests × $0.04` instead of token-based pricing estimate. Token-based cost remains in the "Token USD" column.
- Added "Premium Requests" count column to Cost & Models table. Columns reordered: Model, API Requests, Premium Requests, token columns, Premium Request cost, Token USD. "Est. USD" renamed to "Token USD". "Requests" renamed to "API Requests".
- Cost calculation now uses overlapping-input model — `inputTokens` is understood to include `cacheReadTokens`, so non-cached input is computed as `max(0, inputTokens − cacheReadTokens)` before applying the input rate. Cache hit rate is now `cacheReadTokens / inputTokens`.

### Improved

- **Session detail page redesigned** — the 14-section vertical scroll layout is replaced by a sticky header with compact KPI strip and four themed tabs (Overview, Cost & Models, Tools, Timeline). Key stats are always visible, problem-severity colouring highlights anomalies (high cost, task failures, excessive compactions), and tab notification dots surface issues at a glance. Within-tab two-column layouts reduce scrolling further.
- Per-model token breakdown and estimated USD cost now display for all sessions. When shutdown metrics are unavailable, values are aggregated from per-request assistant message data using the existing pricing engine.

### Added

- Per-tab contextual KPI strips — Cost & Models, Tools, and Timeline tabs now show 3–5 at-a-glance summary metrics with severity colouring at the top of each tab
- Interactive sorting and filtering for all data tables in session detail view — click column headers to sort (asc/desc/reset), use filter input to search rows by text
- Two-layer `ErrorBoundary` — granular boundary on the session detail view recovers from render errors with a "Back to sessions" action; a catch-all boundary at the app level prevents full white-screen crashes. Both layers display errors via the UUI `Alert` component with an expandable stack trace.
- Session data quality alerts — inline UUI `Alert` banners in the session detail view surface parse warnings, schema mismatches, and missing shutdown events with appropriate severity (error/warning/info) and dismissible close buttons
- `reasoningTokens` field is now extracted from shutdown metrics (previously silently dropped).
- Model metrics normalisation extracted into a dedicated module (`normalise-model-metrics.ts`) to isolate Copilot CLI format-specific logic.
- `tooling/validate-sessions.py` script for validating local sessions against the parser.
- Post-parse validation detects when shutdown metrics exist but all token counts are zero, flagging a possible Copilot CLI event schema mismatch as a `partial` parse status.
- Schema evolution guidance documented in `DEVELOPING.md`.

### Fixed

- Event parser now handles the current Copilot CLI shutdown format where `modelMetrics` uses nested `usage` and `requests` sub-objects. Both the legacy flat format and the current nested format are supported transparently. Premium request cost units are now extracted from `requests.cost`.

See individual package changelogs for details.
