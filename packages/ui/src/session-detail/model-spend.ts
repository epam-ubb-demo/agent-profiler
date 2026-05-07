/**
 * Pure-function utility that transforms {@link ShutdownMetrics.modelMetrics}
 * into table rows for the "Per-model spend" table.
 *
 * All computation is side-effect-free; the module exports a single
 * {@link computeModelSpend} function that derives sorted spend rows
 * and footer totals from shutdown metrics.
 */

import type { ShutdownMetrics } from '@agent-profiler/core';
import { calculateCost } from '@agent-profiler/pricing';
import type { CostConfidence } from '@agent-profiler/pricing';

/* ------------------------------------------------------------------ */
/*  Public interfaces                                                  */
/* ------------------------------------------------------------------ */

/** A single row in the per-model spend table. */
export interface ModelSpendRow {
  /** Model identifier, e.g. `"claude-sonnet-4-20250514"`. */
  readonly model: string;
  /** Number of API requests made to this model. */
  readonly requestCount: number;
  /** Estimated cost in USD sourced from the pricing calculator. */
  readonly premiumCostUsd: number;
  /** Total input tokens sent to the model. */
  readonly inputTokens: number;
  /** Total output tokens received from the model. */
  readonly outputTokens: number;
  /** Tokens served from the prompt cache. */
  readonly cacheReadTokens: number;
  /** Tokens written into the prompt cache. */
  readonly cacheWriteTokens: number;
  /** Alias for {@link premiumCostUsd}. */
  readonly estimatedUsd: number;
}

/** Aggregated totals for the table footer row. */
export interface ModelSpendTotals {
  /** Sum of request counts across all models. */
  readonly requestCount: number;
  /** Sum of per-model estimated costs. */
  readonly premiumCostUsd: number;
  /** Sum of input tokens across all models. */
  readonly inputTokens: number;
  /** Sum of output tokens across all models. */
  readonly outputTokens: number;
  /** Sum of cache-read tokens across all models. */
  readonly cacheReadTokens: number;
  /** Sum of cache-write tokens across all models. */
  readonly cacheWriteTokens: number;
  /** Sum of estimated USD across all models. */
  readonly estimatedUsd: number;
}

/** Result returned by {@link computeModelSpend}. */
export interface ModelSpendResult {
  /** Per-model rows sorted by {@link ModelSpendRow.estimatedUsd} descending. */
  readonly rows: readonly ModelSpendRow[];
  /** Aggregated footer totals. */
  readonly totals: ModelSpendTotals;
  /** Confidence level of the cost estimate. */
  readonly confidence: CostConfidence;
}

/* ------------------------------------------------------------------ */
/*  Main computation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute per-model spend rows, footer totals, and cost confidence
 * from shutdown metrics.
 *
 * Returns `null` when no shutdown data is available.
 *
 * @param shutdown - The session's shutdown metrics, or `null`.
 * @returns Sorted spend rows with totals, or `null`.
 */
export function computeModelSpend(
  shutdown: ShutdownMetrics | null,
): ModelSpendResult | null {
  if (shutdown === null) return null;

  const costBreakdown = calculateCost(shutdown);

  /* ---- Build unsorted rows ---- */
  const rows: ModelSpendRow[] = shutdown.modelMetrics.map((m) => {
    const cost = costBreakdown.perModel[m.model]?.totalCostUsd ?? 0;

    return {
      model: m.model,
      requestCount: m.requestCount,
      premiumCostUsd: cost,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheWriteTokens: m.cacheWriteTokens,
      estimatedUsd: cost,
    };
  });

  /* ---- Sort by estimatedUsd descending ---- */
  rows.sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  /* ---- Compute footer totals ---- */
  let requestCount = 0;
  let premiumCostUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  for (const row of rows) {
    requestCount += row.requestCount;
    premiumCostUsd += row.premiumCostUsd;
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    cacheReadTokens += row.cacheReadTokens;
    cacheWriteTokens += row.cacheWriteTokens;
  }

  return {
    rows,
    totals: {
      requestCount,
      premiumCostUsd,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      estimatedUsd: premiumCostUsd,
    },
    confidence: costBreakdown.confidence,
  };
}
