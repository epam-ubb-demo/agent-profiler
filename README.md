# Agent Profiler

> **Visualise, analyse, and annotate AI coding-agent sessions** — GitHub Copilot CLI, VS Code Copilot Chat, VS Code Coding Agent, and `ctb` benchmark runs — all in one desktop app.

<!-- TODO: add screenshot -->

---

## Why Agent Profiler?

When you're spending real money on long-running AI coding-agent sessions, you need visibility into:

- 🔀 **Fan-outs** — where parallel tool calls happen and which models they hit
- 📊 **Context pressure** — how the context window fills over time and where it spills
- 💰 **Token cost** — exact spend breakdown by input / cached / output, per model, per session
- 🔍 **Comparison** — side-by-side analysis of session variants

Agent Profiler turns raw session logs into an interactive desktop experience with full cost analysis, timeline visualisation, and annotation support.

---

## Features

- **Multi-source ingestion** — load sessions from Copilot CLI, VS Code Chat, VS Code Coding Agent, and ctb benchmarks
- **Disjoint billing** — accurate cost calculation using GitHub-style token billing (input, cache-read, cache-write, output)
- **Interactive timeline** — visualise tool calls, model switches, compactions, and subagent invocations
- **Annotations** — tag, comment on, and bookmark specific turns or tool calls
- **Plugin system** — extend with custom data sources and visualisers
- **Export** — generate standalone HTML reports or PDF documents
- **Cross-platform** — macOS (Apple Silicon & Intel), Windows, and Linux

---

## Quick Start

```bash
# Prerequisites: Node.js ≥ 20, pnpm ≥ 9
corepack enable

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the desktop app in development mode
pnpm dev

# Run all tests
pnpm test
```

---

## Monorepo Structure

```
agent-profiler/
├── apps/
│   ├── desktop/                        # Electron desktop application
│   └── docs/                           # Documentation site
├── packages/
│   ├── core/                           # Domain types, Zod schemas, aggregation
│   ├── pricing/                        # Token billing & cost calculations
│   ├── ui/                             # Shared React components (EPAM UUI)
│   ├── data-source/                    # Session data source abstraction
│   ├── adapters-copilot-cli/           # Copilot CLI events.jsonl parser
│   ├── adapters-ctb/                   # ctb benchmark run parser
│   ├── adapters-vscode-chat/           # VS Code Chat transcript parser
│   ├── adapters-vscode-coding-agent/   # VS Code Coding Agent (planned)
│   ├── annotations/                    # Annotation CRUD + SQLite storage
│   ├── plugins/                        # Plugin loader and manifest validation
│   ├── export-html/                    # HTML report export
│   └── export-pdf/                     # PDF document export
├── tooling/
│   ├── tsconfig-base/                  # Shared TypeScript configuration
│   ├── eslint-config/                  # Shared ESLint flat configuration
│   └── prettier-config/               # Shared Prettier configuration
├── turbo.json                          # Turborepo pipeline config
└── pnpm-workspace.yaml                 # pnpm workspace definitions
```

---

## Architecture

Agent Profiler follows a layered monorepo architecture:

- **Adapters** parse raw log files into the canonical `Session` domain model
- **Core** defines shared types, schemas, and aggregation logic
- **Pricing** calculates token costs using disjoint billing rules
- **Data Source** provides an abstraction layer for session discovery and loading
- **UI** renders interactive timelines and panels using EPAM UUI components
- **Desktop** ties everything together in an Electron app with IPC

For the full architecture documentation, see the [docs site](./apps/docs/).

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Language | TypeScript 5.7+ (strict mode) |
| Runtime | Electron + electron-vite |
| UI | React 18 · [EPAM UUI](https://uui.epam.com/) · Zustand · TanStack Query |
| Visualisation | D3 / visx |
| Data | better-sqlite3 · Zod-validated IPC |
| Build | pnpm 9 · Turborepo |
| Testing | Vitest · Playwright |

---

## Contributing

We welcome contributions! Please read the following before opening an issue or PR:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution guidelines
- [`DEVELOPING.md`](./DEVELOPING.md) — development setup and workflow
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — community standards
- [`SECURITY.md`](./SECURITY.md) — security policy

See [`docs/backlog-conventions.md`](./docs/backlog-conventions.md) for the Epic / Feature / Task model and labelling.

---

## Licence

[MIT](./LICENSE) © EPAM
