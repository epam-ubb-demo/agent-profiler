/**
 * Metrics domain types.
 *
 * Shutdown metrics summarise a session's final state. Utilisation samples
 * track the context-window fill over time.
 */

/**
 * Per-model token totals and request counts.
 */
export interface ModelMetrics {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly requestCount: number;
  readonly premiumRequestCost: number;
  readonly apiDurationMs: number;
}

/**
 * Token bucket categories used in utilisation tracking.
 */
export interface TokenBucket {
  readonly system: number;
  readonly conversation: number;
  readonly toolDefinitions: number;
}

/**
 * Final shutdown metrics reported by the Copilot CLI process.
 */
export interface ShutdownMetrics {
  readonly totalPremiumRequests: number;
  readonly totalApiDurationMs: number;
  readonly modelMetrics: readonly ModelMetrics[];
  readonly currentTokens: number;
  readonly systemTokens: number;
  readonly conversationTokens: number;
  readonly toolDefinitionsTokens: number;
  readonly codeChanges: Record<string, unknown>;
  readonly timestamp: string | null;
}

/**
 * A single utilisation sample from the process log.
 */
export interface UtilisationSample {
  readonly timestamp: string;
  readonly percentage: number;
  readonly used: number;
  readonly total: number;
  readonly buckets: TokenBucket;
}
