# Agent Profiler

> Visualise AI coding-agent session logs — Copilot CLI, VS Code Copilot Chat, and `ctb` benchmark runs — in one desktop app.

Agent Profiler is the successor to the `ctb viz` HTML prototype. It opens session logs from local AI coding-agent runs and renders an interactive timeline showing tool calls, fan-outs, model usage, context window pressure, and token spend (with disjoint GitHub-style billing).

**Status:** 🚧 Bootstrapping — monorepo foundation in place, application code coming soon.

## Why

When you're spending real money on long-running coding-agent sessions, you want to see:

- Where fan-outs are happening and which models they're hitting.
- How context fills up over a session and where it spills.
- Where the token cost is actually going (input / cached / output, per model, per session).
- How two variants of a run compare side-by-side.

Today we hand-roll an HTML report per ctb run. Agent Profiler turns that into a first-class desktop app.

## Monorepo Structure

```
agent-profiler/
├── apps/
│   ├── desktop/          # Electron desktop application
│   └── docs/             # Documentation site
├── packages/
│   ├── core/             # Domain logic, parsers, models
│   ├── pricing/          # Token billing & cost calculations
│   └── ui/               # Shared React components (EPAM UUI)
├── tooling/
│   ├── tsconfig-base/    # Shared TypeScript configuration
│   ├── eslint-config/    # Shared ESLint flat configuration
│   └── prettier-config/  # Shared Prettier configuration
├── turbo.json            # Turborepo pipeline config
└── pnpm-workspace.yaml   # pnpm workspace definitions
```

## Quick Start

```bash
# Prerequisites: Node.js ≥ 20, pnpm ≥ 9
corepack enable

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development
pnpm dev
```

See [`DEVELOPING.md`](./DEVELOPING.md) for the full development guide.

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Language | TypeScript 5.7+ (strict mode) |
| Runtime | Electron + electron-vite |
| UI | React 18 · [EPAM UUI](https://uui.epam.com/) · Zustand · TanStack Query |
| Visualisation | D3 / visx |
| Data | better-sqlite3 · zod-validated IPC |
| Build | pnpm 9 · Turborepo |
| Testing | Vitest · Playwright |
| Future | Node + Fastify + tRPC (browser portability) |

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`DEVELOPING.md`](./DEVELOPING.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), and [`SECURITY.md`](./SECURITY.md) before opening an issue or PR.

See [`docs/backlog-conventions.md`](./docs/backlog-conventions.md) for the Epic / Feature / Task model and labelling.

## Licence

[MIT](./LICENSE) © EPAM
