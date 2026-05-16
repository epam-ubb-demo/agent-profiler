# @agent-profiler/source-copilot-cli

Copilot CLI source adapter and session projector for the Agent Profiler multi-source sync architecture (ADR-0010/0015).

## Overview

This package implements two key interfaces from `@agent-profiler/enrichment-core`:

- **`CopilotCliEnrichmentSource`** — Scans a root directory for Copilot CLI session folders and yields `EnrichmentEvent`s from each session's `events.jsonl` file.
- **`CopilotCliSessionProjector`** — Reconstructs a `Session` from a set of `EnrichmentEvent`s (the inverse of the source).

## Usage

```typescript
import { registerCopilotCli } from '@agent-profiler/source-copilot-cli';
import { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';

const sources = new SourceRegistry();
const projectors = new ProjectorRegistry();

registerCopilotCli(sources, projectors, '/path/to/sessions-root');
```

## Event categories

| Category      | Ordinal | Description                         |
|---------------|---------|-------------------------------------|
| `metadata`    | 0       | Session-level metadata (single row) |
| `utilisation` | 0..n    | Context-window utilisation samples  |
| `compaction`  | 0..n    | Context-window compaction events    |
| `tool_result` | 0..n    | Tool call execution results         |

## Development

```bash
pnpm typecheck   # Type-check with TypeScript
pnpm test        # Run unit + contract tests
pnpm lint        # Lint with ESLint
```
