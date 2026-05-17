import type { Session } from '@agent-profiler/core';
import { calculateCost } from '@agent-profiler/pricing';
import type { TokenUsage } from '@agent-profiler/pricing';

type AssistantMessageMetrics = {
  readonly model: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
};

function buildTokenUsageFromMessages(messages: readonly AssistantMessageMetrics[]): TokenUsage | null {
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
  for (const [model, usage] of byModel) {
    modelMetrics.push({ model, ...usage });
  }

  return { modelMetrics };
}

/** Extract lightweight metrics from a parsed session for session-list cards/summary. */
export function extractSessionListMetrics(session: Session) {
  if (session.parseStatus.status === 'failed') return null;

  const usage = session.shutdown ?? buildTokenUsageFromMessages(session.assistantMessages);

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;

  if (usage !== null) {
    for (const modelMetrics of usage.modelMetrics) {
      totalInput += modelMetrics.inputTokens;
      totalOutput += modelMetrics.outputTokens;
      totalCacheRead += modelMetrics.cacheReadTokens;
      totalCacheWrite += modelMetrics.cacheWriteTokens;
    }
  }

  let totalCostUsd: number | null = null;
  let costConfidence: 'known' | 'estimated' | 'unknown' = 'unknown';
  if (usage !== null) {
    const breakdown = calculateCost(usage);
    totalCostUsd = breakdown.totalUsd;
    costConfidence = breakdown.confidence;
  }

  const totalTokensForCost =
    totalInput + totalOutput + totalCacheRead + totalCacheWrite;
  const avgTokensPerCost =
    totalCostUsd !== null && totalCostUsd > 0
      ? totalTokensForCost / totalCostUsd
      : null;

  let wallTimeMs: number | null = null;
  if (session.startTs && session.endTs) {
    const diff = new Date(session.endTs).getTime() - new Date(session.startTs).getTime();
    if (diff > 0) wallTimeMs = diff;
  }

  const modelUsage: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }> = [];
  if (usage !== null) {
    for (const m of usage.modelMetrics) {
      modelUsage.push({
        model: m.model,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
      });
    }
  }

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    totalCacheWriteTokens: totalCacheWrite,
    totalCostUsd,
    avgTokensPerCost,
    costConfidence,
    wallTimeMs,
    repository: session.repository ?? '',
    modelUsage,
  };
}
