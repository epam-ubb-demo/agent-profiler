/**
 * Overlapping-input cost calculator.
 *
 * Implements overlapping billing where `inputTokens` already includes
 * `cacheReadTokens`, so non-cached input must be isolated by subtraction.
 *
 * Formula per model:
 *   cost = (max(0, inputTokens − cacheReadTokens) × inputRate
 *         + cacheReadTokens × cacheReadRate
 *         + cacheWriteTokens × cacheWriteRate
 *         + outputTokens × outputRate) / 1,000,000
 *
 * The inputTokens field from the Copilot CLI includes cached tokens,
 * so cacheReadTokens is subtracted to isolate non-cached input.
 */

import type { ModelMetrics, ShutdownMetrics } from '@agent-profiler/core';

import { loadPricingTable } from './pricing-table';
import type { CostBreakdown, CostConfidence, ModelCost, PricingTable } from './types';

/**
 * Minimal token-usage shape accepted by the calculator.
 * Allows direct use without a full `ShutdownMetrics` object.
 */
export interface TokenUsage {
  readonly modelMetrics: readonly Pick<
    ModelMetrics,
    'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'
  >[];
}

/**
 * Round a number to 6 decimal places (micro-dollar precision).
 */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Calculate the cost breakdown for a session's token usage.
 *
 * @param metrics - Either a `ShutdownMetrics` or minimal `TokenUsage` object.
 * @param pricingTable - Optional override; defaults to `loadPricingTable()`.
 * @returns A `CostBreakdown` with per-model costs and confidence.
 */
export function calculateCost(
  metrics: ShutdownMetrics | TokenUsage,
  pricingTable?: PricingTable,
): CostBreakdown {
  const table = pricingTable ?? loadPricingTable();
  const perModel: Record<string, ModelCost> = {};

  let overallConfidence: CostConfidence = 'known';

  for (const entry of metrics.modelMetrics) {
    const rates = table[entry.model];

    if (!rates) {
      perModel[entry.model] = {
        modelName: entry.model,
        inputTokens: entry.inputTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cacheWriteTokens: entry.cacheWriteTokens,
        outputTokens: entry.outputTokens,
        inputCostUsd: 0,
        cacheReadCostUsd: 0,
        cacheWriteCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
      };
      overallConfidence = 'unknown';
      continue;
    }

    // Determine per-model confidence
    const hasAllRates =
      rates.input > 0 && rates.cacheRead > 0 && rates.output > 0;
    if (!hasAllRates && overallConfidence !== 'unknown') {
      overallConfidence = 'estimated';
    }

    const nonCachedInput = Math.max(0, entry.inputTokens - entry.cacheReadTokens);
    const inputCost = round6((nonCachedInput * rates.input) / 1_000_000);
    const cacheReadCost = round6((entry.cacheReadTokens * rates.cacheRead) / 1_000_000);
    const cacheWriteCost = round6((entry.cacheWriteTokens * rates.cacheWrite) / 1_000_000);
    const outputCost = round6((entry.outputTokens * rates.output) / 1_000_000);
    const totalCost = round6(inputCost + cacheReadCost + cacheWriteCost + outputCost);

    perModel[entry.model] = {
      modelName: entry.model,
      inputTokens: entry.inputTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheWriteTokens: entry.cacheWriteTokens,
      outputTokens: entry.outputTokens,
      inputCostUsd: inputCost,
      cacheReadCostUsd: cacheReadCost,
      cacheWriteCostUsd: cacheWriteCost,
      outputCostUsd: outputCost,
      totalCostUsd: totalCost,
    };
  }

  const totalUsd = round6(
    Object.values(perModel).reduce((sum, m) => sum + m.totalCostUsd, 0),
  );

  return { totalUsd, perModel, confidence: overallConfidence };
}
