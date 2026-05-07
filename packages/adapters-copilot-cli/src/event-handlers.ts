/**
 * Event handlers — per-event-type transformation into domain objects.
 *
 * Each handler mirrors the corresponding `_on_*` function from the Python
 * prototype. Handlers mutate a `SessionBuilder` accumulator and return the
 * (possibly updated) current model string.
 */

import type {
  AssistantMessage,
  Compaction,
  ModelChange,
  ShutdownMetrics,
  SubagentInvocation,
  ToolCall,
  UserMessage,
} from '@agent-profiler/core';

import type { RawEvent, RawSessionContext } from './types';
import { normaliseModelMetrics, safeInt } from './normalise-model-metrics.js';

// ---------------------------------------------------------------------------
// Session builder — mutable accumulator used during event processing
// ---------------------------------------------------------------------------

export interface TerminalEvent {
  kind: 'task_complete' | 'abort';
  timestamp: string | null;
  success: boolean | null;
}

export interface SessionBuilder {
  sessionId: string;
  copilotVersion: string;
  selectedModel: string;
  reasoningEffort: string;
  repository: string;
  branch: string;
  cwd: string;
  startTs: string | null;
  endTs: string | null;
  modelChanges: ModelChange[];
  toolCalls: ToolCall[];
  assistantMessages: AssistantMessage[];
  userMessages: UserMessage[];
  compactions: Compaction[];
  subagents: SubagentInvocation[];
  shutdown: ShutdownMetrics | null;
  success: boolean | null;
  terminalEvents: TerminalEvent[];
}

export function createSessionBuilder(): SessionBuilder {
  return {
    sessionId: '',
    copilotVersion: '',
    selectedModel: '',
    reasoningEffort: '',
    repository: '',
    branch: '',
    cwd: '',
    startTs: null,
    endTs: null,
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: null,
    terminalEvents: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function turnIdOf(event: RawEvent): string | null {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const raw = data['turnId'] ?? event.turnId;
  return raw == null ? null : String(raw);
}

function safeStr(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function summariseArguments(args: unknown): string {
  if (args == null) return '';
  const s = typeof args === 'string' ? args : JSON.stringify(args);
  const flat = s.replace(/\n/g, ' ');
  const limit = 200;
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

type EventHandler = (
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  pendingStarts: Map<string, ToolCall>,
  currentModel: string | null,
) => string | null;

// ---------------------------------------------------------------------------
// Individual handlers
// ---------------------------------------------------------------------------

function onSessionStart(
  _event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  sb.sessionId = safeStr(data['sessionId']);
  sb.copilotVersion = safeStr(data['copilotVersion']);
  sb.selectedModel = safeStr(data['selectedModel'] ?? data['model']);
  sb.reasoningEffort = safeStr(data['reasoningEffort']);
  const ctx = (data['context'] ?? {}) as RawSessionContext;
  sb.repository = safeStr(ctx.repository);
  sb.branch = safeStr(ctx.branch);
  sb.cwd = safeStr(ctx.cwd);
  sb.startTs = safeStr(data['startTime']) || ts;
  return sb.selectedModel || currentModel;
}

function onModelChange(
  _event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const newModel = safeStr(data['model'] ?? data['newModel']);
  if (newModel && ts) {
    sb.modelChanges.push({ timestamp: ts, model: newModel });
    return newModel;
  }
  return currentModel;
}

function onToolStart(
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  _sb: SessionBuilder,
  pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const tc: ToolCall = {
    toolCallId: safeStr(data['toolCallId']),
    toolName: safeStr(data['toolName'], '<unknown>'),
    model: safeStr(data['model']) || currentModel,
    startTs: ts,
    endTs: null,
    durationMs: null,
    success: null,
    parentId: event.parentId ?? null,
    turnId: turnIdOf(event),
    eventId: event.id ?? null,
    argumentsPreview: summariseArguments(data['arguments']),
  };
  pending.set(tc.toolCallId, tc);
  return currentModel;
}

function onToolComplete(
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const tcid = safeStr(data['toolCallId']);
  const existing = pending.get(tcid);

  if (existing == null) {
    // No matching start — create a complete record with start=end
    const tc: ToolCall = {
      toolCallId: tcid,
      toolName: safeStr(data['toolName'], '<unknown>'),
      model: safeStr(data['model']) || currentModel,
      startTs: ts,
      endTs: ts,
      durationMs: null,
      success: data['success'] != null ? Boolean(data['success']) : null,
      parentId: event.parentId ?? null,
      turnId: turnIdOf(event),
      eventId: event.id ?? null,
      argumentsPreview: '',
    };
    sb.toolCalls.push(tc);
  } else {
    pending.delete(tcid);
    const durationMs =
      existing.startTs && ts
        ? new Date(ts).getTime() - new Date(existing.startTs).getTime()
        : null;
    const tc: ToolCall = {
      ...existing,
      endTs: ts,
      durationMs: durationMs != null && Number.isFinite(durationMs) ? durationMs : null,
      success: data['success'] != null ? Boolean(data['success']) : null,
      model: existing.model || safeStr(data['model']) || currentModel,
    };
    sb.toolCalls.push(tc);
  }
  return currentModel;
}

function onAssistantMessage(
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  sb.assistantMessages.push({
    interactionId: safeStr(data['interactionId']) || null,
    requestId: safeStr(data['requestId']) || null,
    outputTokens: safeInt(data['outputTokens']),
    inputTokens: safeInt(data['inputTokens']),
    cacheReadTokens: safeInt(data['cacheReadTokens']),
    cacheWriteTokens: safeInt(data['cacheWriteTokens']),
    model: currentModel,
    timestamp: ts,
    turnId: turnIdOf(event),
    eventId: event.id ?? null,
    parentId: event.parentId ?? null,
    content: safeStr(data['content']),
    reasoningText: safeStr(data['reasoningText']),
  });
  return currentModel;
}

function onUserMessage(
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  sb.userMessages.push({
    interactionId: safeStr(data['interactionId']) || null,
    timestamp: ts,
    turnId: turnIdOf(event),
    content: safeStr(data['content']),
  });
  return currentModel;
}

function onCompaction(
  _event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const tu = data['compactionTokensUsed'];
  if (tu != null && typeof tu === 'object' && !Array.isArray(tu)) {
    const tokens = tu as Record<string, unknown>;
    sb.compactions.push({
      timestamp: ts,
      inputTokens: safeInt(tokens['inputTokens'] ?? tokens['input']),
      outputTokens: safeInt(tokens['outputTokens'] ?? tokens['output']),
      cacheRead: safeInt(tokens['cacheReadTokens'] ?? tokens['cacheRead']),
      cacheWrite: safeInt(tokens['cacheWriteTokens'] ?? tokens['cacheWrite']),
      model: safeStr(tokens['model']) || null,
      turnId: turnIdOf({ ...(_event ?? {}), data }),
    });
  } else {
    sb.compactions.push({
      timestamp: ts,
      inputTokens: safeInt(tu),
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      model: null,
      turnId: turnIdOf({ type: '', data }),
    });
  }
  return currentModel;
}

function onSubagent(
  event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  sb.subagents.push({
    timestamp: ts,
    totalTokens: safeInt(data['totalTokens']),
    messageCount: safeInt(data['messageCount']),
    toolCallCount: safeInt(data['toolCallCount']),
    turnId: turnIdOf(event),
    eventId: event.id ?? null,
    parentId: event.parentId ?? null,
    agentName: safeStr(data['agentName']),
    agentType: safeStr(data['agentType']),
    childSessionRef: safeStr(data['childSessionRef']) || null,
  });
  return currentModel;
}

function onTaskComplete(
  _event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const success = data['success'] != null ? Boolean(data['success']) : null;
  sb.success = success;
  sb.terminalEvents.push({ kind: 'task_complete', timestamp: ts, success });
  return currentModel;
}

function onAbort(
  _event: RawEvent,
  _data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  sb.terminalEvents.push({ kind: 'abort', timestamp: ts, success: null });
  return currentModel;
}

function onShutdown(
  _event: RawEvent,
  data: Record<string, unknown>,
  ts: string | null,
  sb: SessionBuilder,
  _pending: Map<string, ToolCall>,
  currentModel: string | null,
): string | null {
  const modelMetrics = normaliseModelMetrics(data['modelMetrics']);

  sb.shutdown = {
    totalPremiumRequests: safeInt(data['totalPremiumRequests']),
    totalApiDurationMs: safeInt(data['totalApiDurationMs']),
    modelMetrics,
    currentTokens: safeInt(data['currentTokens']),
    systemTokens: safeInt(data['systemTokens']),
    conversationTokens: safeInt(data['conversationTokens']),
    toolDefinitionsTokens: safeInt(data['toolDefinitionsTokens']),
    codeChanges: (data['codeChanges'] ?? {}) as Record<string, unknown>,
    timestamp: ts,
  };
  return currentModel;
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const DISPATCH: Record<string, EventHandler> = {
  'session.start': onSessionStart,
  'session.model_change': onModelChange,
  'tool.execution_start': onToolStart,
  'tool.execution_complete': onToolComplete,
  'assistant.message': onAssistantMessage,
  'user.message': onUserMessage,
  'session.compaction_complete': onCompaction,
  'subagent.completed': onSubagent,
  'session.task_complete': onTaskComplete,
  'session.shutdown': onShutdown,
  'abort': onAbort,
};

// ---------------------------------------------------------------------------
// Public: process all events through the dispatch table
// ---------------------------------------------------------------------------

/**
 * Process a sequence of raw events into a session builder.
 *
 * Mirrors `parse_session` from the Python prototype — dispatches each event
 * through the handler table, tracks endTs, and flushes pending tool starts.
 */
export function processEvents(events: readonly RawEvent[]): SessionBuilder {
  const sb = createSessionBuilder();
  const pendingStarts = new Map<string, ToolCall>();
  let currentModel: string | null = null;

  for (const event of events) {
    const etype = (event.type ?? '') as string;
    const data = (event.data ?? {}) as Record<string, unknown>;
    const ts = (event.timestamp as string) ?? null;

    // Track session end timestamp
    if (ts && (sb.endTs == null || ts > sb.endTs)) {
      sb.endTs = ts;
    }

    const handler = DISPATCH[etype];
    if (handler) {
      currentModel = handler(event, data, ts, sb, pendingStarts, currentModel);
    }
  }

  // Flush remaining pending starts (partial/in-flight sessions)
  for (const tc of pendingStarts.values()) {
    sb.toolCalls.push(tc);
  }

  // Sort tool calls by start timestamp
  sb.toolCalls.sort((a, b) => {
    const aTs = a.startTs ?? '';
    const bTs = b.startTs ?? '';
    if (aTs < bTs) return -1;
    if (aTs > bTs) return 1;
    return 0;
  });

  return sb;
}

// ---------------------------------------------------------------------------
// Shutdown freshness check
// ---------------------------------------------------------------------------

/**
 * Count material events that occurred *after* the latest shutdown.
 * Mirrors `count_post_shutdown_events` from the prototype.
 */
export function countPostShutdownEvents(sb: SessionBuilder): number {
  if (!sb.shutdown?.timestamp) return 0;
  const cutoff = sb.shutdown.timestamp;

  const later = (ts: string | null): boolean => ts != null && ts > cutoff;

  let n = 0;
  n += sb.assistantMessages.filter((m) => later(m.timestamp)).length;
  n += sb.toolCalls.filter((t) => later(t.startTs) || later(t.endTs)).length;
  n += sb.compactions.filter((c) => later(c.timestamp)).length;
  n += sb.subagents.filter((s) => later(s.timestamp)).length;
  n += sb.terminalEvents.filter((e) => later(e.timestamp)).length;
  return n;
}

/**
 * Derive the session outcome from terminal events.
 * Mirrors `derive_session_outcome` from the prototype.
 */
export function deriveSessionOutcome(sb: SessionBuilder): boolean | null {
  if (sb.terminalEvents.length === 0) return null;

  // Sort by timestamp (nulls first), then by original order
  const indexed = sb.terminalEvents.map((e, i) => ({ event: e, index: i }));
  indexed.sort((a, b) => {
    const aTsNull = a.event.timestamp == null ? 0 : 1;
    const bTsNull = b.event.timestamp == null ? 0 : 1;
    if (aTsNull !== bTsNull) return aTsNull - bTsNull;
    if (a.event.timestamp && b.event.timestamp) {
      if (a.event.timestamp < b.event.timestamp) return -1;
      if (a.event.timestamp > b.event.timestamp) return 1;
    }
    return a.index - b.index;
  });

  const last = indexed[indexed.length - 1]!;
  if (last.event.kind === 'abort') return false;
  if (last.event.kind === 'task_complete') {
    return last.event.success != null ? last.event.success : null;
  }
  return null;
}
