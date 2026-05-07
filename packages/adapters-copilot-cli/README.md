# @agent-profiler/adapters-copilot-cli

Source adapter for parsing [GitHub Copilot CLI](https://docs.github.com/en/copilot) session event logs into the canonical `Session` domain model.

## What it does

Reads an `events.jsonl` (or `events.ndjson`) file produced by the Copilot CLI process and transforms it into a structured `Session` object containing:

- Tool calls with start/end timestamps and durations
- Assistant messages with token counts
- User messages
- Context-window compaction events
- Sub-agent invocations
- Shutdown metrics (per-model token totals)
- Fan-out turn tree (parallel tool dispatch visualisation)
- Grouped turns by `turnId`

## API

```typescript
import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';

const session = await parseCopilotCliSession('/path/to/session-state');
// or
const session = await parseCopilotCliSession('/path/to/events.jsonl');
```

### `parseCopilotCliSession(path: string): Promise<Session>`

Accepts either:
- A **directory** containing `events.jsonl` or `events.ndjson`
- A **direct file path** to the events file

Returns a `Session` object (from `@agent-profiler/core`). **Never throws** — check `session.parseStatus` for the outcome.

## Supported event types

| Event type | Description |
|---|---|
| `session.start` | Session metadata (model, repository, branch) |
| `session.model_change` | Mid-session model switch |
| `tool.execution_start` | Tool call initiated |
| `tool.execution_complete` | Tool call finished (linked by `toolCallId`) |
| `assistant.message` | LLM response with token counts |
| `user.message` | User prompt |
| `session.compaction_complete` | Context window compaction |
| `subagent.completed` | Sub-agent (child session) finished |
| `session.task_complete` | Task success/failure signal |
| `abort` | Session aborted |
| `session.shutdown` | Final cumulative metrics |

## Error handling

The adapter follows a **never-throw** policy:

| `parseStatus.status` | Meaning |
|---|---|
| `ok` | All events parsed successfully |
| `partial` | Some lines skipped (malformed JSON) but session is usable |
| `failed` | File couldn't be read at all — Session shell returned with empty fields |

When `parseStatus.error` is non-null it contains a human-readable explanation.

### Shutdown freshness

If the session has events *after* the shutdown timestamp, `parseStatus.error` will note the discrepancy. This happens when a session is resumed past its last shutdown snapshot.

## Example usage

```typescript
import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';

async function analyseSession(dir: string) {
  const session = await parseCopilotCliSession(dir);

  if (session.parseStatus.status === 'failed') {
    console.error('Parse failed:', session.parseStatus.error);
    return;
  }

  console.log(`Session: ${session.sessionId}`);
  console.log(`Model: ${session.selectedModel}`);
  console.log(`Tool calls: ${session.toolCalls.length}`);
  console.log(`Turns: ${session.turns.length}`);
  console.log(`Success: ${session.success}`);

  if (session.shutdown) {
    console.log(`Total premium requests: ${session.shutdown.totalPremiumRequests}`);
  }
}
```

## Development

```bash
pnpm test          # run unit tests
pnpm typecheck     # TypeScript strict mode check
pnpm lint          # ESLint
```
