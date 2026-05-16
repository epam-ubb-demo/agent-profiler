# @agent-profiler/enrichment-core

Shared types, interfaces, registries, and helpers for the multi-source sync architecture.

This package defines the canonical enrichment envelope, per-session sync state, source/sink/projector contracts, and the small in-process registries used by the sync orchestration layer. It is the shared boundary between tool-specific adapters and the rest of the system (see ADR-0009 through ADR-0015).

## Installation

```bash
pnpm add @agent-profiler/enrichment-core
```

In this monorepo, that resolves to the local workspace package.

## Core types

### `EnrichmentEvent`

The canonical wire envelope for enrichment data (ADR-0009). Every source emits this shape.

```ts
import {
  buildEventId,
  enrichmentEventSchema,
} from "@agent-profiler/enrichment-core";

const event = enrichmentEventSchema.parse({
  schemaVersion: 1,
  tool: "copilot-cli",
  toolVersion: "1.0.0",
  sourceMachine: "mbp-01",
  sessionId: "sess-123",
  category: "metadata",
  ordinal: 0,
  eventId: buildEventId({
    tool: "copilot-cli",
    sessionId: "sess-123",
    category: "metadata",
    ordinal: 0,
  }),
  eventTs: "2026-05-16T10:00:00.000Z",
  payloadSchema: "copilot-cli/metadata/v2",
  payload: { language: "typescript" },
});
```

### `EnrichmentCursor`

Per-category resume state for a `(tool, sessionId, category)` triple (ADR-0011).

```ts
import type { EnrichmentCursor } from "@agent-profiler/enrichment-core";

const cursor: EnrichmentCursor = {
  tool: "copilot-cli",
  sessionId: "sess-123",
  category: "metadata",
  lastOrdinal: 12,
  lastEventId: "::copilot-cli:sess-123:metadata:12",
  lastEventTs: "2026-05-16T10:00:00.000Z",
  lastIngestedAt: "2026-05-16T10:01:00.000Z",
};
```

### `SessionRef`

A lightweight session reference passed between sources, planners, and watchers.

```ts
import type { SessionRef } from "@agent-profiler/enrichment-core";

const ref: SessionRef = {
  tool: "vscode-chat",
  sessionId: "chat-42",
  locationHint: "/Users/me/Library/Application Support/Code/User/globalStorage",
};
```

### `ToolId`

Supported tool identifiers:

- `copilot-cli`
- `vscode-chat`
- `claude-code`

```ts
import type { ToolId } from "@agent-profiler/enrichment-core";

const tool: ToolId = "claude-code";
```

### `Marker`

Per-session sync state persisted by the sync engine (ADR-0011).

```ts
import type { Marker } from "@agent-profiler/enrichment-core";

const marker: Marker = {
  schemaVersion: 2,
  tool: "copilot-cli",
  sessionId: "sess-123",
  tenantId: "tenant-a",
  userId: "user-b",
  cursors: {
    metadata: {
      tool: "copilot-cli",
      sessionId: "sess-123",
      category: "metadata",
      lastOrdinal: 12,
      lastEventId: "tenant-a:user-b:copilot-cli:sess-123:metadata:12",
      lastEventTs: "2026-05-16T10:00:00.000Z",
      lastIngestedAt: "2026-05-16T10:01:00.000Z",
    },
  },
  payloadSchemaVersions: {
    metadata: "v2",
  },
};
```

## Interfaces

### `SessionEnrichmentSource`

Implement this for each tool-specific source adapter (ADR-0010).

Contract obligations:

- `tool` must identify the source's `ToolId`
- `discoverSessions()` should enumerate sessions available to that source
- `readEvents()` must be resumable, ordered, and back-pressure friendly
- `watch()` returns a separate `SessionWatcher` for change notifications
- `categoriesFor()` should return the categories present for a session

```ts
import type {
  SessionEnrichmentSource,
  SessionRef,
  EnrichmentCursor,
  EnrichmentEvent,
} from "@agent-profiler/enrichment-core";

class MySource implements SessionEnrichmentSource {
  readonly tool = "copilot-cli" as const;

  async *discoverSessions(): AsyncIterable<SessionRef> {
    yield {
      tool: this.tool,
      sessionId: "sess-1",
      locationHint: "/tmp/session-1",
    };
  }

  async *readEvents(
    ref: SessionRef,
    cursors: Readonly<Record<string, EnrichmentCursor | undefined>>,
  ): AsyncIterable<EnrichmentEvent> {
    void ref;
    void cursors;
  }

  watch(ref: SessionRef) {
    void ref;
    return {
      on() {},
      close() {},
    };
  }

  async categoriesFor(ref: SessionRef): Promise<readonly string[]> {
    void ref;
    return ["metadata", "turns"];
  }
}
```

### `EnrichmentSink`

Implement this for each transport adapter (ADR-0013).

Contract obligations:

- `availability()` should report whether the sink is ready
- `supportsCategory()` is used for category-level routing
- `push()` must be idempotent on `eventId`
- `push()` returns accepted ordinals and any rejected items

```ts
import type {
  EnrichmentSink,
  EnrichmentEvent,
} from "@agent-profiler/enrichment-core";

class MySink implements EnrichmentSink {
  readonly id = "dcr-primary";

  async availability(): Promise<boolean> {
    return true;
  }

  supportsCategory(category: string): boolean {
    return category !== "tool-results";
  }

  async push(batch: readonly EnrichmentEvent[]) {
    return {
      acceptedOrdinals: batch.map((event) => event.ordinal),
      rejected: [],
    };
  }
}
```

### `MarkerStore`

Persistence contract for per-session markers (ADR-0011).

Contract obligations:

- `read()` returns the stored marker or `undefined`
- `write()` overwrites the current marker
- `resetCategories()` clears only the named categories
- `resetAll()` clears all marker state for the session

### `SyncPlanner`

Builds sync plans for the orchestrator (ADR-0014).

Contract obligations:

- `planFull()` re-syncs everything from scratch
- `planSelective()` limits the plan to named categories
- `planIncremental()` only includes categories with new events

`SyncPlan` carries the `SessionRef`, selected categories, and the plan mode (`full`, `selective`, or `incremental`).

### `SessionProjector`

Projects enrichment events back into a `Session` for read-side assembly (ADR-0015).

Contract obligations:

- `tool` must match the source tool
- `project()` should be pure and side-effect-free
- `project()` should accept a complete event set for one session

## Registries

Use the registries to keep the orchestration layer dependency-inverted and extensible:

- `SourceRegistry` — keyed by `ToolId`
- `SinkRegistry` — keyed by sink `id`
- `ProjectorRegistry` — keyed by `ToolId`

```ts
import {
  SourceRegistry,
  SinkRegistry,
  ProjectorRegistry,
} from "@agent-profiler/enrichment-core";
import type { Session } from "@agent-profiler/core";

const sources = new SourceRegistry();
const sinks = new SinkRegistry();
const projectors = new ProjectorRegistry();

sources.register(new MySource());
sinks.register(new MySink());
projectors.register({
  tool: "copilot-cli",
  project(events) {
    void events;
    return {} as Session;
  },
});

const source = sources.forTool("copilot-cli");
const sink = sinks.forId("dcr-primary");
const projector = projectors.forTool("copilot-cli");
```

Duplicate registration throws `DuplicateRegistrationError`; missing lookups throw `NotFoundError`.

## Utilities

### `buildEventId()`

Builds the deterministic event identifier defined in ADR-0009.

```ts
import { buildEventId } from "@agent-profiler/enrichment-core";

const eventId = buildEventId({
  tenantId: "tenant-a",
  userId: "user-b",
  tool: "copilot-cli",
  sessionId: "sess-123",
  category: "metadata",
  ordinal: 7,
});

// tenant-a:user-b:copilot-cli:sess-123:metadata:7
```

If `tenantId` or `userId` is omitted, their segments are preserved as empty strings so the identifier stays stable.

## Contract tests

The `@agent-profiler/enrichment-core/testing` entry point provides shared contract tests.

Use it to validate custom implementations before wiring them into the registries. A source adapter will look like this:

```ts
import { runSourceContractTests } from "@agent-profiler/enrichment-core/testing";
import { MyCoolSource } from "../src/source.js";

runSourceContractTests(() => ({
  source: new MyCoolSource(),
  fixture: { tool: "my-tool", sessionId: "test-1", locationHint: "/tmp/test" },
}));
```

## Architecture

Relevant decision records:

- ADR-0009 — Tool-Agnostic Enrichment Event Envelope
- ADR-0010 — SessionEnrichmentSource Abstraction
- ADR-0011 — Per-Category Cursor Marker Schema
- ADR-0013 — Pluggable EnrichmentSink Abstraction
- ADR-0014 — Watcher + Poll Incremental Scheduler
- ADR-0015 — Per-Tool SessionProjector for Read-Side Assembly

## SOLID principles

- **SRP** — each interface has one responsibility
- **OCP** — registries allow extension without modifying orchestration code
- **LSP** — contract tests define the behaviour every implementation must satisfy
- **ISP** — `SessionWatcher` is separate from `SessionEnrichmentSource`
- **DIP** — the orchestrator depends on abstractions, not concrete adapters
