# @agent-profiler/adapters-application-insights

Query adapter for [Azure Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview) (Log Analytics) workspaces.

## What it does

Wraps the Azure Monitor Logs Query SDK to execute KQL queries against a Log Analytics workspace. It provides:

- Typed query results mapped to row records
- Domain-specific error hierarchy for authentication, workspace resolution, and timeout failures
- A lightweight `testConnection()` health-check method

## API

```typescript
import { QueryClient } from '@agent-profiler/adapters-application-insights';

const client = new QueryClient({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
});
```

### `QueryClient`

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

### Data quality

Every `Session` carries a `parseStatus` field of type `ParseStatus`:

| Status | Meaning |
|---|---|
| `ok` | All rows parsed, tree constructed, and turns extracted successfully. |
| `partial` | Some data issues were encountered (orphan spans, validation errors, or no turns could be reconstructed) but a session was still produced. |
| `failed` | No usable span data was found. The returned `Session` contains empty collections. |

The `parseStatus.error` property provides a human-readable description when the status is not `ok`.

> **Design note:** The pipeline never throws. It always returns a `Session` object, using `parseStatus` to communicate data quality so that callers can decide how to present incomplete results.

### Unmapped fields

Some `Session` fields have no OTel equivalent and are populated with defaults:

- `copilotVersion` — empty string
- `compactions` — empty array
- `utilisation` — empty array

See [docs/spikes/spike-otel-span-to-session.md](../../docs/spikes/spike-otel-span-to-session.md) for the full field-mapping analysis.

## Configuration

`AppInsightsConfig` accepts the following properties:

| Property | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | `string` | Yes | Azure Log Analytics Workspace ID |
| `credential` | `TokenCredential` | No | Custom Azure credential (defaults to `DefaultAzureCredential`) |
| `timeoutMs` | `number` | No | Query timeout in milliseconds (default: 60 000) |

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

## Development

```bash
pnpm test          # run unit tests
pnpm typecheck     # TypeScript strict mode check
pnpm lint          # ESLint
```
