/**
 * CopilotCliSessionProjector — implements {@link SessionProjector} for
 * the Copilot CLI tool by reconstructing a Session from enrichment events.
 *
 * This is the inverse operation of {@link CopilotCliEnrichmentSource.readEvents}.
 */

import type {
  Compaction,
  ModelChange,
  ParseStatus,
  Session,
  TokenBucket,
  ToolCall,
  UtilisationSample,
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

function getNumber(obj: Record<string, unknown>, key: string, fallback = 0): number {
  const v = obj[key];
  return typeof v === 'number' ? v : fallback;
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

function reconstructTokenBucket(v: unknown): TokenBucket {
  const obj = toRecord(v);
  return {
    system: getNumber(obj, 'system'),
    conversation: getNumber(obj, 'conversation'),
    toolDefinitions: getNumber(obj, 'toolDefinitions'),
  };
}

function reconstructUtilisationSample(payload: Record<string, unknown>): UtilisationSample {
  return {
    timestamp: getString(payload, 'timestamp') || new Date().toISOString(),
    percentage: getNumber(payload, 'percentage'),
    used: getNumber(payload, 'used'),
    total: getNumber(payload, 'total'),
    buckets: reconstructTokenBucket(payload['buckets']),
  };
}

function reconstructCompaction(payload: Record<string, unknown>): Compaction {
  return {
    timestamp: getStringOrNull(payload, 'timestamp'),
    inputTokens: getNumber(payload, 'inputTokens'),
    outputTokens: getNumber(payload, 'outputTokens'),
    cacheRead: getNumber(payload, 'cacheRead'),
    cacheWrite: getNumber(payload, 'cacheWrite'),
    model: getStringOrNull(payload, 'model'),
    turnId: getStringOrNull(payload, 'turnId'),
  };
}

function reconstructToolCall(payload: Record<string, unknown>): ToolCall {
  return {
    toolCallId: getString(payload, 'toolCallId'),
    toolName: getString(payload, 'toolName'),
    model: getStringOrNull(payload, 'model'),
    startTs: getStringOrNull(payload, 'startTs'),
    endTs: getStringOrNull(payload, 'endTs'),
    durationMs: getNumberOrNull(payload, 'durationMs'),
    success: getBooleanOrNull(payload, 'success'),
    parentId: getStringOrNull(payload, 'parentId'),
    turnId: getStringOrNull(payload, 'turnId'),
    eventId: getStringOrNull(payload, 'eventId'),
    argumentsPreview: getString(payload, 'argumentsPreview'),
    ...(payload['skillName'] !== undefined
      ? { skillName: payload['skillName'] as string | null }
      : {}),
    ...(payload['skillSource'] !== undefined
      ? { skillSource: payload['skillSource'] as string | null }
      : {}),
    ...(payload['skillContentLength'] !== undefined
      ? { skillContentLength: payload['skillContentLength'] as number | null }
      : {}),
    ...(payload['skillOutcome'] !== undefined
      ? { skillOutcome: payload['skillOutcome'] as ToolCall['skillOutcome'] }
      : {}),
    ...(payload['skillErrorMessage'] !== undefined
      ? { skillErrorMessage: payload['skillErrorMessage'] as string | null }
      : {}),
  };
}

// ── Projector ─────────────────────────────────────────────────────────────────

/**
 * Reconstructs a {@link Session} from a set of enrichment events produced by
 * {@link CopilotCliEnrichmentSource}.
 *
 * Fields not carried by enrichment events (turns, fanoutTurns, assistantMessages,
 * userMessages, subagents) are returned as empty arrays.
 */
export class CopilotCliSessionProjector implements SessionProjector {
  readonly tool = 'copilot-cli' as const;

  project(events: readonly EnrichmentEvent[]): Session {
    const metadataEvent = events.find((e) => e.category === 'metadata');
    const utilisationEvents = events
      .filter((e) => e.category === 'utilisation')
      .sort((a, b) => a.ordinal - b.ordinal);
    const compactionEvents = events
      .filter((e) => e.category === 'compaction')
      .sort((a, b) => a.ordinal - b.ordinal);
    const toolResultEvents = events
      .filter((e) => e.category === 'tool_result')
      .sort((a, b) => a.ordinal - b.ordinal);

    const meta = metadataEvent?.payload ?? {};

    const rawModelChanges = meta['modelChanges'];
    const modelChanges: readonly ModelChange[] = Array.isArray(rawModelChanges)
      ? (rawModelChanges as ModelChange[])
      : [];

    return {
      sessionId: metadataEvent?.sessionId ?? '',
      copilotVersion: getString(meta, 'copilotVersion'),
      selectedModel: getString(meta, 'selectedModel'),
      reasoningEffort: getString(meta, 'reasoningEffort'),
      repository: getString(meta, 'repository'),
      branch: getString(meta, 'branch'),
      cwd: getString(meta, 'cwd'),
      startTs: getStringOrNull(meta, 'startTs'),
      endTs: getStringOrNull(meta, 'endTs'),
      success: getBooleanOrNull(meta, 'success'),
      parseStatus: getParseStatus(meta),
      shutdown: (meta['shutdown'] as Session['shutdown']) ?? null,
      modelChanges,
      utilisation: utilisationEvents.map((e) => reconstructUtilisationSample(e.payload)),
      compactions: compactionEvents.map((e) => reconstructCompaction(e.payload)),
      toolCalls: toolResultEvents.map((e) => reconstructToolCall(e.payload)),
      // Fields not available from enrichment events:
      turns: [],
      fanoutTurns: [],
      assistantMessages: [],
      userMessages: [],
      subagents: [],
    };
  }
}
