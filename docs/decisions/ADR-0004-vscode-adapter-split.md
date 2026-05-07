# ADR-0004: VS Code Adapter Split Strategy

## Status

Accepted

## Date

2026-05-01

## Context

The VS Code Copilot extension (`github.copilot-chat`) stores session transcripts in JSONL format under `workspaceStorage/<workspace-id>/GitHub.copilot-chat/transcripts/<session-id>.jsonl`. Both **Copilot Chat** (conversational Q&A) and the **Copilot coding-agent** (autonomous code editing) use the same transcript format with identical event types (`session.start`, `user.message`, `assistant.turn_start`, `assistant.message`, `tool.execution_start`, `tool.execution_complete`, `assistant.turn_end`).

The key structural difference is behavioural: coding-agent sessions are longer, have higher tool-call density, use file-editing tools (e.g. `edit_file`, `create_file`, `replace_string_in_file`), and may include extended `reasoningText`.

We needed to decide: one adapter or two?

## Decision

**Two separate adapter packages** with a shared heuristic classifier:

- `@agent-profiler/adapters-vscode-chat` — optimised for short conversational sessions
- `@agent-profiler/adapters-vscode-coding-agent` — optimised for long tool-heavy sessions, includes a `classifier.ts` module that distinguishes coding-agent sessions from chat sessions

The classifier uses these heuristics:
1. Session contains file-editing tools (`edit_file`, `create_file`, `replace_string_in_file`, `insert_edit_into_file`)
2. Session has >5 total tool calls
3. Session duration exceeds 5 minutes

## Consequences

### Positive
- Each adapter can evolve independently as the formats diverge over time
- The source picker UI (F3.5) can present them as distinct source types
- Testing is simpler — each adapter has its own fixture set
- Follows the existing pattern of one adapter per source type

### Negative
- Some code duplication between the two adapters (JSONL parser, event types)
- Classification is heuristic and may mis-classify edge cases (short coding sessions, tool-heavy chat sessions)

### Mitigations
- Both adapters produce the same `Session` type from `@agent-profiler/core`
- Mis-classification is cosmetic (affects source label, not data correctness)
- Parser logic can be extracted to a shared package later if duplication becomes problematic

## Notes

- The transcript format is undocumented by GitHub and may change. Adapters should use defensive parsing (never throw, report `parseStatus: 'partial'` on unexpected data).
- Token counts are not available in VS Code transcripts (unlike Copilot CLI). Both adapters set token fields to 0.
- Model information is available separately in `debug-logs/<session-id>/models.json` but is not used in the initial implementation.
