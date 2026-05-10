# @agent-profiler/adapters-application-insights

Source adapter for reconstructing Agent Profiler `Session` objects from OTel spans in Azure Application Insights.

## What it does

Queries an Azure Log Analytics workspace, retrieves OTel span data, and transforms it through a 7-step pipeline into the canonical `Session` domain model (from `@agent-profiler/core`). The adapter produces:

- Turns and fan-out turns (parallel tool dispatch)
- Tool calls with arguments, duration, and success status
- Assistant messages with per-model token counts (input, output, cache read/write)
- User messages
- Sub-agent invocations
- Model metrics (aggregated per model)
- Shutdown metrics (session-level totals)

See [ADR-0007](../../docs/decisions/ADR-0007-application-insights-adapter.md) for the architectural rationale.

## API

### `ApplicationInsightsDataSource`

The primary API — implements the `SessionDataSource` interface from `@agent-profiler/data-source`.

```typescript
import { ApplicationInsightsDataSource } from '@agent-profiler/adapters-application-insights';

const dataSource = new ApplicationInsightsDataSource({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
});

// List sessions from the last 7 days
const sessions = await dataSource.listSessions();

// Load a specific session
const session = await dataSource.getSession('session-id');
```

#### Constructor configuration

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspaceId` | `string` | Yes | — | Azure Log Analytics Workspace ID (GUID) |
| `credential` | `TokenCredential` | No | `DefaultAzureCredential` | Custom Azure credential; accepts any `@azure/identity` `TokenCredential` implementation |
| `timeRange` | `TimeRange` | No | Last 7 days | Default time range for queries |
| `cache` | `SessionCache` | No | `undefined` | Optional session cache implementation (see [SessionCache](#sessioncache-extension-point)) |

#### Methods

| Method | Return type | Description |
|---|---|---|
| `isAvailable()` | `Promise<boolean>` | Tests connectivity to the workspace. Returns `true` if the workspace is reachable and credentials are valid. |
| `listSessions()` | `Promise<SessionSummary[]>` | Lists session summaries within the configured time range. |
| `getSession(sessionId)` | `Promise<Session>` | Loads and reconstructs a full `Session` by its ID. Returns a `Session` with `parseStatus` indicating data quality. |

### `QueryClient`

Lower-level API for executing arbitrary KQL queries. Used internally by `ApplicationInsightsDataSource`, but also available for advanced use cases.

```typescript
import { QueryClient } from '@agent-profiler/adapters-application-insights';

const client = new QueryClient({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
});
```

#### `query(kql: string, timeRange: TimeRange): Promise<QueryResult>`

Execute a KQL expression against the configured workspace.

```typescript
const result = await client.query(
  'traces | where severityLevel >= 3 | take 10',
  { startTime: new Date('2024-01-01'), endTime: new Date('2024-01-02') },
);

for (const row of result.rows) {
  console.log(row['message']);
}
```

#### `testConnection(): Promise<boolean>`

Verify connectivity to the workspace. Returns `true` on success, `false` on any error.

```typescript
const ok = await client.testConnection();
if (!ok) {
  console.error('Cannot reach Application Insights workspace');
}
```

## Span Transformation Pipeline

The package provides a complete pipeline for reconstructing Agent Profiler `Session` objects from raw OTel span data stored in Application Insights. Starting from flat query-result rows, the pipeline handles validation, deduplication, tree construction, turn extraction, metrics aggregation, and final assembly — producing an immutable `Session` ready for the UI.

### `assembleSession`

`assembleSession` is the main entry point. Pass in the raw rows from a `QueryClient.query()` call and receive a fully assembled `Session`:

```typescript
import { assembleSession } from '@agent-profiler/adapters-application-insights';

// Raw rows from a QueryClient.query() call
const result = await client.query(kql, timeRange);
const session = assembleSession(result.rows);

console.log(session.sessionId);
console.log(session.turns.length);
console.log(session.parseStatus.status); // 'ok' | 'partial' | 'failed'
```

Internally the function executes a seven-step pipeline:

1. **Parse** — Validates raw rows against a Zod schema, producing typed `OTelSpan` objects.
2. **Deduplicate** — Removes duplicate span IDs, keeping the entry with the latest timestamp.
3. **Build tree** — Reconstructs the parent–child hierarchy from `spanId` / `parentSpanId` references.
4. **Extract turns** — Identifies turn boundaries from `copilot_chat.turn.id` attributes (or infers them from tree depth when the attribute is absent).
5. **Map events** — Transforms spans into domain objects: `Turn`, `ToolCall`, `AssistantMessage`, `UserMessage`, and `SubagentInvocation`.
6. **Aggregate metrics** — Computes `ModelMetrics` and `ShutdownMetrics` from LLM spans, grouping token counts and request durations by model.
7. **Assemble** — Produces the final immutable `Session` together with a `ParseStatus` describing data quality.

### Lower-level API

For advanced usage the package also exports the individual pipeline stages:

| Function | Description |
|---|---|
| `parseSpanRow(row)` | Validate and parse a single raw row into an `OTelSpan`. Throws on invalid input. |
| `parseSpanRows(rows)` | Batch parse with error collection — never throws; parse failures are captured in the returned `errors` array. |
| `groupSpansBySession(spans)` | Group spans by session identity (`copilot_chat.session.id`, falling back to `traceId`). |
| `deduplicateSpans(spans)` | Remove duplicate span IDs, keeping the latest timestamp for each. |
| `safeInt(value)` | Parse an integer from a string, returning `0` for `null`, `undefined`, empty, or non-numeric values. |
| `DEFAULT_MAX_SPAN_COUNT` | The default span limit (10 000) used for truncation detection. |

### Data quality

Every `Session` carries a `parseStatus` field of type `ParseStatus`:

| Status | Meaning |
|---|---|
| `ok` | All rows parsed, tree constructed, and turns extracted successfully. |
| `partial` | Some data issues were encountered (orphan spans, validation errors, or no turns could be reconstructed) but a session was still produced. |
| `failed` | No usable span data was found. The returned `Session` contains empty collections. |

The `parseStatus.error` property provides a human-readable description when the status is not `ok`.

> **Design note:** The pipeline never throws. It always returns a `Session` object, using `parseStatus` to communicate data quality so that callers can decide how to present incomplete results.

## OTel Attribute → Session Field Mapping

The table below shows how OTel span attributes map to `Session` domain fields.

> **Notation:** `∥` denotes a fallback — the adapter checks the first attribute and, if absent, falls back to the second.

| OTel Attribute | Session Field | Notes |
|---|---|---|
| `copilot_chat.session.id` ∥ `operation_Id` | `sessionId` | Prefers explicit session ID; falls back to trace ID |
| `gen_ai.request.model` (first LLM span) | `selectedModel` | From chronologically earliest LLM span |
| `gen_ai.response.model` ∥ `gen_ai.request.model` | `AssistantMessage.model` | Per-span model |
| `gen_ai.usage.input_tokens` ∥ `gen_ai.usage.prompt_tokens` | `AssistantMessage.inputTokens` | Fallback between naming conventions |
| `gen_ai.usage.output_tokens` ∥ `gen_ai.usage.completion_tokens` | `AssistantMessage.outputTokens` | Fallback between naming conventions |
| `gen_ai.usage.cache_read_tokens` | `AssistantMessage.cacheReadTokens` | `0` if absent |
| `gen_ai.usage.cache_write_tokens` | `AssistantMessage.cacheWriteTokens` | `0` if absent |
| `copilot_chat.turn.id` | `Turn.turnId` | Falls back to synthesised `turn-{N}` |
| `copilot_chat.tool.call.name` | `ToolCall.toolName` | Falls back to span name |
| `copilot_chat.tool.call.id` | `ToolCall.toolCallId` | Falls back to span ID |
| `copilot_chat.tool.call.arguments` | `ToolCall.argumentsPreview` | Truncated to 200 chars |
| `copilot_chat.tool.call.success` | `ToolCall.success` | Falls back to span `success` |
| `copilot_chat.subagent.name` | `SubagentInvocation.agentName` | |
| `copilot_chat.subagent.type` | `SubagentInvocation.agentType` | |
| `copilot_chat.message.role` | (classification) | `user` → UserMessage span |
| `copilot_chat.message.content` | `UserMessage.content`, `AssistantMessage.content` | |
| `copilot_chat.reasoning.text` | `AssistantMessage.reasoningText` | |
| `copilot_chat.context.repository` | `Session.repository` | Empty string if absent |
| `copilot_chat.context.branch` | `Session.branch` | Empty string if absent |
| `copilot_chat.context.cwd` | `Session.cwd` | Empty string if absent |
| `copilot_chat.interaction.id` | `AssistantMessage.interactionId` | |

For the full field-mapping analysis, see [docs/spikes/spike-otel-span-to-session.md](../../docs/spikes/spike-otel-span-to-session.md).

## SessionCache Extension Point

The adapter exposes a `SessionCache` interface for callers to inject caching. The adapter itself does not implement caching — it only provides the integration point. Cache read/write failures are silently ignored to avoid affecting query results.

```typescript
import type { SessionCache } from '@agent-profiler/adapters-application-insights';
import { ApplicationInsightsDataSource } from '@agent-profiler/adapters-application-insights';

const cache: SessionCache = {
  get: (id) => myStore.get(id),
  set: (id, session) => myStore.set(id, session),
  has: (id) => myStore.has(id),
  delete: (id) => myStore.delete(id),
  clear: () => myStore.clear(),
};

const dataSource = new ApplicationInsightsDataSource({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  cache,
});
```

All `SessionCache` methods are optional. If a method is not provided, that operation is a no-op.

## Configuration

`AppInsightsConfig` accepts the following properties:

| Property | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | `string` | Yes | Azure Log Analytics Workspace ID |
| `credential` | `TokenCredential` | No | Custom Azure credential (defaults to `DefaultAzureCredential`) |
| `timeoutMs` | `number` | No | Query timeout in milliseconds (default: 60 000) |
| `maxSpanCount` | `number` | No | Truncation detection threshold — when the result set reaches this count, the session is flagged as potentially truncated (default: 10 000) |

> **Truncation detection:** When a session query returns rows equal to or exceeding `maxSpanCount`, the data source flags the result as truncated and sets `parseStatus` to `{ status: 'partial', error: '…' }`. This avoids silently presenting incomplete sessions. Adjust `maxSpanCount` upward for workspaces with very large sessions.

For authentication setup, see the [Azure Authentication Setup Guide](../../docs/guides/azure-authentication-setup.md).

## Error handling

All SDK errors are mapped to domain-specific error classes:

| Error class | Code | Trigger |
|---|---|---|
| `AuthenticationError` | `AUTHENTICATION_FAILED` | Credential resolution or authentication failure |
| `WorkspaceNotFoundError` | `WORKSPACE_NOT_FOUND` | Target workspace does not exist or is inaccessible |
| `QueryTimeoutError` | `QUERY_TIMEOUT` | KQL query exceeds the configured timeout |
| `AppInsightsError` | `UNKNOWN` | Any other unexpected error |

```typescript
import {
  AuthenticationError,
  WorkspaceNotFoundError,
  QueryTimeoutError,
} from '@agent-profiler/adapters-application-insights';

try {
  await client.query('traces | take 1', timeRange);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed — check credentials');
  } else if (error instanceof WorkspaceNotFoundError) {
    console.error('Workspace not found — verify workspace ID');
  } else if (error instanceof QueryTimeoutError) {
    console.error('Query timed out — try a shorter time range');
  }
}
```

## Known Limitations

The following `Session` fields cannot be populated from OTel span data and always contain default values:

| Session Field | Default Value | Reason |
|---|---|---|
| `copilotVersion` | `''` (empty string) | Not emitted by the OTel Gateway |
| `reasoningEffort` | `''` (empty string) | Not emitted by the OTel Gateway |
| `compactions` | `[]` (empty array) | Compaction events land in `AppTraces`, not currently queried |
| `utilisation` | `[]` (empty array) | No OTel equivalent for utilisation samples |
| `ShutdownMetrics.currentTokens` | `0` | No OTel equivalent |
| `ShutdownMetrics.systemTokens` | `0` | No OTel equivalent |
| `ShutdownMetrics.conversationTokens` | `0` | No OTel equivalent |
| `ShutdownMetrics.toolDefinitionsTokens` | `0` | No OTel equivalent |
| `ShutdownMetrics.codeChanges` | `{}` (empty object) | No OTel equivalent |

Context fields (`repository`, `branch`, `cwd`) may be empty if the OTel Gateway does not emit `copilot_chat.context.*` resource attributes.

For the full gap analysis, see [docs/spikes/spike-otel-span-to-session.md](../../docs/spikes/spike-otel-span-to-session.md).

## Development

```bash
pnpm test              # run unit tests
pnpm test:coverage     # run tests with v8 coverage (thresholds: 80% lines/funcs/stmts, 75% branches)
pnpm typecheck         # TypeScript strict mode check
pnpm lint              # ESLint
```

### Integration tests

Integration tests exercise the real Azure SDK against a live Log Analytics workspace and are **skipped by default** in CI. To run them locally:

```bash
APPINSIGHTS_WORKSPACE_ID=<guid> pnpm --filter @agent-profiler/adapters-application-insights test
```

Prerequisites:
- A valid Azure Log Analytics workspace GUID
- Azure credentials available via `DefaultAzureCredential` (e.g. `az login`)

The integration test suite covers `isAvailable()`, `listSessions()`, `getSession()`, and graceful failure with an invalid workspace ID.
