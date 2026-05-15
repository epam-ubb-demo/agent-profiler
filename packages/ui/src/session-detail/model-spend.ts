/**
 * Pure-function utility that transforms model metrics into table rows
 * for the "Per-model spend" table.
 *
 * All computation is side-effect-free; the module exports a single
 * {@link computeModelSpend} function that derives sorted spend rows
 * and footer totals from a {@link Session} object.
 *
 * When shutdown metrics are available they are preferred (most accurate).
 * Otherwise, per-request token data from assistant messages is aggregated
 * as a fallback.
 */

import type { AssistantMessage, Session } from '@agent-profiler/core';
import { calculateCost, DEFAULT_PRICING_TABLE } from '@agent-profiler/pricing';
import type { CostConfidence, TokenUsage } from '@agent-profiler/pricing';

/** GitHub Copilot premium request rate: $0.04 per request. */
const PREMIUM_REQUEST_RATE_USD = 0.04;

/* ------------------------------------------------------------------ */
/*  Public interfaces                                                  */
/* ------------------------------------------------------------------ */

/** A single row in the per-model spend table. */
export interface ModelSpendRow {
  /** Model identifier, e.g. `"claude-sonnet-4-20250514"`. */
  readonly model: string;
  /** Number of API requests made to this model. */
  readonly requestCount: number;
  /** Number of premium requests (derived from premiumRequestCost / $0.04 when available, null if unknown). */
  readonly premiumRequests: number | null;
  /** Cost based on premium requests × $0.04/request. */
  readonly premiumRequestCostUsd: number;
  /** Total input tokens sent to the model. */
  readonly inputTokens: number;
  /** Total output tokens received from the model. */
  readonly outputTokens: number;
  /** Tokens served from the prompt cache. */
  readonly cacheReadTokens: number;
  /** Tokens written into the prompt cache. */
  readonly cacheWriteTokens: number;
  /** Estimated cost in USD from the token-based pricing calculator. */
  readonly estimatedUsd: number;
  /** Cost of fresh (non-cached) input tokens in USD. */
  readonly inputCostUsd: number;
  /** Cost of cache-read tokens in USD. */
  readonly cacheReadCostUsd: number;
  /** Cost of cache-write tokens in USD. */
  readonly cacheWriteCostUsd: number;
  /** Cost of output tokens in USD. */
  readonly outputCostUsd: number;
}

/** Aggregated totals for the table footer row. */
export interface ModelSpendTotals {
  /** Sum of request counts across all models. */
  readonly requestCount: number;
  /** Total premium request count from shutdown data. */
  readonly premiumRequests: number;
  /** Total premium request cost = totalPremiumRequests × $0.04. */
  readonly premiumRequestCostUsd: number;
  /** Sum of input tokens across all models. */
  readonly inputTokens: number;
  /** Sum of output tokens across all models. */
  readonly outputTokens: number;
  /** Sum of cache-read tokens across all models. */
  readonly cacheReadTokens: number;
  /** Sum of cache-write tokens across all models. */
  readonly cacheWriteTokens: number;
  /** Sum of token-based estimated USD across all models. */
  readonly estimatedUsd: number;
  /** Total cost of fresh (non-cached) input tokens in USD. */
  readonly inputCostUsd: number;
  /** Total cost of cache-read tokens in USD. */
  readonly cacheReadCostUsd: number;
  /** Total cost of cache-write tokens in USD. */
  readonly cacheWriteCostUsd: number;
  /** Total cost of output tokens in USD. */
  readonly outputCostUsd: number;
}

/** Result returned by {@link computeModelSpend}. */
export interface ModelSpendResult {
  /** Per-model rows sorted by {@link ModelSpendRow.estimatedUsd} descending. */
  readonly rows: readonly ModelSpendRow[];
  /** Aggregated footer totals. */
  readonly totals: ModelSpendTotals;
  /** Confidence level of the cost estimate. */
  readonly confidence: CostConfidence;
  /** Whether data was derived from shutdown metrics or assistant messages. */
  readonly source: 'shutdown' | 'messages';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Aggregate per-model token data from assistant messages.
 *
 * Messages with `model: null` are excluded. Returns a `TokenUsage`-compatible
 * array of per-model token totals and a parallel request-count map.
 */
function aggregateFromMessages(
  messages: readonly AssistantMessage[],
): { usage: TokenUsage; requestCounts: Record<string, number> } | null {
  const byModel = new Map<
    string,
    { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; requestCount: number }
  >();

  for (const msg of messages) {
    if (msg.model === null) continue;

    const existing = byModel.get(msg.model);
    if (existing) {
      existing.inputTokens += msg.inputTokens;
      existing.outputTokens += msg.outputTokens;
      existing.cacheReadTokens += msg.cacheReadTokens;
      existing.cacheWriteTokens += msg.cacheWriteTokens;
      existing.requestCount += 1;
    } else {
      byModel.set(msg.model, {
        inputTokens: msg.inputTokens,
        outputTokens: msg.outputTokens,
        cacheReadTokens: msg.cacheReadTokens,
        cacheWriteTokens: msg.cacheWriteTokens,
        requestCount: 1,
      });
    }
  }

  if (byModel.size === 0) return null;

  const modelMetrics: TokenUsage['modelMetrics'][number][] = [];
  const requestCounts: Record<string, number> = {};

  for (const [model, agg] of byModel) {
    modelMetrics.push({
      model,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheReadTokens: agg.cacheReadTokens,
      cacheWriteTokens: agg.cacheWriteTokens,
    });
    requestCounts[model] = agg.requestCount;
  }

  return { usage: { modelMetrics }, requestCounts };
}

/* ------------------------------------------------------------------ */
/*  Main computation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute per-model spend rows, footer totals, and cost confidence.
 *
 * Prefers shutdown metrics when available (most accurate). Falls back
 * to aggregating per-request token data from assistant messages when
 * the session has no shutdown data.
 *
 * Returns `null` when neither source provides data.
 *
 * @param session - The full session object.
 * @returns Sorted spend rows with totals, or `null`.
 */
export function computeModelSpend(
  session: Session,
): ModelSpendResult | null {
  const { shutdown } = session;

  /* ---- Preferred path: shutdown metrics ---- */
  if (shutdown !== null) {
    const costBreakdown = calculateCost(shutdown, DEFAULT_PRICING_TABLE);

    const rows: ModelSpendRow[] = shutdown.modelMetrics.map((m) => {
      const modelCost = costBreakdown.perModel[m.model];

      return {
        model: m.model,
        requestCount: m.requestCount,
        premiumRequests: m.premiumRequestCost > 0 ? Math.round(m.premiumRequestCost / PREMIUM_REQUEST_RATE_USD) : null,
        premiumRequestCostUsd: m.premiumRequestCost,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
        estimatedUsd: modelCost?.totalCostUsd ?? 0,
        inputCostUsd: modelCost?.inputCostUsd ?? 0,
        cacheReadCostUsd: modelCost?.cacheReadCostUsd ?? 0,
        cacheWriteCostUsd: modelCost?.cacheWriteCostUsd ?? 0,
        outputCostUsd: modelCost?.outputCostUsd ?? 0,
      };
    });

    rows.sort((a, b) => b.estimatedUsd - a.estimatedUsd);

    return {
      ...buildTotals(rows, shutdown.totalPremiumRequests),
      confidence: costBreakdown.confidence,
      source: 'shutdown',
    };
  }

  /* ---- Fallback: aggregate from assistant messages ---- */
  const aggregated = aggregateFromMessages(session.assistantMessages);
  if (aggregated === null) return null;

  const costBreakdown = calculateCost(aggregated.usage, DEFAULT_PRICING_TABLE);

  const rows: ModelSpendRow[] = aggregated.usage.modelMetrics.map((m) => {
    const modelCost = costBreakdown.perModel[m.model];

    return {
      model: m.model,
      requestCount: aggregated.requestCounts[m.model] ?? 0,
      premiumRequests: null,
      premiumRequestCostUsd: 0,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheWriteTokens: m.cacheWriteTokens,
      estimatedUsd: modelCost?.totalCostUsd ?? 0,
      inputCostUsd: modelCost?.inputCostUsd ?? 0,
      cacheReadCostUsd: modelCost?.cacheReadCostUsd ?? 0,
      cacheWriteCostUsd: modelCost?.cacheWriteCostUsd ?? 0,
      outputCostUsd: modelCost?.outputCostUsd ?? 0,
    };
  });

  rows.sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  return {
    ...buildTotals(rows, 0),
    confidence: costBreakdown.confidence,
    source: 'messages',
  };
}

/**
 * Sum row values into footer totals.
 */
function buildTotals(rows: readonly ModelSpendRow[], totalPremiumRequests: number): {
  rows: readonly ModelSpendRow[];
  totals: ModelSpendTotals;
} {
  let requestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedUsd = 0;
  let inputCostUsd = 0;
  let cacheReadCostUsd = 0;
  let cacheWriteCostUsd = 0;
  let outputCostUsd = 0;

  for (const row of rows) {
    requestCount += row.requestCount;
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    cacheReadTokens += row.cacheReadTokens;
    cacheWriteTokens += row.cacheWriteTokens;
    estimatedUsd += row.estimatedUsd;
    inputCostUsd += row.inputCostUsd;
    cacheReadCostUsd += row.cacheReadCostUsd;
    cacheWriteCostUsd += row.cacheWriteCostUsd;
    outputCostUsd += row.outputCostUsd;
  }

  return {
    rows,
    totals: {
      requestCount,
      premiumRequests: totalPremiumRequests,
      premiumRequestCostUsd: totalPremiumRequests * PREMIUM_REQUEST_RATE_USD,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      estimatedUsd,
      inputCostUsd,
      cacheReadCostUsd,
      cacheWriteCostUsd,
      outputCostUsd,
    },
  };
}
