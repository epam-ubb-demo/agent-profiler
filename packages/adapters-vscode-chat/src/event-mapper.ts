/**
 * Event mapper — transforms raw VS Code Chat events into core domain types.
 *
 * Maps the tree-structured transcript format into the flat canonical model.
 * Since Chat transcripts don't include token counts or many session-level
 * metadata fields, those are set to zero/empty.
 */

import type {
  AssistantMessage,
  ToolCall,
  Turn,
  UserMessage,
} from '@agent-profiler/core';

import type {
  AssistantMessageData,
  AssistantTurnData,
  RawVsCodeChatEvent,
  SessionStartData,
  ToolExecutionCompleteData,
  ToolExecutionStartData,
  ToolRequest,
  UserMessageData,
} from './types';

// ---------------------------------------------------------------------------
// Session builder — mutable accumulator used during event processing
// ---------------------------------------------------------------------------

export interface VsCodeChatSessionBuilder {
  sessionId: string;
  copilotVersion: string;
  vscodeVersion: string;
  startTs: string | null;
  endTs: string | null;
  userMessages: UserMessage[];
  assistantMessages: AssistantMessage[];
  toolCalls: ToolCall[];
  /** Partial tool calls keyed by toolCallId, waiting for completion. */
  pendingTools: Map<string, Partial<ToolCall> & { startTs: string | null }>;
  /** Track current turnId from turn_start/turn_end events. */
  currentTurnId: string | null;
  /** Accumulated turn data for building Turn objects. */
  turnData: Map<string, TurnAccumulator>;
}

interface TurnAccumulator {
  turnId: string;
  startTs: string | null;
  endTs: string | null;
  userMessage: UserMessage | null;
  assistantMessages: AssistantMessage[];
  toolCalls: ToolCall[];
}

export function createSessionBuilder(): VsCodeChatSessionBuilder {
  return {
    sessionId: '',
    copilotVersion: '',
    vscodeVersion: '',
    startTs: null,
    endTs: null,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    pendingTools: new Map(),
    currentTurnId: null,
    turnData: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------

/**
 * Process all raw events through the appropriate handler, building
 * up the session state incrementally.
 */
export function processEvents(events: readonly RawVsCodeChatEvent[]): VsCodeChatSessionBuilder {
  const sb = createSessionBuilder();

  for (const event of events) {
    switch (event.type) {
      case 'session.start':
        handleSessionStart(sb, event);
        break;
      case 'user.message':
        handleUserMessage(sb, event);
        break;
      case 'assistant.turn_start':
        handleTurnStart(sb, event);
        break;
      case 'assistant.message':
        handleAssistantMessage(sb, event);
        break;
      case 'assistant.turn_end':
        handleTurnEnd(sb, event);
        break;
      case 'tool.execution_start':
        handleToolExecutionStart(sb, event);
        break;
      case 'tool.execution_complete':
        handleToolExecutionComplete(sb, event);
        break;
      default:
        // Unknown event type — skip silently
        break;
    }

    // Track the latest timestamp as endTs
    if (event.timestamp) {
      sb.endTs = event.timestamp;
    }
  }

  // Flush any pending tool calls that never completed
  for (const [toolCallId, partial] of sb.pendingTools) {
    const toolCall: ToolCall = {
      toolCallId,
      toolName: '',
      model: null,
      startTs: partial.startTs ?? null,
      endTs: null,
      durationMs: null,
      success: null,
      parentId: null,
      turnId: sb.currentTurnId,
      eventId: null,
      argumentsPreview: '',
    };
    sb.toolCalls.push(toolCall);
  }
  sb.pendingTools.clear();

  return sb;
}

// ---------------------------------------------------------------------------
// Individual event handlers
// ---------------------------------------------------------------------------

function handleSessionStart(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as SessionStartData;
  sb.sessionId = data.sessionId ?? '';
  sb.copilotVersion = data.copilotVersion ?? '';
  sb.vscodeVersion = data.vscodeVersion ?? '';
  sb.startTs = data.startTime ?? event.timestamp ?? null;
}

function handleUserMessage(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as UserMessageData;
  const userMsg: UserMessage = {
    interactionId: null,
    timestamp: event.timestamp ?? null,
    turnId: sb.currentTurnId,
    content: data.content ?? '',
  };
  sb.userMessages.push(userMsg);

  // Associate with current turn
  if (sb.currentTurnId) {
    const turn = sb.turnData.get(sb.currentTurnId);
    if (turn) {
      turn.userMessage = userMsg;
    }
  }
}

function handleTurnStart(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as AssistantTurnData;
  const turnId = data.turnId ?? '';
  sb.currentTurnId = turnId;

  if (!sb.turnData.has(turnId)) {
    sb.turnData.set(turnId, {
      turnId,
      startTs: event.timestamp ?? null,
      endTs: null,
      userMessage: null,
      assistantMessages: [],
      toolCalls: [],
    });
  }
}

function handleAssistantMessage(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as AssistantMessageData;

  const assistantMsg: AssistantMessage = {
    interactionId: null,
    requestId: data.messageId ?? null,
    outputTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    model: null,
    timestamp: event.timestamp ?? null,
    turnId: sb.currentTurnId,
    eventId: event.id ?? null,
    parentId: event.parentId ?? null,
    content: data.content ?? '',
    reasoningText: data.reasoningText ?? '',
  };
  sb.assistantMessages.push(assistantMsg);

  // Associate with current turn
  if (sb.currentTurnId) {
    const turn = sb.turnData.get(sb.currentTurnId);
    if (turn) {
      turn.assistantMessages.push(assistantMsg);
    }
  }

  // Process inline tool requests
  if (data.toolRequests && data.toolRequests.length > 0) {
    for (const req of data.toolRequests) {
      registerToolRequest(sb, req, event);
    }
  }
}

function handleTurnEnd(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as AssistantTurnData;
  const turnId = data.turnId ?? sb.currentTurnId ?? '';

  const turn = sb.turnData.get(turnId);
  if (turn) {
    turn.endTs = event.timestamp ?? null;
  }
}

function handleToolExecutionStart(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as ToolExecutionStartData;
  const toolCallId = data.toolCallId ?? '';

  // Update the pending tool with start timestamp
  const existing = sb.pendingTools.get(toolCallId);
  if (existing) {
    existing.startTs = event.timestamp ?? null;
  } else {
    sb.pendingTools.set(toolCallId, { startTs: event.timestamp ?? null });
  }
}

function handleToolExecutionComplete(sb: VsCodeChatSessionBuilder, event: RawVsCodeChatEvent): void {
  const data = event.data as unknown as ToolExecutionCompleteData;
  const toolCallId = data.toolCallId ?? '';

  const pending = sb.pendingTools.get(toolCallId);
  const startTs = pending?.startTs ?? null;
  const endTs = event.timestamp ?? null;

  let durationMs: number | null = null;
  if (startTs && endTs) {
    const diff = new Date(endTs).getTime() - new Date(startTs).getTime();
    durationMs = diff >= 0 ? diff : null;
  }

  // Find the tool name from the earlier tool request registration
  const toolName = (pending as Record<string, unknown> | undefined)?.['toolName'] as string ?? '';
  const argumentsPreview = (pending as Record<string, unknown> | undefined)?.['argumentsPreview'] as string ?? '';
  const parentId = (pending as Record<string, unknown> | undefined)?.['parentId'] as string | null ?? null;
  const eventId = (pending as Record<string, unknown> | undefined)?.['eventId'] as string | null ?? null;

  const toolCall: ToolCall = {
    toolCallId,
    toolName,
    model: null,
    startTs,
    endTs,
    durationMs,
    success: data.success ?? null,
    parentId,
    turnId: sb.currentTurnId,
    eventId,
    argumentsPreview,
  };

  sb.toolCalls.push(toolCall);
  sb.pendingTools.delete(toolCallId);

  // Associate with current turn
  if (sb.currentTurnId) {
    const turn = sb.turnData.get(sb.currentTurnId);
    if (turn) {
      turn.toolCalls.push(toolCall);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registerToolRequest(
  sb: VsCodeChatSessionBuilder,
  req: ToolRequest,
  event: RawVsCodeChatEvent,
): void {
  const toolCallId = req.toolCallId ?? '';
  const argumentsPreview = truncateArguments(req.arguments ?? '');

  // Store metadata for when execution_start/complete arrive
  const existing = sb.pendingTools.get(toolCallId);
  if (existing) {
    Object.assign(existing, {
      toolName: req.name ?? '',
      argumentsPreview,
      parentId: event.parentId ?? null,
      eventId: event.id ?? null,
    });
  } else {
    sb.pendingTools.set(toolCallId, {
      startTs: null,
      toolName: req.name ?? '',
      argumentsPreview,
      parentId: event.parentId ?? null,
      eventId: event.id ?? null,
    } as Partial<ToolCall> & { startTs: string | null });
  }
}

function truncateArguments(args: string, maxLength = 200): string {
  if (args.length <= maxLength) return args;
  return args.slice(0, maxLength) + '…';
}

// ---------------------------------------------------------------------------
// Turn builder
// ---------------------------------------------------------------------------

/**
 * Build the final Turn array from accumulated turn data.
 */
export function buildTurns(sb: VsCodeChatSessionBuilder): Turn[] {
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
