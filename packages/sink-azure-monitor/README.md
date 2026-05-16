# @agent-profiler/sink-azure-monitor

Azure Monitor enrichment sink for the multi-source sync architecture.

## Overview

This package implements the `EnrichmentSink` interface from `@agent-profiler/enrichment-core`, providing an Azure Monitor–backed sink that pushes enrichment events to a custom Azure Data Collection Rule (DCR) table.

The sink is decoupled from the Azure SDK via dependency injection: it accepts a generic `RowUploader` function rather than depending on `@azure/monitor-ingestion` directly. This keeps the sink testable without Azure credentials and allows the caller to wire up the actual SDK client.

## Usage

```typescript
import { LogsIngestionClient } from '@azure/monitor-ingestion';
import { DefaultAzureCredential } from '@azure/identity';
import { SinkRegistry } from '@agent-profiler/enrichment-core';
import { registerAzureMonitorSink } from '@agent-profiler/sink-azure-monitor';

const client = new LogsIngestionClient(dceEndpoint, new DefaultAzureCredential());

const registry = new SinkRegistry();
registerAzureMonitorSink(registry, {
  upload: async (rows) => {
    await client.upload(dcrImmutableId, dcrStreamName, rows as object[]);
    return rows.length;
  },
});
```

## Architecture

- **`row-mapper.ts`** — Pure function that converts an `EnrichmentEvent` envelope into an `EnrichmentRow` suitable for Azure Monitor ingestion.
- **`sink.ts`** — `AzureMonitorEnrichmentSink` class implementing `EnrichmentSink`. Accepts a `RowUploader` function for decoupled upload.
- **`registration.ts`** — `registerAzureMonitorSink` factory that creates the sink and registers it into a `SinkRegistry`.

## Testing

```bash
pnpm --filter @agent-profiler/sink-azure-monitor test
pnpm --filter @agent-profiler/sink-azure-monitor typecheck
pnpm --filter @agent-profiler/sink-azure-monitor lint
```
