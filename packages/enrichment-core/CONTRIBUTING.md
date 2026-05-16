# Contributing to `@agent-profiler/enrichment-core`

Use this guide when adding new source or sink adapters.

## Adding a new source

1. Create a new package at `packages/enrichment-source-<tool>/`.
2. Implement `SessionEnrichmentSource` in the package's public API.
3. Register the source in `SourceRegistry` at the composition root.
4. Run the shared contract tests from `@agent-profiler/enrichment-core/testing` once the testing module is available.
5. Add a `SessionProjector` for read-side projection and register it in `ProjectorRegistry`.

Keep the source focused on raw artefact reading and event emission. Do not project into `Session` inside the source package.

## Adding a new sink

1. Create a new package at `packages/enrichment-sink-<transport>/`.
2. Implement `EnrichmentSink`.
3. Register the sink in `SinkRegistry`.
4. Run the shared sink contract tests from `@agent-profiler/enrichment-core/testing`.

Sinks should be idempotent on `eventId` and return partial acceptance via `PushResult` when needed.

## Contract test usage

```typescript
import { runSourceContractTests } from "@agent-profiler/enrichment-core/testing";
import { MyCoolSource } from "../src/source.js";

runSourceContractTests(() => ({
  source: new MyCoolSource(),
  fixture: { tool: "my-tool", sessionId: "test-1", locationHint: "/tmp/test" },
}));
```

Use the same pattern for sink implementations once the sink contract helpers are added.
