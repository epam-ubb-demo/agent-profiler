# @agent-profiler/sink-dcr

An [`EnrichmentSink`](../enrichment-core/src/sink.ts) implementation that posts
enrichment event batches to an **Azure Monitor custom table**
(`AgentSessionEvents_CL`) via the
[DCR Logs Ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview).

## Overview

```
EnrichmentPipeline
      │
      ▼
DcrEnrichmentSink
      │
      │  @azure/monitor-ingestion  (LogsIngestionClient)
      ▼
Data Collection Endpoint (DCE)
      │
      ▼
Data Collection Rule (DCR)
      │
      ▼
Azure Monitor / Log Analytics Workspace
  → AgentSessionEvents_CL (custom table)
```

Events are mapped to **flat rows** (JSON strings for the `payload` field) and
uploaded in a single `LogsIngestionClient.upload()` call per `push()`.

## Installation

```bash
pnpm add @agent-profiler/sink-dcr
```

Peer infrastructure requirements:

- An Azure Data Collection Endpoint (DCE) with public ingestion enabled.
- An Azure Data Collection Rule (DCR) with a stream declaration that matches
  the schema below.
- Appropriate RBAC role: **Monitoring Metrics Publisher** on the DCR.

The companion Pulumi module (`infra/otel/src/data-collection.ts`) provisions
both the DCE and DCR automatically.

## Usage

### Minimal setup

```typescript
import { registerDcrSink } from '@agent-profiler/sink-dcr';
import { SinkRegistry } from '@agent-profiler/enrichment-core';

const registry = new SinkRegistry();

registerDcrSink(registry, {
  endpoint: process.env['DCE_ENDPOINT']!,   // e.g. https://dce-xyz.eastus-1.ingest.monitor.azure.com
  ruleId:   process.env['DCR_IMMUTABLE_ID']!, // e.g. dcr-abc123...
  streamName: 'Custom-AgentSessionEvents_CL',
});
```

`DefaultAzureCredential` is used automatically (Managed Identity, environment
variables, Azure CLI, etc.).

### With explicit credential

```typescript
import { registerDcrSink } from '@agent-profiler/sink-dcr';
import { WorkloadIdentityCredential } from '@azure/identity';

registerDcrSink(registry, {
  endpoint:   '…',
  ruleId:     '…',
  streamName: 'Custom-AgentSessionEvents_CL',
  credential: new WorkloadIdentityCredential(),
});
```

### Category filtering

By default the sink accepts **all** categories (`supportedCategories: ['*']`).
Pass an explicit list to restrict ingestion:

```typescript
registerDcrSink(registry, {
  endpoint:   '…',
  ruleId:     '…',
  streamName: 'Custom-AgentSessionEvents_CL',
  supportedCategories: ['metadata', 'utilisation'],
});
```

## Configuration

| Option                | Type                    | Default     | Description                                                           |
| --------------------- | ----------------------- | ----------- | --------------------------------------------------------------------- |
| `endpoint`            | `string`                | _(required)_ | DCE ingestion URL                                                    |
| `ruleId`              | `string`                | _(required)_ | Immutable ID of the DCR                                              |
| `streamName`          | `string`                | _(required)_ | Custom stream name declared in the DCR                               |
| `id`                  | `string`                | `'dcr'`     | Sink identifier for the `SinkRegistry`                               |
| `supportedCategories` | `readonly string[]`     | `['*']`     | Categories to accept. `'*'` means all.                               |
| `credential`          | `TokenCredential`       | `DefaultAzureCredential` | Azure credential for authentication                    |

## DCR custom table schema

The stream declaration in the DCR must match the following 15-column schema:

| Column           | Azure type | Description                                      |
| ---------------- | ---------- | ------------------------------------------------ |
| `TimeGenerated`  | `datetime` | Ingest timestamp (set to the push time)          |
| `EventTs`        | `datetime` | Original event timestamp                         |
| `EventId`        | `string`   | Unique event identifier                          |
| `SessionId`      | `string`   | Session identifier                               |
| `Tool`           | `string`   | Tool that emitted the event                      |
| `ToolVersion`    | `string`   | Tool version string                              |
| `Category`       | `string`   | Event category                                   |
| `Ordinal`        | `long`     | Ordinal position within the session              |
| `PayloadSchema`  | `string`   | Payload schema identifier                        |
| `SchemaVersion`  | `int`      | Schema version (always `1`)                      |
| `SourceMachine`  | `string`   | Source machine identifier                        |
| `SourceUser`     | `string`   | User identifier (`''` if not provided)           |
| `TenantId`       | `string`   | Tenant identifier (`''` if not provided)         |
| `Payload`        | `string`   | JSON-serialised event payload                    |
| `PushedAt`       | `datetime` | Same as `TimeGenerated`; retained for queries    |

> **Why `Payload` is a string**  
> DCR custom log tables do not support the `dynamic` column type for ingestion
> via the Logs Ingestion API.  The payload is JSON-serialised to a `string`
> column and can be queried with `parse_json(Payload)` in KQL.

## Error handling

| Condition                          | Behaviour                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| HTTP 429 (rate-limited)            | Throws `RetriableSinkError` with `retryAfterMs` if header present |
| HTTP 5xx (server error)            | Throws `RetriableSinkError`                                   |
| Other HTTP errors or network faults | Events returned in `rejected` list                           |
| Unsupported category               | Event included in `rejected` list (upload not attempted)      |

## Development

```bash
# Type-check
pnpm --filter @agent-profiler/sink-dcr typecheck

# Run tests
pnpm --filter @agent-profiler/sink-dcr test

# Lint
pnpm --filter @agent-profiler/sink-dcr lint
```
