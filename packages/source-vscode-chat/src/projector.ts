/**
 * VsCodeChatSessionProjector — implements {@link SessionProjector} for
 * the VS Code Chat tool by reconstructing a Session from enrichment events.
 *
 * This is the inverse operation of {@link VsCodeChatEnrichmentSource.readEvents}.
 */

import type {
  AssistantMessage,
  ParseStatus,
  Session,
  ToolCall,
  Turn,
  UserMessage,
} from '@agent-profiler/core';
import type { EnrichmentEvent, SessionProjector } from '@agent-profiler/enrichment-core';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getString(obj: Record<string, unknown>, key: string, fallback = ''): string {
  const v = obj[key];
  return typeof v === 'string' ? v : fallback;
}

function getStringOrNull(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function getBooleanOrNull(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  return typeof v === 'boolean' ? v : null;
}

function getNumberOrNull(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

function toRecord(v: unknown): Record<string, unknown> {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function getParseStatus(obj: Record<string, unknown>): ParseStatus {
  const ps = toRecord(obj['parseStatus']);
  const status = getString(ps, 'status', 'failed');
  if (status === 'ok' || status === 'partial' || status === 'failed') {
    return { status, error: getStringOrNull(ps, 'error') };
  }
  return { status: 'failed', error: 'unknown' };
}

function reconstructToolCall(payload: Record<string, unknown>): ToolCall {
  return {
    toolCallId: getString(payload, 'toolCallId'),
    toolName: getString(payload, 'toolName'),
    model: null,
    startTs: getStringOrNull(payload, 'startTs'),
    endTs: getStringOrNull(payload, 'endTs'),
    durationMs: getNumberOrNull(payload, 'durationMs'),
    success: getBooleanOrNull(payload, 'success'),
    parentId: getStringOrNull(payload, 'parentId'),
    turnId: getStringOrNull(payload, 'turnId'),
    eventId: getStringOrNull(payload, 'eventId'),
    argumentsPreview: getString(payload, 'argumentsPreview'),
  };
}

function reconstructTurn(
  payload: Record<string, unknown>,
  sessionId: string,
): { turn: Turn; userMessage: UserMessage | null; assistantMessages: AssistantMessage[] } {
  const turnId = getString(payload, 'turnId');
  const startTs = getStringOrNull(payload, 'startTs');
  const endTs = getStringOrNull(payload, 'endTs');

  const rawUserMsg = toRecord(payload['userMessage']);
  let userMessage: UserMessage | null = null;
  if (rawUserMsg['content'] !== undefined) {
    userMessage = {
      interactionId: null,
      timestamp: getStringOrNull(rawUserMsg, 'timestamp'),
      turnId: turnId || null,
      content: getString(rawUserMsg, 'content'),
    };
  }

  const rawAsstMsgs = Array.isArray(payload['assistantMessages'])
    ? (payload['assistantMessages'] as unknown[])
    : [];
  const assistantMessages: AssistantMessage[] = rawAsstMsgs.map((raw) => {
    const m = toRecord(raw);
    return {
      interactionId: null,
      requestId: getStringOrNull(m, 'requestId'),
      outputTokens: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: null,
      timestamp: getStringOrNull(m, 'timestamp'),
      turnId: turnId || null,
      eventId: null,
      parentId: null,
      content: getString(m, 'content'),
      reasoningText: getString(m, 'reasoningText'),
    };
  });

  // Suppress unused variable warning — sessionId is accepted for API consistency
  void sessionId;

  const turn: Turn = {
    turnId,
    startTs,
    endTs,
    userMessage,
    assistantMessages,
    toolCalls: [],
    subagents: [],
  };

  return { turn, userMessage, assistantMessages };
}

// ── Projector ─────────────────────────────────────────────────────────────────

/**
 * Reconstructs a {@link Session} from a set of enrichment events produced by
 * {@link VsCodeChatEnrichmentSource}.
 *
 * Fields such as compactions, subagents, utilisation, and fanoutTurns are
 * returned as empty arrays since VS Code Chat transcripts do not carry that data.
 */
export class VsCodeChatSessionProjector implements SessionProjector {
  readonly tool = 'vscode-chat' as const;

  project(events: readonly EnrichmentEvent[]): Session {
    const metadataEvent = events.find((e) => e.category === 'metadata');
    const toolResultEvents = events
      .filter((e) => e.category === 'tool_result')
      .sort((a, b) => a.ordinal - b.ordinal);
    const userInteractionEvents = events
      .filter((e) => e.category === 'user_interaction')
      .sort((a, b) => a.ordinal - b.ordinal);

    const meta = metadataEvent?.payload ?? {};
    const sessionId = metadataEvent?.sessionId ?? '';

    const toolCalls: ToolCall[] = toolResultEvents.map((e) => reconstructToolCall(e.payload));

    const turns: Turn[] = [];
    const userMessages: UserMessage[] = [];
    const assistantMessages: AssistantMessage[] = [];

    for (const e of userInteractionEvents) {
      const { turn, userMessage, assistantMessages: asstMsgs } = reconstructTurn(
        e.payload,
        sessionId,
      );
      turns.push(turn);
      if (userMessage !== null) {
        userMessages.push(userMessage);
      }
      for (const m of asstMsgs) {
        assistantMessages.push(m);
      }
    }

    return {
      sessionId,
      copilotVersion: getString(meta, 'copilotVersion'),
      selectedModel: '',
      reasoningEffort: '',
      repository: '',
      branch: '',
      cwd: '',
      startTs: getStringOrNull(meta, 'startTs'),
      endTs: getStringOrNull(meta, 'endTs'),
      modelChanges: [],
      toolCalls,
      assistantMessages,
      userMessages,
      compactions: [],
      subagents: [],
      shutdown: null,
      success: null,
      fanoutTurns: [],
      turns,
      parseStatus: getParseStatus(meta),
      utilisation: [],
    };
  }
}
