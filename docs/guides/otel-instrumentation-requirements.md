# OTel Instrumentation Requirements for Agent Profiler

This guide is for upstream agent teams that instrument with OpenTelemetry and export telemetry to Azure Application Insights. It describes the span attributes and hierarchy that the Agent Profiler adapter expects in order to reconstruct `Session` domain objects.

## Purpose

Agent Profiler reconstructs structured `Session` objects — containing turns, tool calls, assistant messages, user messages, sub-agent invocations, and metrics — from flat OTel spans stored in Application Insights. The quality and completeness of the reconstruction depends directly on the attributes emitted by the upstream agent's OTel instrumentation.

This document specifies:

- Which attributes are **required** (without them, reconstruction fails or is severely degraded)
- Which attributes are **recommended** (without them, certain Session fields will be empty)
- The expected span hierarchy
- How the adapter classifies spans

## Required Attributes

Without these attributes, span classification fails and no meaningful `Session` can be reconstructed.

| Attribute | Type | Scope | Why Required |
|---|---|---|---|
| `gen_ai.usage.input_tokens` ∥ `gen_ai.usage.prompt_tokens` | int | Span | Identifies LLM call spans; provides input token metrics |
| `gen_ai.usage.output_tokens` ∥ `gen_ai.usage.completion_tokens` | int | Span | Identifies LLM call spans; provides output token metrics |
| `gen_ai.request.model` ∥ `gen_ai.response.model` | string | Span | Model identification for metrics aggregation |

> **Notation:** `∥` denotes a fallback — the adapter checks the first attribute and, if absent, falls back to the second.

## Recommended Attributes

These attributes are not strictly required, but without them certain Session fields will be empty or less accurate.

| Attribute | Type | Impact if Missing |
|---|---|---|
| `copilot_chat.session.id` | string | `sessionId` falls back to `operation_Id` (trace ID); multi-trace sessions cannot be correlated |
| `copilot_chat.turn.id` | string | Turn boundaries inferred from tree depth instead of explicit grouping |
| `copilot_chat.tool.call.name` | string | Tool call spans not detected; `ToolCall` events not reconstructed |
| `copilot_chat.tool.call.id` | string | `toolCallId` falls back to span ID |
| `copilot_chat.subagent.name` | string | Sub-agent invocations not detected |
| `copilot_chat.message.role` | string | User messages not detected |
| `copilot_chat.message.content` | string | Message content empty |
| `copilot_chat.context.repository` | string | `Session.repository` empty |
| `copilot_chat.context.branch` | string | `Session.branch` empty |
| `copilot_chat.context.cwd` | string | `Session.cwd` empty |
| `copilot_chat.interaction.id` | string | `interactionId` null on messages |
| `copilot_chat.reasoning.text` | string | `reasoningText` empty |
| `copilot_chat.tool.call.arguments` | string | `argumentsPreview` empty |
| `copilot_chat.tool.call.success` | boolean | Tool success falls back to span `success` field |
| `copilot_chat.subagent.type` | string | `agentType` empty |

## Expected Span Hierarchy

The adapter reconstructs the `Session → Turn → Event` hierarchy from the parent–child relationships between spans. The expected structure is:

```
Root span (trace)                                → Session boundary
├── Turn span (depth 1)                          → Turn / FanoutTurn
│   ├── LLM call span                            → AssistantMessage
│   │   └── (token metrics in span attributes)
│   ├── Tool call span                           → ToolCall
│   │   └── Tool execution child span
│   ├── Tool call span                           → ToolCall (parallel = fan-out)
│   └── Sub-agent span                           → SubagentInvocation
│       ├── Sub-agent LLM call
│       └── Sub-agent tool call
├── Turn span (depth 1)                          → Next Turn
│   └── ...
```

Key points:

- **Session boundary** is determined by `copilot_chat.session.id` (or `operation_Id` as fallback).
- **Turn boundaries** are determined by `copilot_chat.turn.id` when present (Strategy A), or inferred from depth-1 spans in the tree (Strategy B).
- **Fan-out turns** are detected when multiple tool calls exist as siblings under the same turn span.

## Sample OTel Span Payloads

### LLM call span

```json
{
  "id": "abc123def456",
  "operation_Id": "trace-001",
  "operation_ParentId": "parent-span-001",
  "name": "chat",
  "timestamp": "2025-07-18T10:30:00.000Z",
  "duration": "00:00:02.5000000",
  "success": true,
  "customDimensions": {
    "gen_ai.system": "github_copilot",
    "gen_ai.request.model": "claude-sonnet-4-20250514",
    "gen_ai.response.model": "claude-sonnet-4-20250514",
    "gen_ai.usage.input_tokens": "1500",
    "gen_ai.usage.output_tokens": "350",
    "gen_ai.usage.cache_read_tokens": "800",
    "gen_ai.response.finish_reason": "stop",
    "copilot_chat.session.id": "session-abc-123",
    "copilot_chat.turn.id": "turn-0",
    "copilot_chat.interaction.id": "interaction-001",
    "copilot_chat.message.content": "I'll help you fix the authentication issue...",
    "copilot_chat.context.repository": "myorg/myrepo",
    "copilot_chat.context.branch": "main"
  }
}
```

### Tool call span

```json
{
  "id": "tool-span-001",
  "operation_Id": "trace-001",
  "operation_ParentId": "abc123def456",
  "name": "tool.Read",
  "timestamp": "2025-07-18T10:30:02.500Z",
  "duration": "00:00:00.1500000",
  "success": true,
  "customDimensions": {
    "copilot_chat.turn.id": "turn-0",
    "copilot_chat.tool.call.id": "tc-001",
    "copilot_chat.tool.call.name": "Read",
    "copilot_chat.tool.call.arguments": "{\"path\": \"src/auth.ts\"}",
    "copilot_chat.tool.call.success": "true"
  }
}
```

## Missing Attributes → Empty Session Fields

This table summarises the downstream impact when groups of attributes are absent.

| If This Attribute Is Missing | These Session Fields Are Affected |
|---|---|
| All `gen_ai.usage.*` attributes | No `AssistantMessage` events; `ShutdownMetrics` null; `selectedModel` empty |
| `copilot_chat.session.id` | `sessionId` uses `operation_Id`; multi-trace sessions fragmented |
| `copilot_chat.turn.id` | Turns inferred from span depth; may be less accurate |
| `copilot_chat.tool.call.name` | No `ToolCall` events reconstructed |
| `copilot_chat.subagent.name` | No `SubagentInvocation` events reconstructed |
| `copilot_chat.message.role` | No `UserMessage` events reconstructed |
| `copilot_chat.context.*` | `repository`, `branch`, `cwd` all empty strings |
| `copilot_chat.message.content` | `content` field empty on all messages |

## Span Classification Logic

The adapter classifies each span using the following priority order (from `turn-reconstructor.ts` `classifySpan`):

1. `copilot_chat.subagent.name` present → **`subagent`**
2. `copilot_chat.tool.call.name` present → **`tool`**
3. `copilot_chat.message.role === 'user'` → **`user_message`**
4. `gen_ai.usage.input_tokens` or `gen_ai.usage.prompt_tokens` present → **`llm`**
5. Otherwise → **`structural`** (ignored for domain mapping)

Classification is evaluated top-down; the first matching rule wins. This means a span with both `copilot_chat.subagent.name` and `gen_ai.usage.input_tokens` is classified as `subagent`, not `llm`.
