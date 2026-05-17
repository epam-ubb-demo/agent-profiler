/**
 * Pure-function utilities for computing session KPI statistics.
 *
 * All computation is side-effect-free; the module exports a single
 * {@link computeSessionStats} function that derives 11 stat entries
 * from a {@link Session} object.
 */

import type { Session } from '@agent-profiler/core';
import { calculateCost, DEFAULT_PRICING_TABLE } from '@agent-profiler/pricing';
import type { TokenUsage } from '@agent-profiler/pricing';

import { formatCost, formatDuration, formatTokenCount } from '../comparative/format';

/**
 * A single KPI stat with its raw value, formatted display string,
 * and human-readable label.
 */
export interface StatEntry {
  readonly value: number | null;
  readonly display: string;
  readonly label: string;
  /** When true, the stat requires shutdown data that is not yet available. */
  readonly pending?: boolean;
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
  readonly avgTokensPerCost: StatEntry;
  readonly avgTokensPerToolCall: StatEntry;
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
 * Build a minimal {@link TokenUsage} by aggregating assistant messages
 * that carry non-null model attribution.
 *
 * Returns `null` when no usable messages exist.
 */
function buildTokenUsageFromMessages(
  messages: readonly { readonly model: string | null; readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly cacheWriteTokens: number }[],
): TokenUsage | null {
  const byModel = new Map<
    string,
    { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  >();

  for (const msg of messages) {
    if (msg.model === null) continue;
    const existing = byModel.get(msg.model);
    if (existing) {
      existing.inputTokens += msg.inputTokens;
      existing.outputTokens += msg.outputTokens;
      existing.cacheReadTokens += msg.cacheReadTokens;
      existing.cacheWriteTokens += msg.cacheWriteTokens;
    } else {
      byModel.set(msg.model, {
        inputTokens: msg.inputTokens,
        outputTokens: msg.outputTokens,
        cacheReadTokens: msg.cacheReadTokens,
        cacheWriteTokens: msg.cacheWriteTokens,
      });
    }
  }

  if (byModel.size === 0) return null;

  const modelMetrics: TokenUsage['modelMetrics'][number][] = [];
  for (const [model, agg] of byModel) {
    modelMetrics.push({ model, ...agg });
  }
  return { modelMetrics };
}

/**
 * Sum output tokens from assistant messages (only those with non-null model).
 */
function totalOutputTokensFromMessages(
  messages: readonly { readonly model: string | null; readonly outputTokens: number }[],
): number {
  let sum = 0;
  for (const msg of messages) {
    if (msg.model !== null) sum += msg.outputTokens;
  }
  return sum;
}

function totalTokensFromUsage(
  modelMetrics: readonly {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
  }[],
): number {
  return modelMetrics.reduce(
    (sum, m) =>
      sum
      + m.inputTokens
      + m.outputTokens
      + m.cacheReadTokens
      + m.cacheWriteTokens,
    0,
  );
}

function formatTokensPerCost(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  return `${formatTokenCount(Math.round(value))}/$`;
}

/**
 * Derive all 11 KPI stat entries from a session.
 *
 * The function is pure — it performs no I/O and has no side effects.
 * All nullable fields degrade gracefully: `value` becomes `null` and
 * `display` becomes "—".
 *
 * When `isLive` is true, stats requiring shutdown data are marked as
 * `pending` and stats representing elapsed time are prefixed with "~".
 */
export function computeSessionStats(session: Session, options?: { isLive?: boolean }): SessionStats {
  const isLive = options?.isLive ?? false;
  const durationMs = isLive
    ? (session.startTs !== null ? Date.now() - new Date(session.startTs).getTime() : null)
    : computeDurationMs(session.startTs, session.endTs);

  const shutdown = session.shutdown;
  const tokenUsage = shutdown ?? buildTokenUsageFromMessages(session.assistantMessages);

  const costBreakdown =
    tokenUsage !== null
      ? calculateCost(tokenUsage, DEFAULT_PRICING_TABLE)
      : null;

  const toolCount = session.toolCalls.length;

  const outputTotal =
    shutdown !== null
      ? totalOutputTokens(shutdown.modelMetrics)
      : totalOutputTokensFromMessages(session.assistantMessages) || null;

  const avgTokens =
    outputTotal !== null && toolCount > 0
      ? Math.round(outputTotal / toolCount)
      : outputTotal !== null
        ? 0
        : null;

  const avgTokensPerCost =
    !isLive
      && tokenUsage !== null
      && costBreakdown !== null
      && costBreakdown.totalUsd > 0
      ? totalTokensFromUsage(tokenUsage.modelMetrics) / costBreakdown.totalUsd
      : null;

  return {
    duration: {
      value: durationMs,
      display: durationMs !== null
        ? (isLive ? `~${formatDuration(durationMs)}` : formatDuration(durationMs))
        : NO_DATA,
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
      value: isLive ? null : (costBreakdown !== null ? costBreakdown.totalUsd : null),
      display: isLive ? NO_DATA : formatCost(costBreakdown !== null ? costBreakdown.totalUsd : null),
      label: 'Estimated Cost',
      pending: isLive,
    },
    avgTokensPerCost: {
      value: avgTokensPerCost,
      display: formatTokensPerCost(avgTokensPerCost),
      label: 'Avg Tokens / $',
      pending: isLive,
    },
    avgTokensPerToolCall: {
      value: avgTokens !== null ? avgTokens : null,
      display:
        avgTokens !== null ? formatTokenCount(avgTokens) : NO_DATA,
      label: 'Avg Tokens / Tool Call',
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
      value: isLive ? null : (session.success === null ? null : session.success ? 1 : 0),
      display: isLive ? NO_DATA : formatSuccess(session.success),
      label: 'Task Success',
      pending: isLive,
    },
  };
}
