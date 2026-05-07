/**
 * Pure-function utilities for computing session KPI statistics.
 *
 * All computation is side-effect-free; the module exports a single
 * {@link computeSessionStats} function that derives 11 stat entries
 * from a {@link Session} object.
 */

import type { Session } from '@agent-profiler/core';
import { calculateCost } from '@agent-profiler/pricing';

import { formatCost, formatDuration, formatTokenCount } from '../comparative/format';

/**
 * A single KPI stat with its raw value, formatted display string,
 * and human-readable label.
 */
export interface StatEntry {
  readonly value: number | null;
  readonly display: string;
  readonly label: string;
}

/**
 * Computed KPIs for a single session.
 */
export interface SessionStats {
  readonly duration: StatEntry;
  readonly toolCallCount: StatEntry;
  readonly assistantMessageCount: StatEntry;
  readonly turnCount: StatEntry;
  readonly compactionCount: StatEntry;
  readonly subagentCount: StatEntry;
  readonly estimatedCost: StatEntry;
  readonly avgTokensPerToolCall: StatEntry;
  readonly premiumRequests: StatEntry;
  readonly apiTime: StatEntry;
  readonly taskSuccess: StatEntry;
}

/** Placeholder display value used when data is unavailable. */
const NO_DATA = '—';

/**
 * Compute wall-clock duration between two ISO timestamps.
 * Returns `null` when either timestamp is missing.
 */
function computeDurationMs(
  startTs: string | null,
  endTs: string | null,
): number | null {
  if (startTs === null || endTs === null) return null;
  return new Date(endTs).getTime() - new Date(startTs).getTime();
}

/**
 * Sum all output tokens across every model in shutdown metrics.
 */
function totalOutputTokens(
  modelMetrics: readonly { readonly outputTokens: number }[],
): number {
  return modelMetrics.reduce((sum, m) => sum + m.outputTokens, 0);
}

/**
 * Format the task-success tri-state.
 */
function formatSuccess(success: boolean | null): string {
  if (success === null) return NO_DATA;
  return success ? '✓' : '✗';
}

/**
 * Derive all 11 KPI stat entries from a session.
 *
 * The function is pure — it performs no I/O and has no side effects.
 * All nullable fields degrade gracefully: `value` becomes `null` and
 * `display` becomes "—".
 */
export function computeSessionStats(session: Session): SessionStats {
  const durationMs = computeDurationMs(session.startTs, session.endTs);

  const shutdown = session.shutdown;

  const costBreakdown =
    shutdown !== null ? calculateCost(shutdown) : null;

  const toolCount = session.toolCalls.length;

  const outputTotal =
    shutdown !== null ? totalOutputTokens(shutdown.modelMetrics) : null;

  const avgTokens =
    outputTotal !== null && toolCount > 0
      ? Math.round(outputTotal / toolCount)
      : outputTotal !== null
        ? 0
        : null;

  return {
    duration: {
      value: durationMs,
      display: durationMs !== null ? formatDuration(durationMs) : NO_DATA,
      label: 'Duration',
    },
    toolCallCount: {
      value: toolCount,
      display: String(toolCount),
      label: 'Tool Calls',
    },
    assistantMessageCount: {
      value: session.assistantMessages.length,
      display: String(session.assistantMessages.length),
      label: 'Assistant Messages',
    },
    turnCount: {
      value: session.turns.length,
      display: String(session.turns.length),
      label: 'Turns',
    },
    compactionCount: {
      value: session.compactions.length,
      display: String(session.compactions.length),
      label: 'Compactions',
    },
    subagentCount: {
      value: session.subagents.length,
      display: String(session.subagents.length),
      label: 'Sub-agents',
    },
    estimatedCost: {
      value: costBreakdown !== null ? costBreakdown.totalUsd : null,
      display: formatCost(costBreakdown !== null ? costBreakdown.totalUsd : null),
      label: 'Estimated Cost',
    },
    avgTokensPerToolCall: {
      value: avgTokens !== null ? avgTokens : null,
      display:
        avgTokens !== null ? formatTokenCount(avgTokens) : NO_DATA,
      label: 'Avg Tokens / Tool Call',
    },
    premiumRequests: {
      value: shutdown !== null ? shutdown.totalPremiumRequests : null,
      display:
        shutdown !== null
          ? String(shutdown.totalPremiumRequests)
          : NO_DATA,
      label: 'Premium Requests',
    },
    apiTime: {
      value: shutdown !== null ? shutdown.totalApiDurationMs : null,
      display:
        shutdown !== null
          ? formatDuration(shutdown.totalApiDurationMs)
          : NO_DATA,
      label: 'API Time',
    },
    taskSuccess: {
      value:
        session.success === null ? null : session.success ? 1 : 0,
      display: formatSuccess(session.success),
      label: 'Task Success',
    },
  };
}
