# @agent-profiler/adapters-vscode-chat

## 1.0.0

### Major Changes

- 04c29f2: ## v1.0.0 — Production Release

  First stable release of Agent Profiler.

  ### Highlights
  - Universal Session domain model with Zod-validated schemas
  - Multi-adapter session parsing (Copilot CLI, VS Code Chat, ctb)
  - Disjoint billing cost calculator with per-model confidence scoring
  - Annotation system with SQLite persistence (create, tag, comment, delete)
  - Plugin system with manifest validation and filesystem discovery
  - Local filesystem data source with LRU caching
  - HTML and PDF export capabilities
  - Electron desktop application with EPAM UUI components

### Minor Changes

- b85c1a9: ## v0.4.0 — Multi-source support + annotations
  - Added VS Code Copilot Chat adapter
  - Added VS Code Copilot coding-agent adapter
  - Added source picker settings UI
  - Added annotations storage (better-sqlite3)
  - Added annotations UI (tags + comments)
  - Added multi-platform packaging (macOS/Windows/Linux)
  - Added standalone HTML export
  - Added comparative multi-session table

### Patch Changes

- Updated dependencies [b85c1a9]
- Updated dependencies [04c29f2]
  - @agent-profiler/core@1.0.0
