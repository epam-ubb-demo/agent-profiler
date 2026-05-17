/**
 * Event mapper — transforms raw Claude Code events into core domain types.
 *
 * Maps the sequential event log format into the flat canonical model.
 * Since Claude Code sessions don't include token counts or all session-level
 * metadata fields, those are set to zero/empty where not available.
 *
 * Turn boundaries are synthesised: each user message starts a new turn.
 */

import type {
  AssistantMessage,
  ParseStatus,
  Session,
  ToolCall,
  Turn,
  UserMessage,
} from '@agent-profiler/core';

import type { RawClaudeCodeEvent } from './types.js';

// ── Session builder ──────────────────────────────────────────────────────────

export interface ClaudeCodeSessionBuilder {
  sessionId: string;
  model: string;
  cwd: string;
  startTs: string | null;
  endTs: string | null;
  userMessages: UserMessage[];
  assistantMessages: AssistantMessage[];
  toolCalls: ToolCall[];
  /** Pending tool_use events waiting for a tool_result to complete them. */
  pendingToolUse: Map<string, Partial<ToolCall> & { startTs: string | null }>;
  /** Synthetic turn accumulator — each user event starts a new turn. */
  currentTurnId: string | null;
  turnData: Map<string, TurnAccumulator>;
  parseStatus: ParseStatus;
  /** Per-invocation counter used to generate deterministic turn IDs. */
  turnCounter: number;
}

interface TurnAccumulator {
  turnId: string;
  startTs: string | null;
  endTs: string | null;
  userMessage: UserMessage | null;
  assistantMessages: AssistantMessage[];
  toolCalls: ToolCall[];
}

export function createSessionBuilder(): ClaudeCodeSessionBuilder {
  return {
    sessionId: '',
    model: '',
    cwd: '',
    startTs: null,
    endTs: null,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    pendingToolUse: new Map(),
    currentTurnId: null,
    turnData: new Map(),
    parseStatus: { status: 'ok', error: null },
    turnCounter: 0,
  };
}

// ── Event processing ──────────────────────────────────────────────────────────

/**
 * Process all raw Claude Code events through the appropriate handler,
 * building up the session state incrementally.
 */
export function processEvents(events: readonly RawClaudeCodeEvent[]): ClaudeCodeSessionBuilder {
  const sb = createSessionBuilder();

  for (const event of events) {
    // Capture cwd and session_id from any event that carries them
    if (event.cwd && !sb.cwd) sb.cwd = event.cwd;
    if (event.session_id && !sb.sessionId) sb.sessionId = event.session_id;

    switch (event.type) {
      case 'user':
        handleUserEvent(sb, event);
        break;
      case 'assistant':
        handleAssistantEvent(sb, event);
        break;
      case 'tool_use':
        handleToolUseEvent(sb, event);
        break;
      case 'tool_result':
        handleToolResultEvent(sb, event);
        break;
      default:
        // Unknown event type — skip silently
        break;
    }

    // Track the latest timestamp as endTs
    if (event.timestamp) {
      if (sb.startTs === null) sb.startTs = event.timestamp;
      sb.endTs = event.timestamp;
    }
  }

  // Flush any pending tool_use events that never received a result
  for (const [toolCallId, partial] of sb.pendingToolUse) {
    sb.toolCalls.push({
      toolCallId,
      toolName: String((partial as Record<string, unknown>)['toolName'] ?? ''),
      model: null,
      startTs: partial.startTs ?? null,
      endTs: null,
      durationMs: null,
      success: null,
      parentId: null,
      turnId: sb.currentTurnId,
      eventId: null,
      argumentsPreview: String((partial as Record<string, unknown>)['argumentsPreview'] ?? ''),
    });
  }
  sb.pendingToolUse.clear();

  return sb;
}

// ── Individual event handlers ─────────────────────────────────────────────────

function handleUserEvent(sb: ClaudeCodeSessionBuilder, event: RawClaudeCodeEvent): void {
  const content = typeof event.message?.content === 'string' ? event.message.content : '';

  // Each user event creates a synthetic turn; counter is per-builder, not module-scoped
  const turnId = String(sb.turnCounter++);
  sb.currentTurnId = turnId;

  const userMsg: UserMessage = {
    interactionId: event.uuid,
    timestamp: event.timestamp,
    turnId,
    content,
  };
  sb.userMessages.push(userMsg);

  sb.turnData.set(turnId, {
    turnId,
    startTs: event.timestamp,
    endTs: null,
    userMessage: userMsg,
    assistantMessages: [],
    toolCalls: [],
  });
}

function handleAssistantEvent(sb: ClaudeCodeSessionBuilder, event: RawClaudeCodeEvent): void {
  const content = typeof event.message?.content === 'string' ? event.message.content : '';
  const model = event.message?.model;

  if (model && !sb.model) sb.model = model;

  const assistantMsg: AssistantMessage = {
    interactionId: null,
    requestId: null,
    outputTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    model: model ?? null,
    timestamp: event.timestamp,
    turnId: sb.currentTurnId,
    eventId: event.uuid,
    parentId: event.parent_uuid ?? null,
    content,
    reasoningText: '',
  };
  sb.assistantMessages.push(assistantMsg);

  if (sb.currentTurnId) {
    const turn = sb.turnData.get(sb.currentTurnId);
    if (turn) {
      turn.assistantMessages.push(assistantMsg);
    }
  }
}

function handleToolUseEvent(sb: ClaudeCodeSessionBuilder, event: RawClaudeCodeEvent): void {
  const toolCallId = event.uuid;
  const toolName = event.tool?.name ?? '';
  const argumentsPreview = truncateInput(event.tool?.input);

  sb.pendingToolUse.set(toolCallId, {
    startTs: event.timestamp,
    toolName,
    argumentsPreview,
  } as Partial<ToolCall> & { startTs: string | null });
}

function handleToolResultEvent(sb: ClaudeCodeSessionBuilder, event: RawClaudeCodeEvent): void {
  // Match by parent_uuid — tool_result points to its tool_use event
  const toolUseId = event.parent_uuid ?? '';
  const pending = sb.pendingToolUse.get(toolUseId);

  const startTs = pending?.startTs ?? null;
  const endTs = event.timestamp;

  let durationMs: number | null = null;
  if (event.tool?.duration_ms !== undefined) {
    durationMs = event.tool.duration_ms;
  } else if (startTs && endTs) {
    const diff = new Date(endTs).getTime() - new Date(startTs).getTime();
    durationMs = diff >= 0 ? diff : null;
  }

  const toolName = String((pending as Record<string, unknown> | undefined)?.['toolName'] ?? event.tool?.name ?? '');
  const argumentsPreview = String((pending as Record<string, unknown> | undefined)?.['argumentsPreview'] ?? '');
  const isError = event.tool?.is_error;
  const success = isError === true ? false : isError === false ? true : null;

  const toolCall: ToolCall = {
    toolCallId: toolUseId || event.uuid,
    toolName,
    model: null,
    startTs,
    endTs,
    durationMs,
    success,
    parentId: event.parent_uuid ?? null,
    turnId: sb.currentTurnId,
    eventId: event.uuid,
    argumentsPreview,
  };

  sb.toolCalls.push(toolCall);
  sb.pendingToolUse.delete(toolUseId);

  if (sb.currentTurnId) {
    const turn = sb.turnData.get(sb.currentTurnId);
    if (turn) {
      turn.toolCalls.push(toolCall);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateInput(input: unknown, maxLength = 200): string {
  if (input === undefined || input === null) return '';
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}

// ── Turn builder ──────────────────────────────────────────────────────────────

/**
 * Build the final Turn array from accumulated turn data.
 */
export function buildTurns(sb: ClaudeCodeSessionBuilder): Turn[] {
  const turns: Turn[] = [];

  // Sort by turnId (numeric string)
  const sortedEntries = [...sb.turnData.entries()].sort(([a], [b]) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b);
    return numA - numB;
  });

  for (const [, acc] of sortedEntries) {
    turns.push({
      turnId: acc.turnId,
      startTs: acc.startTs,
      endTs: acc.endTs,
      userMessage: acc.userMessage,
      assistantMessages: acc.assistantMessages,
      toolCalls: acc.toolCalls,
      subagents: [],
    });
  }

  return turns;
}

// ── Session finaliser ─────────────────────────────────────────────────────────

/**
 * Build a complete {@link Session} from the accumulated builder state.
 *
 * @param sb - The session builder populated by {@link processEvents}.
 * @param sessionId - Fallback session ID when the file does not carry one.
 */
export function finaliseSession(sb: ClaudeCodeSessionBuilder, sessionId: string): Session {
  const turns = buildTurns(sb);

  return {
    sessionId: sb.sessionId || sessionId,
    copilotVersion: '',
    selectedModel: sb.model,
    reasoningEffort: '',
    repository: '',
    branch: '',
    cwd: sb.cwd,
    startTs: sb.startTs,
    endTs: sb.endTs,
    modelChanges: [],
    toolCalls: sb.toolCalls,
    assistantMessages: sb.assistantMessages,
    userMessages: sb.userMessages,
    compactions: [],
    subagents: [],
    shutdown: null,
    success: null,
    fanoutTurns: [],
    turns,
    parseStatus: sb.parseStatus,
    utilisation: [],
  };
}
