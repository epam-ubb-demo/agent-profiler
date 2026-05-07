# Release Notes — v1.0.0

**Release Date:** 2025-07-21  
**Milestone:** First Stable Release

---

## 🎉 Overview

Agent Profiler v1.0.0 is the first production-ready release of the desktop application for visualising AI coding-agent session logs. It transforms raw session data from GitHub Copilot CLI, VS Code Copilot Chat, VS Code Coding Agent, and `ctb` benchmark runs into interactive timelines with full cost analysis, annotation support, and export capabilities.

---

## ✨ Feature Highlights

### E1 — Core Platform & Session Parsing
- **Monorepo architecture** with Turborepo, pnpm workspaces, and shared TypeScript tooling
- **Universal Session model** — a canonical domain type that all adapters produce
- **Zod-validated schemas** for runtime safety across IPC and data boundaries
- **Aggregation engine** for bench-run-level summaries and model usage rollups

### E2 — Adapter Ecosystem
- **Copilot CLI adapter** — parses `events.jsonl` from GitHub Copilot CLI sessions
- **VS Code Chat adapter** — parses VS Code Copilot Chat transcript files
- **VS Code Coding Agent adapter** — (scaffold) support for VS Code Coding Agent logs
- **ctb adapter** — parses `ctb` benchmark run directories with variant inference

### E3 — Pricing & Cost Analysis
- **Disjoint billing calculator** implementing GitHub-style token billing (input, cached-read, cache-write, output)
- **Built-in pricing table** covering OpenAI GPT, Anthropic Claude, Google Gemini, and xAI models
- **Confidence scoring** — marks costs as `known`, `estimated`, or `unknown` per model
- **Custom pricing override** via `AGENT_PROFILER_PRICING_PATH` environment variable

### E4 — Desktop Application
- **Electron + electron-vite** desktop app with main/renderer/preload architecture
- **EPAM UUI component library** integration for consistent design system
- **Session browser** with local filesystem scanning and adapter auto-detection
- **Session detail view** with timeline, tool calls, and token metrics
- **Data source abstraction** with LRU caching for parsed sessions

### E5 — Annotations & Export
- **Annotations system** — create, tag, and comment on session elements (turns, tool calls, sessions)
- **SQLite-backed storage** via better-sqlite3 for persistence
- **HTML export** — generate standalone HTML reports
- **PDF export** — generate PDF documents from session data
- **IPC schema contracts** for type-safe communication between processes

### E6 — Plugin System & Polish
- **Plugin manifest validation** with Zod schemas (apiVersion, metadata, capabilities)
- **Dynamic plugin loader** supporting session-source and visualiser plugin types
- **Plugin discovery** via filesystem scanning with keyword-based detection
- **Regression test suite** validating cross-package integration
- **Release automation** with changesets

---

## 💥 Breaking Changes

None — this is the first stable release. All APIs are considered stable from this point forward.

---

## 🖥️ Supported Platforms

| Platform | Architecture | Status |
| -------- | ------------ | ------ |
| macOS | arm64 (Apple Silicon) | ✅ Supported |
| macOS | x64 (Intel) | ✅ Supported |
| Windows | x64 | ✅ Supported |
| Linux | x64 | ✅ Supported |

---

## 📂 Supported Session Sources

| Source | Adapter Package | File Format |
| ------ | --------------- | ----------- |
| GitHub Copilot CLI | `@agent-profiler/adapters-copilot-cli` | `events.jsonl` / `events.ndjson` |
| VS Code Copilot Chat | `@agent-profiler/adapters-vscode-chat` | JSONL transcript |
| VS Code Coding Agent | `@agent-profiler/adapters-vscode-coding-agent` | (coming soon) |
| ctb Benchmark | `@agent-profiler/adapters-ctb` | `events.jsonl` in run dirs |

---

## 📥 Installation

### From Source

```bash
# Prerequisites: Node.js ≥ 20, pnpm ≥ 9
corepack enable

# Clone the repository
git clone https://github.com/epam-ubb-demo/agent-profiler.git
cd agent-profiler

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the desktop app in development mode
pnpm dev
```

### Packaged App

Pre-built binaries will be available in the [Releases](https://github.com/epam-ubb-demo/agent-profiler/releases) section once CI/CD is configured.

---

## ⚠️ Known Limitations

1. **VS Code Coding Agent adapter** — scaffold only; full parsing not yet implemented
2. **Side-by-side comparison** — UI components are scaffolded but not fully interactive
3. **Plugin hot-reload** — plugins must be discovered at startup; no runtime reload
4. **Remote data sources** — only local filesystem is supported; no cloud/API source yet
5. **PDF export styling** — basic layout only; advanced formatting planned for v1.1
6. **Auto-update** — not yet configured; manual download required for updates

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Electron)                     │
├─────────────────────────────────────────────────────────────┤
│  Renderer (React + EPAM UUI)  │  Main (Node.js + IPC)       │
│  ─────────────────────────────│──────────────────────────── │
│  @agent-profiler/ui           │  @agent-profiler/data-source │
│  Timeline, Panels, Settings   │  @agent-profiler/annotations │
│                               │  @agent-profiler/plugins     │
├───────────────────────────────┴─────────────────────────────┤
│                   Shared Packages                            │
│  @agent-profiler/core     │  @agent-profiler/pricing         │
│  @agent-profiler/adapters-*  │  @agent-profiler/export-*     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🙏 Credits

- **EPAM UBB Team** — architecture, implementation, and testing
- **EPAM UUI** — design system and component library
- **GitHub Copilot** — AI-assisted development throughout the project
- **Open source dependencies** — Electron, Vite, React, Vitest, Turborepo, Zod, D3, better-sqlite3, and many more

---

## 📋 Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the detailed commit-level changelog.

---

**Thank you for using Agent Profiler!** 🚀
