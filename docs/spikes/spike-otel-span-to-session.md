# Spike: OTel Span → Session Reconstruction

## Status / Meta

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| **Status**     | Draft                                        |
| **Author**     | Agent Profiler team                          |
| **Created**    | 2025-07-18                                   |
| **Work Item**  | [#262](https://github.com/epam-ubb-demo/agent-profiler/issues/262) — T8.1.1 |
| **Parent**     | [#249](https://github.com/epam-ubb-demo/agent-profiler/issues/249) — F8.1 Design Spike |
| **Phase**      | P8                                           |

---

## 1. Problem Statement

Agent Profiler currently reconstructs `Session` objects from **proprietary event streams** — Copilot CLI JSONL logs and VS Code Chat transcripts — using adapter-specific parsers (`packages/adapters-copilot-cli`, `packages/adapters-vscode-chat`). These adapters consume structured event envelopes with domain-specific types (`session.start`, `tool.execution_start`, `assistant.message`, etc.) and accumulate them into the core `Session` domain model via a `SessionBuilder` pattern.

A new **OTel Gateway** (built by a separate team) instruments GitHub Copilot agents with OpenTelemetry spans that are exported to **Azure Application Insights**. The raw telemetry lands as flat rows in Log Analytics Workspace tables (`AppTraces`, `AppDependencies`, `AppRequests`, `customMetrics`). These spans carry `gen_ai.*` semantic conventions and custom `copilot_chat.*` attributes, but have no concept of the hierarchical `Session → Turn → FanoutTurn` structure that Agent Profiler requires.

**This spike investigates how to reconstruct the Agent Profiler `Session` domain model from flat OTel spans**, covering:

- Field-by-field mapping from OTel attributes to domain types
- Turn and fan-out reconstruction from span parent-child hierarchies
- KQL queries for data retrieval from Application Insights
- Edge cases and failure modes
- A complete reconstruction algorithm

The output of this spike directly informs the implementation of a new `packages/adapters-application-insights` adapter package.

---

## 2. OTel Data Model in Application Insights

### 2.1 How OTel Spans Land in Application Insights

When the OTel Gateway exports spans, Application Insights stores them across several tables:

| AI Table           | OTel Concept                | Typical Content                                         |
| ------------------ | --------------------------- | ------------------------------------------------------- |
| `AppRequests`      | Server spans (root/inbound) | Top-level session or turn spans                         |
| `AppDependencies`  | Client/internal spans       | LLM calls, tool executions, sub-agent invocations       |
| `AppTraces`        | Log records / events        | Structured log events (user messages, compaction, etc.) |
| `customMetrics`    | Metric data points          | Token counts, cost metrics, durations                   |
| `customDimensions` | (column, not table)         | JSON bag of all non-standard OTel attributes per row    |

Each row in `AppRequests` / `AppDependencies` carries:

| Column              | OTel Field          | Notes                                          |
| ------------------- | -------------------- | ---------------------------------------------- |
| `operation_Id`      | `traceId`            | Groups all spans belonging to one trace        |
| `id`                | `spanId`             | Unique identifier for this span                |
| `operation_ParentId`| `parentSpanId`       | Links child → parent                           |
| `timestamp`         | `startTime`          | Span start (UTC)                               |
| `duration`          | `endTime - startTime`| Kusto timespan — derive milliseconds via `duration / 1ms` in KQL |
| `name`              | Span name            | Operation name (e.g., `chat`, `tool.Read`)     |
| `success`           | `status.code`        | Boolean derived from OTel status                |
| `customDimensions`  | Span attributes      | JSON bag of all `gen_ai.*`, `copilot_chat.*` attributes |
| `operation_Name`    | Root span name       | Propagated from the trace root                 |

### 2.2 Relevant OTel Semantic Conventions

The OTel Gateway emits spans using [OpenTelemetry Semantic Conventions for Generative AI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) plus custom `copilot_chat.*` attributes:

| OTel Attribute                        | Type     | Scope            | Description                                   |
| ------------------------------------- | -------- | ---------------- | --------------------------------------------- |
| `gen_ai.system`                       | string   | Span attribute   | AI system identifier (e.g., `github_copilot`) |
| `gen_ai.request.model`                | string   | Span attribute   | Model requested (e.g., `claude-sonnet-4-20250514`) |
| `gen_ai.response.model`               | string   | Span attribute   | Model actually used                           |
| `gen_ai.usage.input_tokens`           | int      | Span attribute   | Input/prompt tokens consumed                  |
| `gen_ai.usage.output_tokens`          | int      | Span attribute   | Output/completion tokens produced             |
| `gen_ai.usage.prompt_tokens`          | int      | Span attribute   | Alternative key for input tokens              |
| `gen_ai.usage.completion_tokens`      | int      | Span attribute   | Alternative key for output tokens             |
| `gen_ai.response.finish_reason`       | string   | Span attribute   | `stop`, `length`, `tool_calls`, etc.          |
| `github.copilot.cost`                 | float    | Span attribute   | Cost metric (assumed per-span)                |
| `enduser.pseudo.id`                   | string   | Resource attr.   | Pseudonymous user identifier                  |
| `copilot_chat.turn.id`                | string   | Span attribute   | Turn identifier within a session              |
| `copilot_chat.interaction.id`         | string   | Span attribute   | Interaction/request identifier                |
| `copilot_chat.agent.turn.count`       | int      | Span attribute   | Running turn counter                          |
| `copilot_chat.tool.call.id`           | string   | Span attribute   | Unique tool call identifier                   |
| `copilot_chat.tool.call.name`         | string   | Span attribute   | Tool name (e.g., `Read`, `Edit`, `Bash`)      |
| `copilot_chat.tool.call.arguments`    | string   | Span attribute   | Serialised tool arguments (may be truncated)  |
| `copilot_chat.tool.call.success`      | boolean  | Span attribute   | Tool execution outcome                        |
| `copilot_chat.subagent.name`          | string   | Span attribute   | Sub-agent name                                |
| `copilot_chat.subagent.type`          | string   | Span attribute   | Sub-agent type (e.g., `task`, `explore`)      |
| `copilot_chat.session.id`             | string   | Resource/span    | Copilot session identifier                    |
| `copilot_chat.message.role`           | string   | Span attribute   | `user`, `assistant`, `system`                 |
| `copilot_chat.message.content`        | string   | Span attribute   | Message text (may be truncated/redacted)      |
| `copilot_chat.reasoning.text`         | string   | Span attribute   | Extended thinking / reasoning content         |

> **Note:** Attribute names are stored inside the `customDimensions` JSON column in Application Insights. Access them via `tostring(customDimensions.["gen_ai.request.model"])` in KQL.

---

## 3. Field-by-Field Mapping

### 3.1 Session-Level Fields

| Session Field       | OTel Source                                                     | Mapping Strategy                                                                                                    |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sessionId`         | `copilot_chat.session.id` or `operation_Id` (traceId)          | Prefer `copilot_chat.session.id` if present; fall back to `operation_Id`. See §8 Q1.                               |
| `copilotVersion`    | *Not emitted* — see §7                                          | Default: `''` (empty string). May appear as a resource attribute in future.                                         |
| `selectedModel`     | `gen_ai.request.model` on the first LLM span                   | Take from the earliest `gen_ai.request.model` in the trace.                                                         |
| `reasoningEffort`   | *Not emitted* — see §7                                          | Default: `''`. May appear as `copilot_chat.reasoning.effort` resource attribute.                                    |
| `repository`        | *Not reliably emitted* — see §7                                 | Default: `''`. Check for `copilot_chat.context.repository` resource attribute.                                      |
| `branch`            | *Not reliably emitted* — see §7                                 | Default: `''`. Check for `copilot_chat.context.branch` resource attribute.                                          |
| `cwd`               | *Not reliably emitted* — see §7                                 | Default: `''`. Check for `copilot_chat.context.cwd` resource attribute.                                             |
| `startTs`           | `MIN(timestamp)` across all spans in the session                | Computed from span timestamps.                                                                                       |
| `endTs`             | `MAX(timestamp + duration)` across all spans                    | Computed: `endTs = timestamp + duration` for each span; take the maximum.                                            |
| `success`           | `success` on the terminal/root span, or derived                 | `true` if root span has `success == true`; `false` if any span has non-OK status; `null` if indeterminate.          |
| `parseStatus`       | N/A — set by the adapter                                         | Produced by the reconstruction algorithm itself (see §5).                                                            |

**Session boundary strategy:**

```
IF copilot_chat.session.id is present on spans:
  → Group by copilot_chat.session.id (one session per unique value)
ELSE:
  → Group by operation_Id (one session per trace)
  → A single session may have multiple traces if the agent reconnects;
    group by enduser.pseudo.id + time-window heuristic (see §6)
```

### 3.2 Turn & FanoutTurn Reconstruction

Turns represent the logical interaction loop: user prompt → LLM response → tool calls → next prompt. In OTel data, turns are not explicit entities but are inferred from span structure.

**Strategy: Span-tree depth analysis**

The OTel span tree typically follows this structure:

```
Root span (session)                               → Session
├── Turn span (depth 1)                           → Turn / FanoutTurn
│   ├── LLM call span (depth 2)                  → AssistantMessage
│   │   └── (token metrics on span attributes)
│   ├── Tool call span (depth 2)                  → ToolCall
│   │   └── Tool execution child (depth 3)
│   ├── Tool call span (depth 2)                  → ToolCall (parallel fan-out)
│   └── Sub-agent span (depth 2)                  → SubagentInvocation
│       ├── Sub-agent LLM call (depth 3)
│       └── Sub-agent tool call (depth 3)
├── Turn span (depth 1)                           → Next Turn
│   └── ...
└── Shutdown span (depth 1)                       → ShutdownMetrics
```

**Turn identification algorithm:**

1. If `copilot_chat.turn.id` is present on spans → group by that attribute directly (same approach as the existing `turnId` in JSONL events).
2. If absent → infer turns from depth-1 children of the root span, ordered by `timestamp`.
3. Each depth-1 child becomes a `Turn`. Its `turnId` is synthesised as `turn-{index}` (0-based).

**FanoutTurn identification:**

A `FanoutTurn` is a turn where the LLM dispatched multiple tool calls in parallel. Detection:

```
A Turn is a FanoutTurn IF:
  - It contains > 1 ToolCall spans, AND
  - Those ToolCall spans have overlapping time ranges
    (i.e., span B starts before span A ends)
```

`FanoutTurn` objects are reconstructed independently from the span tree — they are not simple mirrors of `Turn` objects. The Copilot CLI adapter builds `fanoutTurns` with separate logic, and the VS Code chat adapter returns `fanoutTurns: []`. This adapter should reconstruct `fanoutTurns` from the span tree where parallel tool calls are detected, and return an empty array when no fan-out structure is observed.

**Mapping to domain types:**

| Turn Field          | OTel Source                                                    |
| ------------------- | -------------------------------------------------------------- |
| `turnId`            | `copilot_chat.turn.id` or synthesised `turn-{N}`              |
| `startTs`           | `MIN(timestamp)` of all spans in the turn                      |
| `endTs`             | `MAX(timestamp + duration)` of all spans in the turn           |
| `userMessage`       | Span/event with `copilot_chat.message.role == 'user'`         |
| `assistantMessages` | Spans with `gen_ai.usage.*` attributes (LLM calls)            |
| `toolCalls`         | Spans with `copilot_chat.tool.call.name` attribute            |
| `subagents`         | Spans with `copilot_chat.subagent.name` attribute             |

### 3.3 AssistantMessage Mapping

Each LLM call span (identified by the presence of `gen_ai.usage.*` attributes) maps to one `AssistantMessage`:

| AssistantMessage Field | OTel Source                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `interactionId`        | `copilot_chat.interaction.id` or `null`                            |
| `requestId`            | `spanId` (the span's own ID serves as a unique request identifier) |
| `outputTokens`         | `gen_ai.usage.output_tokens` ∥ `gen_ai.usage.completion_tokens`   |
| `inputTokens`          | `gen_ai.usage.input_tokens` ∥ `gen_ai.usage.prompt_tokens`        |
| `cacheReadTokens`      | `gen_ai.usage.cache_read_tokens` or `0`                           |
| `cacheWriteTokens`     | `gen_ai.usage.cache_write_tokens` or `0`                          |
| `model`                | `gen_ai.response.model` ∥ `gen_ai.request.model`                  |
| `timestamp`            | Span `timestamp` (ISO 8601)                                        |
| `turnId`               | Inherited from parent Turn                                          |
| `eventId`              | `spanId`                                                            |
| `parentId`             | `parentSpanId`                                                      |
| `content`              | `copilot_chat.message.content` (if role == `assistant`) or `''`    |
| `reasoningText`        | `copilot_chat.reasoning.text` or `''`                              |

> **`∥` denotes fallback**: try the first attribute; if absent, use the second.

**Token attribute resolution:**

```typescript
function resolveTokens(dims: Partial<Record<string, string>>): { input: number; output: number } {
  return {
    input:  safeInt(dims['gen_ai.usage.input_tokens'])
         || safeInt(dims['gen_ai.usage.prompt_tokens'])
         || 0,
    output: safeInt(dims['gen_ai.usage.output_tokens'])
         || safeInt(dims['gen_ai.usage.completion_tokens'])
         || 0,
  };
}
```

### 3.4 ToolCall Mapping

Tool call spans are identified by the presence of `copilot_chat.tool.call.name` in `customDimensions`:

| ToolCall Field      | OTel Source                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `toolCallId`        | `copilot_chat.tool.call.id` ∥ `spanId`                                 |
| `toolName`          | `copilot_chat.tool.call.name` ∥ span `name`                            |
| `model`             | Inherited from the parent LLM span's `gen_ai.request.model` or `null`  |
| `startTs`           | Span `timestamp`                                                        |
| `endTs`             | `timestamp + duration` (computed)                                       |
| `durationMs`        | Span `duration` — derive via `duration / 1ms` in KQL (Application Insights stores duration as a Kusto timespan, not raw milliseconds) |
| `success`           | `copilot_chat.tool.call.success` ∥ span `success`                      |
| `parentId`          | `parentSpanId`                                                          |
| `turnId`            | Inherited from parent Turn                                              |
| `eventId`           | `spanId`                                                                |
| `argumentsPreview`  | `copilot_chat.tool.call.arguments` truncated to 200 chars              |

**Note on paired events:** The JSONL adapter tracks separate `tool.execution_start` and `tool.execution_complete` events, linked by `toolCallId`. In OTel, a single span represents the full tool execution lifecycle (start → end), so no pairing logic is needed. This simplifies the adapter.

### 3.5 SubagentInvocation Detection

Sub-agent spans are identified by `copilot_chat.subagent.name` in `customDimensions`. A sub-agent span typically has its own child spans (LLM calls, tool calls) forming a nested trace subtree.

| SubagentInvocation Field | OTel Source                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| `timestamp`              | Span `timestamp`                                                      |
| `totalTokens`            | Sum of `gen_ai.usage.input_tokens + gen_ai.usage.output_tokens` across all child spans |
| `messageCount`           | Count of child spans with `gen_ai.usage.*` attributes                 |
| `toolCallCount`          | Count of child spans with `copilot_chat.tool.call.name`              |
| `turnId`                 | Inherited from parent Turn                                            |
| `eventId`                | `spanId`                                                              |
| `parentId`               | `parentSpanId`                                                        |
| `agentName`              | `copilot_chat.subagent.name`                                         |
| `agentType`              | `copilot_chat.subagent.type`                                         |
| `childSessionRef`        | `copilot_chat.session.id` on the sub-agent's root span, or `null`   |

**Detection heuristic:**

```
A span is a SubagentInvocation IF:
  - customDimensions contains 'copilot_chat.subagent.name', OR
  - span name matches pattern 'subagent.*' or 'agent.*', AND
  - the span has child spans (it is not a leaf)
```

### 3.6 Compaction Events

Context-window compaction events are emitted as structured log records (landing in `AppTraces`), not as spans. They do not have a natural span representation because compaction is a metadata event, not an operation with duration.

| Compaction Field | OTel Source                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| `timestamp`      | `AppTraces.timestamp`                                                      |
| `inputTokens`    | `customDimensions.["compaction.input_tokens"]` or `0`                      |
| `outputTokens`   | `customDimensions.["compaction.output_tokens"]` or `0`                     |
| `cacheRead`      | `customDimensions.["compaction.cache_read_tokens"]` or `0`                 |
| `cacheWrite`     | `customDimensions.["compaction.cache_write_tokens"]` or `0`                |
| `model`          | `customDimensions.["compaction.model"]` or `null`                          |
| `turnId`         | `customDimensions.["copilot_chat.turn.id"]` or `null`                      |

**Fallback:** If the OTel Gateway does not emit compaction events as structured logs, this array will be empty. The adapter should set `compactions: []` and note this in `parseStatus`.

### 3.7 ShutdownMetrics & ModelMetrics

Shutdown metrics summarise the session's final state. In the JSONL format, these arrive as a dedicated `session.shutdown` event. In OTel, the equivalent data must be aggregated from individual spans:

| ShutdownMetrics Field     | OTel Source / Derivation                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `totalPremiumRequests`    | Count of spans with `gen_ai.usage.*` attributes                      |
| `totalApiDurationMs`      | Sum of `duration` for all LLM call spans                             |
| `modelMetrics`            | Group LLM spans by `gen_ai.response.model`, aggregate per model      |
| `currentTokens`           | *Not available* — default `0`                                        |
| `systemTokens`            | *Not available* — default `0`                                        |
| `conversationTokens`      | *Not available* — default `0`                                        |
| `toolDefinitionsTokens`   | *Not available* — default `0`                                        |
| `codeChanges`             | *Not available* — default `{}`                                       |
| `timestamp`               | `endTs` of the session                                                |

**ModelMetrics aggregation (per model):**

```typescript
function aggregateModelMetrics(llmSpans: OTelSpan[]): ModelMetrics[] {
  // Mutable accumulator — converted to readonly ModelMetrics at the end
  interface ModelAccumulator {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    requestCount: number;
    premiumRequestCost: number;
    apiDurationMs: number;
  }

  const byModel = new Map<string, ModelAccumulator>();

  for (const span of llmSpans) {
    const model = span.dims['gen_ai.response.model']
               ?? span.dims['gen_ai.request.model']
               ?? 'unknown';
    const acc = byModel.get(model) ?? {
      model, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      reasoningTokens: 0, requestCount: 0,
      premiumRequestCost: 0, apiDurationMs: 0,
    };
    acc.inputTokens  += safeInt(span.dims['gen_ai.usage.input_tokens']);
    acc.outputTokens += safeInt(span.dims['gen_ai.usage.output_tokens']);
    acc.cacheReadTokens  += safeInt(span.dims['gen_ai.usage.cache_read_tokens']);
    acc.cacheWriteTokens += safeInt(span.dims['gen_ai.usage.cache_write_tokens']);
    acc.requestCount += 1;
    acc.apiDurationMs += span.durationMs;
    byModel.set(model, acc);
  }

  // Freeze into readonly ModelMetrics
  return [...byModel.values()].map((acc): ModelMetrics => ({ ...acc }));
}
```

### 3.8 UtilisationSample

Utilisation samples track context-window fill over time. These are not part of standard OTel semantic conventions and are unlikely to be emitted by the gateway.

| UtilisationSample Field | OTel Source                     |
| ----------------------- | ------------------------------- |
| `timestamp`             | *Not available*                 |
| `percentage`            | *Not available*                 |
| `used`                  | *Not available*                 |
| `total`                 | *Not available*                 |
| `buckets`               | *Not available*                 |

**Recommendation:** Set `utilisation: []`. If the OTel Gateway later emits utilisation events (e.g., as `customMetrics` with `name == 'context_window_utilisation'`), the adapter can be extended to query and map them.

---

## 4. KQL Queries

All queries target an Azure Log Analytics Workspace connected to Application Insights. Replace `<workspace>` with the actual workspace identifier.

### 4.1 List Sessions

Groups spans by session identifier and returns a summary row per session.

```kql
// List all sessions with summary statistics
// Uses copilot_chat.session.id if available, otherwise falls back to operation_Id
let sessionSpans = AppDependencies
| union AppRequests
| where isnotempty(customDimensions)
| extend sessionId = iif(
    isnotempty(tostring(customDimensions.["copilot_chat.session.id"])),
    tostring(customDimensions.["copilot_chat.session.id"]),
    operation_Id
  )
| where isnotempty(sessionId);
sessionSpans
| extend turnId = tostring(customDimensions.["copilot_chat.turn.id"])
| summarize
    startTs          = min(timestamp),
    endTs            = max(timestamp + duration),
    spanCount        = count(),
    turnCount        = dcountif(turnId, isnotempty(turnId)),
    llmCallCount     = countif(isnotempty(tostring(customDimensions.["gen_ai.usage.input_tokens"]))),
    toolCallCount    = countif(isnotempty(tostring(customDimensions.["copilot_chat.tool.call.name"]))),
    totalInputTokens = sum(toint(customDimensions.["gen_ai.usage.input_tokens"])),
    totalOutputTokens= sum(toint(customDimensions.["gen_ai.usage.output_tokens"])),
    selectedModel    = take_any(tostring(customDimensions.["gen_ai.request.model"])),
    userId           = take_any(tostring(customDimensions.["enduser.pseudo.id"]))
  by sessionId
| order by startTs desc
| take 100
```

### 4.2 Get All Spans for a Session

Retrieves the complete span tree for a single session, ordered for reconstruction.

```kql
// Get all spans for a specific session, ordered by timestamp
// Replace <SESSION_ID> with the target session identifier
let targetSession = "<SESSION_ID>";
let spans = AppDependencies
| union AppRequests
| where operation_Id == targetSession
    or tostring(customDimensions.["copilot_chat.session.id"]) == targetSession
| project
    spanId           = id,
    parentSpanId     = operation_ParentId,
    traceId          = operation_Id,
    spanName         = name,
    spanTimestamp     = timestamp,
    spanDuration     = duration,
    durationMs       = duration / 1ms,
    spanSuccess      = success,
    // gen_ai.* attributes
    requestModel     = tostring(customDimensions.["gen_ai.request.model"]),
    responseModel    = tostring(customDimensions.["gen_ai.response.model"]),
    inputTokens      = toint(customDimensions.["gen_ai.usage.input_tokens"]),
    outputTokens     = toint(customDimensions.["gen_ai.usage.output_tokens"]),
    cacheReadTokens  = toint(customDimensions.["gen_ai.usage.cache_read_tokens"]),
    cacheWriteTokens = toint(customDimensions.["gen_ai.usage.cache_write_tokens"]),
    // copilot_chat.* attributes
    turnId           = tostring(customDimensions.["copilot_chat.turn.id"]),
    interactionId    = tostring(customDimensions.["copilot_chat.interaction.id"]),
    toolCallId       = tostring(customDimensions.["copilot_chat.tool.call.id"]),
    toolCallName     = tostring(customDimensions.["copilot_chat.tool.call.name"]),
    toolCallSuccess  = tobool(customDimensions.["copilot_chat.tool.call.success"]),
    toolCallArgs     = tostring(customDimensions.["copilot_chat.tool.call.arguments"]),
    subagentName     = tostring(customDimensions.["copilot_chat.subagent.name"]),
    subagentType     = tostring(customDimensions.["copilot_chat.subagent.type"]),
    messageRole      = tostring(customDimensions.["copilot_chat.message.role"]),
    messageContent   = tostring(customDimensions.["copilot_chat.message.content"]),
    reasoningText    = tostring(customDimensions.["copilot_chat.reasoning.text"]),
    copilotCost      = todouble(customDimensions.["github.copilot.cost"]),
    sessionIdAttr    = tostring(customDimensions.["copilot_chat.session.id"]),
    allDimensions    = customDimensions
| order by spanTimestamp asc;
// Also fetch structured log events (compaction, etc.)
let logEvents = AppTraces
| where operation_Id == targetSession
    or tostring(customDimensions.["copilot_chat.session.id"]) == targetSession
| project
    traceId       = operation_Id,
    logTimestamp   = timestamp,
    message,
    severityLevel,
    customDimensions
| order by logTimestamp asc;
spans;
logEvents
```

### 4.3 Session Metrics / Token Counts

Aggregates token usage and cost data per session, broken down by model.

```kql
// Token usage and cost summary per session, grouped by model
let targetSession = "<SESSION_ID>";
AppDependencies
| union AppRequests
| where operation_Id == targetSession
    or tostring(customDimensions.["copilot_chat.session.id"]) == targetSession
| where isnotempty(tostring(customDimensions.["gen_ai.usage.input_tokens"]))
| extend
    model        = coalesce(
        tostring(customDimensions.["gen_ai.response.model"]),
        tostring(customDimensions.["gen_ai.request.model"]),
        "unknown"
    ),
    inputTokens  = toint(coalesce(
        customDimensions.["gen_ai.usage.input_tokens"],
        customDimensions.["gen_ai.usage.prompt_tokens"],
        "0"
    )),
    outputTokens = toint(coalesce(
        customDimensions.["gen_ai.usage.output_tokens"],
        customDimensions.["gen_ai.usage.completion_tokens"],
        "0"
    )),
    cacheRead    = toint(customDimensions.["gen_ai.usage.cache_read_tokens"]),
    cacheWrite   = toint(customDimensions.["gen_ai.usage.cache_write_tokens"]),
    cost         = todouble(customDimensions.["github.copilot.cost"])
| summarize
    requestCount      = count(),
    totalInputTokens  = sum(inputTokens),
    totalOutputTokens = sum(outputTokens),
    totalCacheRead    = sum(cacheRead),
    totalCacheWrite   = sum(cacheWrite),
    totalCost         = sum(cost),
    totalDurationMs   = sum(duration / 1ms),
    firstRequest      = min(timestamp),
    lastRequest       = max(timestamp)
  by model
| order by totalInputTokens desc
```

---

## 5. Reconstruction Algorithm

### 5.1 Overview

The reconstruction follows the same architectural pattern as the existing JSONL adapter (`packages/adapters-copilot-cli`):

1. **Fetch** — Query Application Insights via KQL (§4.2) to retrieve all spans and log events for a session.
2. **Classify** — Categorise each span as LLM call, tool call, sub-agent, user message, or structural span.
3. **Build tree** — Reconstruct parent-child hierarchy from `spanId` / `parentSpanId`.
4. **Extract turns** — Identify turn boundaries from `copilot_chat.turn.id` or span-tree depth.
5. **Map fields** — Transform each classified span into the corresponding domain type.
6. **Aggregate** — Compute session-level fields (`startTs`, `endTs`, `shutdown`, `modelChanges`).
7. **Assemble** — Produce the final immutable `Session` object with `parseStatus`.

### 5.2 Pseudocode

```typescript
// ─── Types ───────────────────────────────────────────────────────────

interface OTelSpan {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly traceId: string;
  readonly name: string;
  readonly timestamp: string;              // ISO 8601
  readonly durationMs: number;
  readonly success: boolean;
  readonly dims: Partial<Record<string, string>>;   // customDimensions flattened
}

type SpanKind = 'llm' | 'tool' | 'subagent' | 'user_message' | 'structural';

// ─── Step 1: Fetch ──────────────────────────────────────────────────

async function fetchSessionSpans(
  client: LogAnalyticsClient,
  sessionId: string,
): Promise<OTelSpan[]> {
  const kql = buildSessionQuery(sessionId);   // KQL from §4.2
  const rows = await client.query(kql);
  return rows.map(rowToOTelSpan);
}

// ─── Step 2: Classify ───────────────────────────────────────────────

function classifySpan(span: OTelSpan): SpanKind {
  const d = span.dims;
  if (d['copilot_chat.subagent.name'])     return 'subagent';
  if (d['copilot_chat.tool.call.name'])    return 'tool';
  if (d['copilot_chat.message.role'] === 'user') return 'user_message';
  if (d['gen_ai.usage.input_tokens'] || d['gen_ai.usage.prompt_tokens'])
    return 'llm';
  return 'structural';
}

// ─── Step 3: Build tree ─────────────────────────────────────────────

interface SpanNode {
  span: OTelSpan;
  kind: SpanKind;
  children: SpanNode[];
  depth: number;
}

function buildSpanTree(spans: OTelSpan[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  // Create nodes
  for (const span of spans) {
    byId.set(span.spanId, {
      span,
      kind: classifySpan(span),
      children: [],
      depth: 0,
    });
  }

  // Link parent ↔ child
  for (const node of byId.values()) {
    if (node.span.parentSpanId && byId.has(node.span.parentSpanId)) {
      const parent = byId.get(node.span.parentSpanId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Compute depths
  function setDepth(node: SpanNode, depth: number): void {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) setDepth(root, 0);

  return roots;
}

// ─── Step 4: Extract turns ──────────────────────────────────────────

interface TurnBucket {
  turnId: string;
  spans: SpanNode[];
  startTs: string | null;
  endTs: string | null;
}

function extractTurns(roots: SpanNode[], allSpans: OTelSpan[]): TurnBucket[] {
  const buckets = new Map<string, TurnBucket>();

  // Strategy A: Use copilot_chat.turn.id if available
  const hasTurnIds = allSpans.some(s => s.dims['copilot_chat.turn.id']);

  if (hasTurnIds) {
    // Group all nodes by their turn.id attribute
    function visitWithTurnId(node: SpanNode): void {
      const turnId = node.span.dims['copilot_chat.turn.id'] ?? '<no-turn>';
      let bucket = buckets.get(turnId);
      if (!bucket) {
        bucket = { turnId, spans: [], startTs: null, endTs: null };
        buckets.set(turnId, bucket);
      }
      bucket.spans.push(node);
      expandTimestamps(bucket, node.span);
      for (const child of node.children) visitWithTurnId(child);
    }
    for (const root of roots) visitWithTurnId(root);
  } else {
    // Strategy B: Depth-1 children of root = turns
    let turnIndex = 0;
    for (const root of roots) {
      if (root.children.length === 0) {
        // Single-span trace — one turn
        const turnId = `turn-${turnIndex++}`;
        buckets.set(turnId, {
          turnId,
          spans: [root],
          startTs: root.span.timestamp,
          endTs: computeEndTs(root.span),
        });
      } else {
        root.children
          .sort((a, b) => a.span.timestamp.localeCompare(b.span.timestamp))
          .forEach((child) => {
            const turnId = `turn-${turnIndex++}`;
            const bucket: TurnBucket = {
              turnId,
              spans: [],
              startTs: null,
              endTs: null,
            };
            // Collect this node and all descendants
            function collect(node: SpanNode): void {
              bucket.spans.push(node);
              expandTimestamps(bucket, node.span);
              for (const c of node.children) collect(c);
            }
            collect(child);
            buckets.set(turnId, bucket);
          });
      }
    }
  }

  // Sort turns by startTs
  return [...buckets.values()].sort((a, b) =>
    (a.startTs ?? '').localeCompare(b.startTs ?? '')
  );
}

// ─── Step 5 & 6: Map and aggregate ─────────────────────────────────

/**
 * Detect parallel tool calls by checking for overlapping time ranges.
 * A turn has parallel tool calls if any two ToolCall spans have
 * overlapping durations (span B starts before span A ends).
 * See FanoutTurn identification criteria in §3.2.
 */
function hasParallelToolCalls(toolCalls: ToolCall[]): boolean {
  if (toolCalls.length < 2) return false;
  const sorted = [...toolCalls].sort((a, b) => a.startTs.localeCompare(b.startTs));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.startTs < sorted[i - 1]!.endTs) return true;
  }
  return false;
}

function reconstructSession(spans: OTelSpan[]): Session {
  // Sort spans by timestamp for deterministic reconstruction (see §6.3)
  const sorted = [...spans].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const roots = buildSpanTree(sorted);
  const turnBuckets = extractTurns(roots, sorted);

  // Classify all spans for top-level aggregation
  const allNodes = flattenTree(roots);
  const llmNodes      = allNodes.filter(n => n.kind === 'llm');
  const toolNodes     = allNodes.filter(n => n.kind === 'tool');
  const subagentNodes = allNodes.filter(n => n.kind === 'subagent');
  const userNodes     = allNodes.filter(n => n.kind === 'user_message');

  // Map to domain types
  const assistantMessages = llmNodes.map(n => mapAssistantMessage(n));
  const toolCalls         = toolNodes.map(n => mapToolCall(n));
  const subagents         = subagentNodes.map(n => mapSubagentInvocation(n));
  const userMessages      = userNodes.map(n => mapUserMessage(n));

  // Build turns
  const turns: Turn[] = turnBuckets.map(bucket => ({
    turnId: bucket.turnId,
    startTs: bucket.startTs,
    endTs: bucket.endTs,
    userMessage: findUserMessageForTurn(bucket, userMessages),
    assistantMessages: assistantMessages.filter(m => m.turnId === bucket.turnId),
    toolCalls: toolCalls.filter(tc => tc.turnId === bucket.turnId),
    subagents: subagents.filter(sa => sa.turnId === bucket.turnId),
  }));

  // Build fanout turns — reconstruct independently from span tree.
  // Only turns with parallel tool calls produce FanoutTurn entries;
  // hasParallelToolCalls checks for overlapping time ranges (see §3.2).
  const fanoutTurns: FanoutTurn[] = turns
    .filter(turn => hasParallelToolCalls(turn.toolCalls))
    .map(turn => ({
      ...turn,
      model: turn.assistantMessages[0]?.model ?? null,
    }));

  // Detect model changes (transitions between different models across LLM spans)
  const modelChanges = detectModelChanges(llmNodes);

  // Aggregate shutdown metrics
  const shutdown = aggregateShutdownMetrics(llmNodes, spans);

  // Compute session boundaries
  const startTs = sorted.length > 0
    ? sorted.reduce((min, s) => s.timestamp < min ? s.timestamp : min, sorted[0]!.timestamp)
    : null;
  const endTs = sorted.length > 0
    ? sorted.reduce((max, s) => {
        const end = computeEndTs(s);
        return end > max ? end : max;
      }, computeEndTs(sorted[0]!))
    : null;

  // Scan all spans for session-level attributes (not just spans[0])
  function findAttribute(searchSpans: OTelSpan[], key: string): string {
    for (const s of searchSpans) {
      const val = s.dims[key];
      if (val !== undefined && val !== '') return String(val);
    }
    return '';
  }

  const sessionId = findAttribute(sorted, 'copilot_chat.session.id')
                 || sorted[0]?.traceId
                 || 'unknown';

  // Derive parse status
  const parseStatus = deriveParseStatus(sorted, turns);

  return {
    sessionId,
    copilotVersion: '',                    // Not available in OTel — see §7
    selectedModel: llmNodes.length > 0
      ? [...llmNodes].sort((a, b) => a.span.timestamp.localeCompare(b.span.timestamp))[0]!.span.dims['gen_ai.request.model'] ?? ''
      : '',
    reasoningEffort: '',                   // Not available in OTel — see §7
    repository: findAttribute(sorted, 'copilot_chat.context.repository'),
    branch: findAttribute(sorted, 'copilot_chat.context.branch'),
    cwd: findAttribute(sorted, 'copilot_chat.context.cwd'),
    startTs,
    endTs,
    modelChanges,
    toolCalls,
    assistantMessages,
    userMessages,
    compactions: [],                       // See §3.6 — requires AppTraces query
    subagents,
    shutdown,
    success: deriveSuccess(roots),
    fanoutTurns,
    turns,
    parseStatus,
    utilisation: [],                       // Not available in OTel — see §3.8
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeEndTs(span: OTelSpan): string {
  const start = new Date(span.timestamp).getTime();
  return new Date(start + span.durationMs).toISOString();
}

function expandTimestamps(bucket: TurnBucket, span: OTelSpan): void {
  const ts = span.timestamp;
  const end = computeEndTs(span);
  if (bucket.startTs === null || ts < bucket.startTs) bucket.startTs = ts;
  if (bucket.endTs === null || end > bucket.endTs) bucket.endTs = end;
}

function mapAssistantMessage(node: SpanNode): AssistantMessage {
  const d = node.span.dims;
  return {
    interactionId: d['copilot_chat.interaction.id'] ?? null,
    requestId: node.span.spanId,
    outputTokens:
      safeInt(d['gen_ai.usage.output_tokens']) ||
      safeInt(d['gen_ai.usage.completion_tokens']),
    inputTokens:
      safeInt(d['gen_ai.usage.input_tokens']) ||
      safeInt(d['gen_ai.usage.prompt_tokens']),
    cacheReadTokens:  safeInt(d['gen_ai.usage.cache_read_tokens']),
    cacheWriteTokens: safeInt(d['gen_ai.usage.cache_write_tokens']),
    model: d['gen_ai.response.model'] ?? d['gen_ai.request.model'] ?? null,
    timestamp: node.span.timestamp,
    turnId: d['copilot_chat.turn.id'] ?? null,
    eventId: node.span.spanId,
    parentId: node.span.parentSpanId,
    content: d['copilot_chat.message.content'] ?? '',
    reasoningText: d['copilot_chat.reasoning.text'] ?? '',
  };
}

function mapToolCall(node: SpanNode): ToolCall {
  const d = node.span.dims;
  const args = d['copilot_chat.tool.call.arguments'] ?? '';
  return {
    toolCallId: d['copilot_chat.tool.call.id'] ?? node.span.spanId,
    toolName: d['copilot_chat.tool.call.name'] ?? node.span.name,
    model: findAncestorModel(node),
    startTs: node.span.timestamp,
    endTs: computeEndTs(node.span),
    durationMs: node.span.durationMs,
    success: d['copilot_chat.tool.call.success'] != null
      ? d['copilot_chat.tool.call.success'] === 'true'
      : node.span.success,
    parentId: node.span.parentSpanId,
    turnId: d['copilot_chat.turn.id'] ?? null,
    eventId: node.span.spanId,
    argumentsPreview: args.length > 200 ? args.slice(0, 200) + '…' : args,
  };
}

function mapSubagentInvocation(node: SpanNode): SubagentInvocation {
  const d = node.span.dims;
  const childLlmNodes = node.children.filter(c => c.kind === 'llm');
  const childToolNodes = node.children.filter(c => c.kind === 'tool');

  const totalTokens = childLlmNodes.reduce((sum, c) => {
    return sum
      + (safeInt(c.span.dims['gen_ai.usage.input_tokens']) || 0)
      + (safeInt(c.span.dims['gen_ai.usage.output_tokens']) || 0);
  }, 0);

  return {
    timestamp: node.span.timestamp,
    totalTokens,
    messageCount: childLlmNodes.length,
    toolCallCount: childToolNodes.length,
    turnId: d['copilot_chat.turn.id'] ?? null,
    eventId: node.span.spanId,
    parentId: node.span.parentSpanId,
    agentName: d['copilot_chat.subagent.name'] ?? '',
    agentType: d['copilot_chat.subagent.type'] ?? '',
    childSessionRef: d['copilot_chat.session.id'] ?? null,
  };
}

function mapUserMessage(node: SpanNode): UserMessage {
  const d = node.span.dims;
  return {
    interactionId: d['copilot_chat.interaction.id'] ?? null,
    timestamp: node.span.timestamp,
    turnId: d['copilot_chat.turn.id'] ?? null,
    content: d['copilot_chat.message.content'] ?? '',
  };
}

function detectModelChanges(llmNodes: SpanNode[]): ModelChange[] {
  const sorted = [...llmNodes].sort((a, b) =>
    a.span.timestamp.localeCompare(b.span.timestamp)
  );
  const changes: ModelChange[] = [];
  let currentModel: string | null = null;

  for (const node of sorted) {
    const model = node.span.dims['gen_ai.response.model']
               ?? node.span.dims['gen_ai.request.model']
               ?? null;
    if (model && model !== currentModel) {
      if (currentModel !== null) {
        // First model is selectedModel, subsequent ones are changes
        changes.push({ timestamp: node.span.timestamp, model });
      }
      currentModel = model;
    }
  }
  return changes;
}

function deriveSuccess(roots: SpanNode[]): boolean | null {
  if (roots.length === 0) return null;
  // Check root spans for failure indicators
  const rootSuccess = roots.every(r => r.span.success);
  const anyFailure = flattenTree(roots).some(n => !n.span.success);
  if (!rootSuccess) return false;
  if (anyFailure) return null;   // partial failure — indeterminate
  return true;
}

function deriveParseStatus(
  spans: OTelSpan[],
  turns: Turn[],
): ParseStatus {
  if (spans.length === 0) {
    return { status: 'failed', error: 'No spans found for session' };
  }
  // Check for orphan spans (parentSpanId points to a span not in this set)
  const spanIds = new Set(spans.map(s => s.spanId));
  const orphans = spans.filter(
    s => s.parentSpanId && !spanIds.has(s.parentSpanId)
  );
  if (orphans.length > spans.length * 0.5) {
    return {
      status: 'partial',
      error: `${orphans.length}/${spans.length} spans have missing parents — trace may be incomplete`,
    };
  }
  if (turns.length === 0) {
    return {
      status: 'partial',
      error: 'No turns could be reconstructed from span tree',
    };
  }
  return { status: 'ok', error: null };
}

function flattenTree(roots: SpanNode[]): SpanNode[] {
  const result: SpanNode[] = [];
  function visit(node: SpanNode): void {
    result.push(node);
    for (const child of node.children) visit(child);
  }
  for (const root of roots) visit(root);
  return result;
}

function findAncestorModel(node: SpanNode): string | null {
  // Walk up via parentSpanId to find the nearest LLM span's model
  // In practice, the model is on the sibling LLM span, not the parent.
  // Return null — the model will be set during turn assembly from
  // the turn's AssistantMessage.
  return null;
}

function findUserMessageForTurn(
  bucket: TurnBucket,
  allUserMessages: UserMessage[],
): UserMessage | null {
  // Match by turnId
  const byTurn = allUserMessages.find(um => um.turnId === bucket.turnId);
  if (byTurn) return byTurn;

  // Match by interactionId via the turn's assistant messages
  // (mirrors existing adapter logic)
  return null;
}

function aggregateShutdownMetrics(
  llmNodes: SpanNode[],
  allSpans: OTelSpan[],
): ShutdownMetrics | null {
  if (llmNodes.length === 0) return null;

  const modelMetrics = aggregateModelMetrics(
    llmNodes.map(n => ({ ...n.span, durationMs: n.span.durationMs }))
  );
  const totalApiDurationMs = modelMetrics.reduce(
    (sum, m) => sum + m.apiDurationMs, 0
  );
  const totalRequests = modelMetrics.reduce(
    (sum, m) => sum + m.requestCount, 0
  );
  const latestTs = allSpans.reduce(
    (max, s) => {
      const end = computeEndTs(s);
      return end > max ? end : max;
    },
    allSpans[0]!.timestamp,
  );

  return {
    totalPremiumRequests: totalRequests,
    totalApiDurationMs,
    modelMetrics,
    currentTokens: 0,
    systemTokens: 0,
    conversationTokens: 0,
    toolDefinitionsTokens: 0,
    codeChanges: {},
    timestamp: latestTs,
  };
}

function safeInt(value: string | undefined): number {
  if (value == null || value === '') return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}
```

---

## 6. Edge Cases

### 6.1 Missing Spans

**Scenario:** Some spans in a trace are lost due to export failures, sampling, or network issues. The span tree has gaps — a `parentSpanId` references a span not present in the result set.

**Impact:** Orphan spans cannot be placed in the tree hierarchy. Turn reconstruction may be incomplete.

**Mitigation:**
- Detect orphan spans (those whose `parentSpanId` is not in the fetched set).
- Promote orphans to root level — treat them as independent structural spans.
- Set `parseStatus.status = 'partial'` with a descriptive error.
- Still extract what data is available from orphan spans (token counts, tool calls).

### 6.2 Partial Traces

**Scenario:** A long-running session's trace is truncated — the session is still active, or export was interrupted mid-session.

**Impact:** No terminal span → `success` is `null`; `endTs` may not reflect the true session end.

**Mitigation:**
- Accept that `endTs` reflects the latest *observed* span, not the actual end.
- Set `success = null` when no clear terminal indicator is found.
- Set `parseStatus.status = 'partial'` with error `'Trace appears incomplete — no terminal span found'`.

### 6.3 Out-of-Order Timestamps

**Scenario:** Spans arrive in Application Insights with timestamps that are not monotonically increasing due to clock skew across distributed components, or ingestion delay.

**Impact:** Naive timestamp-based turn ordering may produce incorrect sequences.

**Mitigation:**
- Sort spans by `timestamp` after fetching, before tree construction.
- Use parent-child relationships as the primary ordering signal; timestamps as secondary.
- When assigning synthetic `turn-{N}` IDs, sort by the depth-1 span's timestamp.

### 6.4 Duplicate Span IDs

**Scenario:** The same `spanId` appears in multiple rows, typically due to re-export or Application Insights deduplication issues.

**Impact:** Tree construction breaks if multiple spans share the same `spanId`.

**Mitigation:**
- Deduplicate by `spanId` before processing — keep the span with the latest `timestamp` (or highest ingestion time if available via `_TimeReceived`).
- Log a warning in `parseStatus` if duplicates are detected.

### 6.5 Sessions Spanning Multiple Traces

**Scenario:** A single logical session produces multiple `traceId` values — e.g., the agent reconnects, or the OTel SDK creates a new trace context after idle timeout.

**Impact:** Querying by `operation_Id` alone retrieves only part of the session.

**Mitigation:**
- If `copilot_chat.session.id` is present, use it as the session grouping key (it persists across trace boundaries).
- If absent, use `enduser.pseudo.id` + time-window heuristic:

  ```
  Two traces belong to the same session IF:
    - Same enduser.pseudo.id, AND
    - The gap between trace A's last span and trace B's first span < 5 minutes
  ```

- The `listSessions` KQL (§4.1) already uses `copilot_chat.session.id` with `operation_Id` fallback.

### 6.6 Sub-agent Spans with Separate Traces

**Scenario:** A sub-agent runs in a separate process and produces its own `traceId`, linked to the parent only via `copilot_chat.session.id` or a custom correlation attribute.

**Impact:** The sub-agent's spans do not appear in the parent session's trace query.

**Mitigation:**
- After initial reconstruction, check each `SubagentInvocation` for a `childSessionRef`.
- If present, fetch the child session's spans separately and attach as nested context.
- The `SubagentInvocation.childSessionRef` field is designed for this cross-reference.

### 6.7 High-Cardinality Custom Dimensions

**Scenario:** `customDimensions` contains large JSON payloads (e.g., full message content, long tool arguments) that exceed Application Insights column limits (64 KB per `customDimensions`).

**Impact:** Attribute values may be truncated or dropped silently.

**Mitigation:**
- Treat all string attributes from `customDimensions` as potentially truncated.
- For `content` and `argumentsPreview`, apply the same 200-char preview truncation the existing adapter uses.
- Do not depend on completeness of `copilot_chat.message.content` for correctness.

---

## 7. Unmappable Fields & Proposed Defaults

The following `Session` fields have **no known OTel source** from the gateway's current instrumentation:

| Session Field           | Proposed Default | Rationale                                                                                             |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `copilotVersion`        | `''`             | Not emitted by the OTel Gateway. Could be added as a resource attribute in future.                    |
| `reasoningEffort`       | `''`             | Agent-specific configuration; not part of OTel semantic conventions.                                  |
| `repository`            | `''`             | Check `copilot_chat.context.repository` resource attribute. Default to empty if absent.               |
| `branch`                | `''`             | Check `copilot_chat.context.branch` resource attribute. Default to empty if absent.                   |
| `cwd`                   | `''`             | Check `copilot_chat.context.cwd` resource attribute. Default to empty if absent.                      |
| `compactions`           | `[]`             | Compaction events may not be emitted as OTel data. Requires `AppTraces` query.                        |
| `utilisation`           | `[]`             | Context-window utilisation samples are not part of OTel conventions.                                  |
| `shutdown.currentTokens`| `0`              | Final token count snapshot not available in span-based telemetry.                                      |
| `shutdown.systemTokens` | `0`              | As above.                                                                                              |
| `shutdown.conversationTokens` | `0`        | As above.                                                                                              |
| `shutdown.toolDefinitionsTokens` | `0`     | As above.                                                                                              |
| `shutdown.codeChanges`  | `{}`             | Code diff metadata is not emitted via OTel.                                                            |

**Impact on UI:** The Agent Profiler UI should gracefully handle empty/default values:
- Context-window utilisation chart will be empty — show a "No utilisation data available" placeholder.
- Session metadata panel should display "Unknown" for `copilotVersion`.
- The compaction timeline will be empty — this is acceptable for OTel-sourced sessions.

---

## 8. Open Questions & Recommendations

### Q1: Is `traceId` always 1:1 with a Session?

**Recommendation:** Assume **it is not** 1:1. A single session may produce multiple traces (reconnection, idle timeout, sub-agent forks). Use `copilot_chat.session.id` as the primary grouping key when available; fall back to `operation_Id` with time-window merging for same `enduser.pseudo.id`.

**Action for OTel Gateway team:** Request that `copilot_chat.session.id` is always emitted as a span attribute or resource attribute on every span.

### Q2: No OTel attribute for `copilotVersion`

**Recommendation:** Default to `''` (empty string). Request the OTel Gateway team add `copilot_chat.copilot.version` as a resource attribute. Until then, the adapter should check for `service.version` (standard OTel resource attribute) and use it as a fallback — it may carry the Copilot version if the Gateway sets it.

### Q3: Are `reasoningEffort`, `repository`, `branch`, `cwd` emitted as resource attributes?

**Recommendation:** These are **unlikely** to be standard resource attributes today. The adapter should:
1. Check `customDimensions` for `copilot_chat.context.repository`, `copilot_chat.context.branch`, `copilot_chat.context.cwd`, and `copilot_chat.reasoning.effort`.
2. If absent, default to `''`.
3. File a request with the OTel Gateway team to emit these as resource-level attributes.

### Q4: Is `github.copilot.cost` per-span or cumulative?

**Recommendation:** Assume **per-span** (incremental cost for that specific operation). This aligns with OTel's span-centric model where each span carries its own metrics. To compute total session cost, sum `github.copilot.cost` across all spans.

**Validation:** Compare the sum-of-spans cost against any session-level cost metric in `customMetrics` (if emitted). If the Gateway emits a cumulative counter, detect it by checking whether cost values are monotonically increasing across spans — if so, take the maximum rather than the sum.

### Q5: Rate limiting for `listSessions()` queries?

**Recommendation:** Azure Log Analytics has [well-documented throttling limits](https://learn.microsoft.com/en-us/azure/azure-monitor/service-limits#log-analytics-workspaces):
- **Concurrency:** 5 concurrent queries per workspace per user.
- **Response size:** 64 MB maximum.
- **Timeout:** 10 minutes per query.
- **Rate:** ~200 queries per 30 seconds per user.

**Mitigation strategies:**
1. **Cache session lists** — the `listSessions()` result changes infrequently; cache for 30–60 seconds.
2. **Paginate** — use `take N` in KQL with a cursor-based `startTs` for pagination.
3. **Batch span fetches** — when loading multiple sessions, fetch spans for several sessions in a single KQL query using `operation_Id in (...)`.
4. **Client-side debounce** — debounce user-initiated refresh actions in the UI.

### Q6: How to handle `gen_ai.usage.prompt_tokens` vs `gen_ai.usage.input_tokens`?

**Recommendation:** Treat them as synonyms. Prefer `input_tokens`/`output_tokens` (the newer convention); fall back to `prompt_tokens`/`completion_tokens`. The pseudocode in §5.2 already implements this with the `∥` (fallback) pattern.

---

## 9. References

1. [OpenTelemetry Semantic Conventions — Generative AI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — Official `gen_ai.*` attribute definitions.
2. [Azure Monitor Application Insights data model](https://learn.microsoft.com/en-us/azure/azure-monitor/app/data-model-complete) — How OTel spans map to AI tables.
3. [KQL reference](https://learn.microsoft.com/en-us/kusto/query/) — Kusto Query Language documentation.
4. [Azure Monitor service limits](https://learn.microsoft.com/en-us/azure/azure-monitor/service-limits) — Throttling and quota details.
5. Agent Profiler domain model — [`packages/core/src/types/`](../../packages/core/src/types/) — Session, Turn, FanoutTurn, events, metrics.
6. Copilot CLI adapter — [`packages/adapters-copilot-cli/src/`](../../packages/adapters-copilot-cli/src/) — Reference reconstruction implementation.
7. [OTel Specification — Trace Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/trace/) — Standard span attributes (`trace_id`, `span_id`, `parent_span_id`).
