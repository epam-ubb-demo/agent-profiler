# Agent Profiler

> Visualise AI coding-agent session logs — Copilot CLI, VS Code Copilot Chat, and `ctb` benchmark runs — in one app.

Agent Profiler is the successor to the `ctb viz` HTML prototype. It opens session logs from local AI coding-agent runs and renders an interactive timeline showing tool calls, fan-outs, model usage, context window pressure, and token spend (with disjoint GitHub-style billing).

**Status:** 🚧 Bootstrapping — the backlog is being seeded. No application code has shipped yet.

## Why

When you're spending real money on long-running coding-agent sessions, you want to see:
- Where fan-outs are happening and which models they're hitting.
- How context fills up over a session and where it spills.
- Where the token cost is actually going (input / cached / output, per model, per session).
- How two variants of a run compare side-by-side.

Today we hand-roll an HTML report per ctb run. Agent Profiler turns that into a first-class desktop app.

## Tech stack (planned)

- TypeScript (strict) · Electron + electron-vite + electron-builder
- React 18 · [EPAM UUI](https://uui.epam.com/) · Zustand + TanStack Query · D3 / visx · CSS Modules
- pnpm + Turborepo monorepo · zod-validated IPC · better-sqlite3
- Vitest + Playwright
- Future API tier: Node + Fastify + tRPC (browser portability)

## Repository layout (target)

See [`docs/backlog-conventions.md`](./docs/backlog-conventions.md) for the Epic / Feature / Task model and labelling.

## Contributing

This project is in active bootstrapping. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), and [`SECURITY.md`](./SECURITY.md) before opening an issue or PR.

## Licence

[MIT](./LICENSE) © EPAM
