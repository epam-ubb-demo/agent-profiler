# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## [Unreleased]

### Fixed

- Improved `buildSpanTree` in `@agent-profiler/adapters-application-insights` by replacing `queue.shift()` with index-based traversal, removing the O(n²) BFS bottleneck.
- Corrected session and turn grouping so empty-string dimensions are no longer treated as valid identifiers.
- Fixed turn ID fallback logic so empty strings now fall back to the sentinel value as intended.
- Aligned model fallback behaviour with the copilot-cli adapter by using `''` instead of `'unknown'`.
- Referenced issue #306 for these internal correctness fixes.

See individual package changelogs for details.
