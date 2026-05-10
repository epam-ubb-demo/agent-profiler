# OTel Gateway — Integration Handover

This document helps teams integrate with the OTel Gateway by understanding the
telemetry schema, querying data in Application Insights, and building custom
adapters. It covers the mapping between OpenTelemetry semantic conventions and
Application Insights tables, provides ready-to-use KQL queries, and outlines
the recommended adapter architecture for consuming telemetry data
programmatically.

---

## 1. Application Insights Schema Mapping

OpenTelemetry spans are ingested by the OTel Collector and exported to Azure
Application Insights via the Azure Monitor exporter. The exporter maps OTel
concepts to Application Insights tables as follows:

| OTel Concept | App Insights Table | Notes |
|---|---|---|
| Span (kind=Server) | `requests` | Top-level `invoke_agent` spans |
| Span (kind=Client) | `dependencies` | LLM chat calls, tool executions |
| Span events / logs | `traces` | Log records and span events |
| Metrics | `customMetrics` | `gen_ai.usage.input_tokens`, `output_tokens`, cost, AIU |
| Exceptions | `exceptions` | Span status=ERROR with exception events |

> **Note:** The `customDimensions` column on every table carries the full set
> of OTel resource and span attributes as a dynamic (JSON) bag. Use
> `tostring(customDimensions["attribute.name"])` in KQL to extract them.

---

## 2. OTel GenAI Semantic Conventions Reference

The gateway emits attributes that follow the
[OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).
The table below lists the attributes most relevant for analytics and
dashboarding.

| Attribute | Type | Description | Example |
|---|---|---|---|
| `gen_ai.usage.input_tokens` | int | Input tokens consumed | `1500` |
| `gen_ai.usage.output_tokens` | int | Output tokens generated | `350` |
| `gen_ai.usage.cache_read_input_tokens` | int | Tokens served from cache | `800` |
| `gen_ai.usage.cache_creation_input_tokens` | int | Tokens used to populate cache | `200` |
| `gen_ai.request.model` | string | Model requested by caller | `claude-sonnet-4-20250514` |
| `gen_ai.response.model` | string | Model actually used | `claude-sonnet-4-20250514` |
| `gen_ai.conversation.id` | string | Conversation/session identifier | `conv_abc123` |
| `gen_ai.operation.name` | string | Operation type | `chat` |

---

## 3. GitHub-specific Attributes

In addition to the standard GenAI conventions, the gateway records
GitHub-specific dimensions that are essential for cost attribution and user
analytics.

| Attribute | Type | Description |
|---|---|---|
| `github.copilot.cost` | float | Estimated cost in USD for this operation |
| `github.copilot.aiu` | float | AI Units consumed |
| `enduser.pseudo.id` | string | Pseudonymised user identifier (not PII) |
| `session.id` | string | Copilot CLI session identifier |

> **Privacy:** `enduser.pseudo.id` is a one-way hash — it cannot be reversed to
> recover the original user identity. No personally identifiable information is
> stored in the telemetry pipeline.

---

## 4. Domain Model Mapping

The span hierarchy produced by the gateway maps directly to the domain model
defined in [ADR-0003](../decisions/ADR-0003-domain-model.md). Understanding
this mapping is critical when reconstructing domain objects from raw telemetry.

### Span hierarchy

```
invoke_agent (root span, kind=Server)
├── chat (LLM call, kind=Client)
│   └── gen_ai.usage.* attributes
├── execute_tool (tool call, kind=Client)
│   └── tool.name, tool.success attributes
└── chat (another LLM call)
```

### Domain model ↔ Span mapping

- **Session** → resource attribute `session.id` present on all spans within a
  session. Group spans by this attribute to reconstruct a full session.
- **Turn** → `invoke_agent` root span (one per user turn). The span's
  `traceId` uniquely identifies the turn.
- **ToolCall** → `execute_tool` child span. Linked to its parent turn via
  `parentSpanId`.

---

## 5. Ready-to-Use KQL Queries

The queries below can be executed directly in the Azure Portal (Application
Insights → Logs) or via the Azure Monitor Query SDK. All queries target the
Log Analytics workspace backing your Application Insights resource.

### 5.1 Total tokens by model (last 24 h)

Summarise token consumption across all models to identify which models drive
the most usage.

```kql
customMetrics
| where timestamp > ago(24h)
| where name in ("gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens")
| extend model = tostring(customDimensions["gen_ai.response.model"])
| summarize totalTokens = sum(value) by name, model
| order by totalTokens desc
```

### 5.2 Cost breakdown by user (pseudo ID)

Attribute estimated cost to pseudonymised users for charge-back or anomaly
detection.

```kql
customMetrics
| where timestamp > ago(24h)
| where name == "github.copilot.cost"
| extend userId = tostring(customDimensions["enduser.pseudo.id"])
| summarize totalCost = sum(value) by userId
| order by totalCost desc
```

### 5.3 Tool call frequency and success rate

Analyse which tools are called most frequently and where failures concentrate.

```kql
dependencies
| where timestamp > ago(24h)
| where name startswith "execute_tool"
| extend toolName = tostring(customDimensions["tool.name"])
| summarize 
    totalCalls = count(),
    successCalls = countif(success == true),
    failedCalls = countif(success == false)
    by toolName
| extend successRate = round(100.0 * successCalls / totalCalls, 1)
| order by totalCalls desc
```

### 5.4 Agent invocation duration percentiles

Track latency distribution of agent invocations over time to spot performance
regressions.

```kql
requests
| where timestamp > ago(24h)
| where name == "invoke_agent"
| summarize 
    p50 = percentile(duration, 50),
    p90 = percentile(duration, 90),
    p99 = percentile(duration, 99),
    count = count()
    by bin(timestamp, 1h)
| order by timestamp desc
```

### 5.5 Session compaction events

Monitor context-window compaction activity to understand how often sessions
exceed the token budget and require summarisation.

```kql
traces
| where timestamp > ago(7d)
| where message has "compaction" or message has "compact"
| extend sessionId = tostring(customDimensions["session.id"])
| summarize compactionCount = count() by sessionId, bin(timestamp, 1h)
| order by compactionCount desc
```

### 5.6 Error rate by model

Identify models with elevated error rates that may require investigation or
fallback configuration.

```kql
dependencies
| where timestamp > ago(24h)
| where name startswith "chat"
| extend model = tostring(customDimensions["gen_ai.response.model"])
| summarize 
    totalCalls = count(),
    errorCalls = countif(success == false)
    by model
| extend errorRate = round(100.0 * errorCalls / totalCalls, 2)
| order by errorRate desc
```

---

## 6. Suggested Adapter Architecture

To consume telemetry data programmatically (e.g. in the Agent Profiler UI),
build an Application Insights adapter that queries the Log Analytics workspace
and maps rows back to domain objects.

### Conceptual architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Agent Profiler  │────▶│  AppInsights      │────▶│  Log Analytics   │
│  UI / API        │     │  Adapter          │     │  Workspace       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Recommended approach

1. **Use the `@azure/monitor-query` npm package.** It provides a
   `LogsQueryClient` that executes KQL queries against a Log Analytics
   workspace and returns typed results.

2. **Create a data access layer** that encapsulates the KQL queries from
   [Section 5](#5-ready-to-use-kql-queries) and maps Application Insights rows
   back to domain objects (`Session`, `Turn`, `ToolCall`) as defined in
   [ADR-0003](../decisions/ADR-0003-domain-model.md).

3. **Use the Application Insights REST API** as a fallback when the SDK does
   not cover a specific scenario (e.g. Application Map queries or metric
   aggregations over custom time ranges).

4. **Cache aggressively.** Telemetry data is append-only; queries for completed
   sessions will not change. Cache results by `session.id` + time range to
   minimise query costs.

---

## 7. Authentication Guidance

### Querying Telemetry Data

Querying Application Insights data uses the **Log Analytics workspace ID**, not the connection string. The connection string is for the *ingestion* (write) path only.

1. Obtain the **workspace ID** from the Azure Portal:
   **Azure Portal → Log Analytics workspace → Overview → Workspace ID**

2. Use `@azure/monitor-query` with `DefaultAzureCredential`:

```typescript
import { LogsQueryClient } from "@azure/monitor-query";
import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();
const client = new LogsQueryClient(credential);

// Use the Log Analytics workspace ID, NOT the App Insights connection string
const workspaceId = "<your-log-analytics-workspace-id>";
const result = await client.queryWorkspace(workspaceId, "requests | take 10", {
  duration: "PT24H",
});
```

> **Important:** The `@agent-profiler/adapters-application-insights` package
> exposes the workspace ID via `AppInsightsConfig.workspaceId`. Use this
> rather than hard-coding the ID.

### Production — Managed Identity

For production query access, use Azure Managed Identity:

1. Assign the **Monitoring Reader** RBAC role to the managed identity on the
   Log Analytics workspace (or the Application Insights resource).
2. Use `DefaultAzureCredential` from the `@azure/identity` package — it
   automatically picks up the managed identity in Azure-hosted environments.

> **Important distinction:** The OTel Collector *exporter* uses a connection
> string to push telemetry data (write path). Managed Identity is recommended
> for the *query* path (read access from the adapter or UI).

---

## Related Documents

- [ADR-0003 — Domain Model](../decisions/ADR-0003-domain-model.md)
- [ADR-0008 — OTel Gateway Architecture](../decisions/ADR-0008-otel-gateway-architecture.md)
- [Client Configuration Guide](./otel-client-configuration.md)
- [Operations Runbook](../runbooks/otel-gateway-operations.md)
