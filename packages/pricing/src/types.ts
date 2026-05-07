/**
 * Pricing engine domain types.
 *
 * All monetary values are in USD. Rates are per million tokens.
 */

/**
 * Per-model rate card: cost (USD) per 1,000,000 tokens for each bucket.
 */
export interface ModelRateCard {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

/**
 * Full pricing table mapping model identifiers to their rate cards.
 */
export type PricingTable = Record<string, ModelRateCard>;

/**
 * Itemised cost for a single model within a session.
 */
export interface ModelCost {
  readonly modelName: string;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly outputTokens: number;
  readonly inputCostUsd: number;
  readonly cacheReadCostUsd: number;
  readonly cacheWriteCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
}

/**
 * Confidence level for a cost estimate:
 * - `'known'` — model found in pricing table with all buckets populated
 * - `'estimated'` — model found but some buckets have zero/missing rates
 * - `'unknown'` — model not found in pricing table (cost is zero)
 */
export type CostConfidence = 'known' | 'estimated' | 'unknown';

/**
 * Full cost breakdown for a session, aggregated across all models.
 */
export interface CostBreakdown {
  readonly totalUsd: number;
  readonly perModel: Record<string, ModelCost>;
  readonly confidence: CostConfidence;
}
