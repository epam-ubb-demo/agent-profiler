# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## [Unreleased]

### Improved

- Per-model token breakdown and estimated USD cost now display for all sessions. When shutdown metrics are unavailable, values are aggregated from per-request assistant message data using the existing pricing engine.

### Added

- Post-parse validation detects when shutdown metrics exist but all token counts are zero, flagging a possible Copilot CLI event schema mismatch as a `partial` parse status.
- Schema evolution guidance documented in `DEVELOPING.md`.

### Fixed

- Event parser now handles the current Copilot CLI shutdown format where `modelMetrics` uses nested `usage` and `requests` sub-objects. Both the legacy flat format and the current nested format are supported transparently. Premium request cost units are now extracted from `requests.cost`.

See individual package changelogs for details.
