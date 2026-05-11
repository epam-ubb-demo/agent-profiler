---
'@agent-profiler/adapters-application-insights': patch
---

Fix unresolved Copilot review findings (#306):

- Improved `buildSpanTree` BFS by replacing `queue.shift()` with index-based traversal, removing O(n²) bottleneck on large span sets.
- Corrected session and turn grouping so empty-string dimensions are treated as missing rather than valid identifiers.
- Fixed turn ID fallback logic so empty strings fall back to the `<no-turn>` sentinel as intended.
- Aligned model fallback behaviour with the copilot-cli adapter by using `''` instead of `'unknown'`.
