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
