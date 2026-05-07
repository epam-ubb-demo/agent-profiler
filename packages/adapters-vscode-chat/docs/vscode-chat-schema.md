# VS Code Copilot Chat Transcript Schema

> **Status**: Best-effort reverse-engineered schema. The transcript format is
> **undocumented** by GitHub and may change between extension versions without
> notice. Treat all parsing as best-effort.

## On-Disk Paths

The VS Code Copilot Chat extension (`GitHub.copilot-chat`) stores session
transcripts as JSONL files within VS Code's workspace storage:

| Platform | Path |
|----------|------|
| **macOS** | `~/Library/Application Support/Code/User/workspaceStorage/<workspace-id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl` |
| **macOS (Insiders)** | `~/Library/Application Support/Code - Insiders/User/workspaceStorage/<workspace-id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl` |
| **Windows** | `%APPDATA%/Code/User/workspaceStorage/<workspace-id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl` |
| **Linux** | `~/.config/Code/User/workspaceStorage/<workspace-id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl` |

### Debug Logs (optional supplementary data)

| Resource | Path |
|----------|------|
| Model billing info | `.../GitHub.copilot-chat/debug-logs/<session-id>/models.json` |
| Debug span events | `.../GitHub.copilot-chat/debug-logs/<session-id>/main.jsonl` |

## File Format

Each transcript is a [JSONL](https://jsonlines.org/) file where every line is
a self-contained JSON object representing one event.

## Event Envelope

Every event has this top-level structure:

```typescript
interface VsCodeChatEvent {
  type: string;            // Discriminator — see event types below
  data: object;            // Event-specific payload
  id: string;              // UUID for this event
  timestamp: string;       // ISO 8601 timestamp
  parentId: string | null; // UUID of parent event (tree structure)
}
```

### Tree Structure

Events form a parent–child tree via `parentId`. Typical nesting:

```
session.start (root)
└── user.message
    └── assistant.turn_start
        └── assistant.message (may contain toolRequests)
            └── assistant.turn_end
                └── assistant.turn_start (next turn)
                    └── tool.execution_start
                        └── tool.execution_complete
                            └── assistant.message
                                └── assistant.turn_end
```

## Event Types

### `session.start`

Emitted once at the beginning of a session.

```json
{
  "type": "session.start",
  "data": {
    "sessionId": "uuid-string",
    "version": 1,
    "producer": "copilot-agent",
    "copilotVersion": "0.46.2026042704",
    "vscodeVersion": "1.118.0-insider",
    "startTime": "2026-04-30T18:42:14.034Z"
  },
  "id": "evt-001",
  "timestamp": "2026-04-30T18:42:14.034Z",
  "parentId": null
}
```

### `user.message`

A user prompt submitted to the chat.

```json
{
  "type": "user.message",
  "data": {
    "content": "What is the weather like today?",
    "attachments": []
  },
  "id": "evt-002",
  "timestamp": "2026-04-30T18:42:14.044Z",
  "parentId": "evt-001"
}
```

### `assistant.turn_start`

Marks the beginning of an assistant processing turn.

```json
{
  "type": "assistant.turn_start",
  "data": {
    "turnId": "0"
  },
  "id": "evt-003",
  "timestamp": "2026-04-30T18:42:14.045Z",
  "parentId": "evt-002"
}
```

### `assistant.message`

An assistant response. May contain inline tool requests.

```json
{
  "type": "assistant.message",
  "data": {
    "messageId": "msg-001",
    "content": "Let me check the weather for you.",
    "toolRequests": [
      {
        "toolCallId": "tc-001",
        "name": "run_in_terminal",
        "arguments": "{\"command\":\"curl wttr.in\",\"explanation\":\"Check weather\"}",
        "type": "function"
      }
    ],
    "reasoningText": "The user wants to know the weather..."
  },
  "id": "evt-004",
  "timestamp": "2026-04-30T18:42:17.377Z",
  "parentId": "evt-003"
}
```

**Fields:**
- `messageId` — Unique identifier for this message
- `content` — The assistant's text response (may be empty if only tool calls)
- `toolRequests` — Array of tool invocations (optional, may be empty)
- `reasoningText` — Internal reasoning (optional, not always present)

### `assistant.turn_end`

Marks the end of an assistant processing turn.

```json
{
  "type": "assistant.turn_end",
  "data": {
    "turnId": "0"
  },
  "id": "evt-005",
  "timestamp": "2026-04-30T18:42:17.377Z",
  "parentId": "evt-004"
}
```

### `tool.execution_start`

Marks the beginning of a tool execution.

```json
{
  "type": "tool.execution_start",
  "data": {
    "toolCallId": "tc-001"
  },
  "id": "evt-007",
  "timestamp": "2026-04-30T18:42:17.402Z",
  "parentId": "evt-006"
}
```

### `tool.execution_complete`

Marks the completion of a tool execution.

```json
{
  "type": "tool.execution_complete",
  "data": {
    "toolCallId": "tc-001",
    "success": true
  },
  "id": "evt-008",
  "timestamp": "2026-04-30T18:42:59.110Z",
  "parentId": "evt-007"
}
```

## Mapping to Core Domain Model

### Available Data

| Core field | Source |
|-----------|--------|
| `sessionId` | `session.start` → `data.sessionId` |
| `copilotVersion` | `session.start` → `data.copilotVersion` |
| `startTs` | `session.start` → `data.startTime` |
| `endTs` | Timestamp of last event |
| `userMessages` | `user.message` events |
| `assistantMessages` | `assistant.message` events |
| `toolCalls` | Joined `tool.execution_start` + `tool.execution_complete` |
| `turns` | `assistant.turn_start` / `assistant.turn_end` boundaries |

### Not Available (set to zero/empty/null)

| Core field | Reason |
|-----------|--------|
| `selectedModel` | Not in transcript; available in `debug-logs/models.json` |
| `reasoningEffort` | Not captured |
| `repository` | Not captured (workspace context not logged) |
| `branch` | Not captured |
| `cwd` | Not captured |
| `inputTokens` / `outputTokens` | Not in transcript |
| `cacheReadTokens` / `cacheWriteTokens` | Not in transcript |
| `compactions` | Chat doesn't compact context |
| `subagents` | Chat doesn't dispatch sub-agents |
| `shutdown` | No shutdown metrics event |
| `success` | No terminal completion signal |
| `fanoutTurns` | No sub-agent fan-out in Chat mode |
| `modelChanges` | Not captured in transcript |
| `utilisation` | Not available |

## Key Differences from Copilot CLI Format

| Aspect | CLI (`events.jsonl`) | Chat (transcript `.jsonl`) |
|--------|---------------------|---------------------------|
| Token counts | Explicit per-message | Not available |
| Event grouping | Flat `turnId` field on events | Tree via `parentId` |
| Producer | `session.start` has context fields | `producer: "copilot-agent"` |
| Tool calls | Separate `tool_call` events | Embedded in `assistant.message.toolRequests` |
| Compaction | `session.compaction_complete` | Not applicable |
| Shutdown | `session.shutdown` with metrics | Not applicable |
| Sub-agents | `subagent.completed` events | Not applicable |
| Model info | `session.model_change` events | Not in transcript |

## Stability Notes

- **Format version**: The `version` field in `session.start` is currently `1`.
  Future versions may change the schema.
- **Extension updates**: The GitHub Copilot Chat extension updates frequently.
  Field names, event types, or data shapes may change without notice.
- **Best-effort parsing**: The adapter is designed to gracefully handle unknown
  event types and missing fields. It will never throw on malformed data.
- **Debug logs**: The `debug-logs/` directory contains additional data
  (model info, spans) but is even less stable than the transcript format.
  The adapter does not currently parse debug logs.
