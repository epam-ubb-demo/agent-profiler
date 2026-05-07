/**
 * Multi-session canonical aggregation.
 *
 * Pure functions that roll up multiple sessions into summary metrics.
 * Never throws — returns zeroed/empty aggregation on failure.
 */

import type { Session } from './types/index';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ModelUsageRollup {
  readonly model: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheWriteTokens: number;
  readonly totalCost: number | null;
  readonly sessionCount: number;
}

export interface ToolUsageSummary {
  readonly toolName: string;
  readonly callCount: number;
  readonly totalDurationMs: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly models: readonly string[];
}

export interface SessionSummaryRow {
  readonly sessionId: string;
  readonly label: string;
  readonly variantId: string | null;
  readonly stepIndex: number | null;
  readonly wallTimeMs: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCost: number | null;
  readonly turnCount: number;
  readonly toolCallCount: number;
  readonly models: readonly string[];
  readonly parseStatus: string;
}

export interface BenchRunAggregation {
  readonly sessions: readonly SessionSummaryRow[];
  readonly modelUsage: readonly ModelUsageRollup[];
  readonly toolUsage: readonly ToolUsageSummary[];
  readonly totalCost: number | null;
  readonly totalWallTimeMs: number;
  readonly variantCount: number;
  readonly sessionCount: number;
}

export interface AggregationEntry {
  readonly session: Session;
  readonly label?: string | undefined;
  readonly variantId?: string | null | undefined;
  readonly stepIndex?: number | null | undefined;
}

/**
 * Optional cost calculator injected by caller to avoid circular dependency
 * with @agent-profiler/pricing.
 */
export type CostCalculator = (session: Session) => number | null;

export interface AggregationOptions {
  readonly calculateCost?: CostCalculator | undefined;
}

// ─── Implementation ──────────────────────────────────────────────────────────

const EMPTY_AGGREGATION: BenchRunAggregation = {
  sessions: [],
  modelUsage: [],
  toolUsage: [],
  totalCost: null,
  totalWallTimeMs: 0,
  variantCount: 0,
  sessionCount: 0,
};

/**
 * Aggregate multiple sessions into a BenchRunAggregation.
 */
export function aggregateBenchRun(
  entries: readonly AggregationEntry[],
  options?: AggregationOptions,
): BenchRunAggregation {
  if (entries.length === 0) {
    return EMPTY_AGGREGATION;
  }

  const calculateCost = options?.calculateCost;
  const sessionRows: SessionSummaryRow[] = [];
  const modelMap = new Map<string, MutableModelRollup>();
  const toolMap = new Map<string, MutableToolSummary>();
  const variantIds = new Set<string>();

  let totalCost: number | null = 0;
  let totalWallTimeMs = 0;

  for (const entry of entries) {
    const { session } = entry;

    // Track variants
    if (entry.variantId != null) {
      variantIds.add(entry.variantId);
    }

    // Wall time
    const wallTimeMs = computeWallTimeMs(session);
    totalWallTimeMs += wallTimeMs;

    // Per-session cost
    const sessionCost = calculateCost ? calculateCost(session) : null;
    if (sessionCost === null) {
      totalCost = null;
    } else if (totalCost !== null) {
      totalCost += sessionCost;
    }

    // Models used in this session
    const sessionModels = getSessionModels(session);

    // Accumulate model metrics from shutdownMetrics
    if (session.shutdown) {
      for (const mm of session.shutdown.modelMetrics) {
        accumulateModel(modelMap, mm.model, mm, sessionCost !== null ? undefined : null);
      }
    }

    // Accumulate tool usage
    for (const tc of session.toolCalls) {
      accumulateTool(toolMap, tc);
    }

    // Build session summary row
    const { totalInput, totalOutput } = getSessionTokenTotals(session);
    sessionRows.push({
      sessionId: session.sessionId,
      label: entry.label ?? session.sessionId,
      variantId: entry.variantId ?? null,
      stepIndex: entry.stepIndex ?? null,
      wallTimeMs,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCost: sessionCost,
      turnCount: session.turns.length,
      toolCallCount: session.toolCalls.length,
      models: sessionModels,
      parseStatus: session.parseStatus.status,
    });
  }

  // Assign per-model costs if we have a cost calculator
  // We compute per-model cost share from shutdown metrics proportionally
  const modelUsage = buildModelUsage(modelMap, entries, calculateCost);
  const toolUsage = buildToolUsage(toolMap);

  return {
    sessions: sessionRows,
    modelUsage,
    toolUsage,
    totalCost,
    totalWallTimeMs,
    variantCount: variantIds.size,
    sessionCount: entries.length,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface MutableModelRollup {
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  sessionIds: Set<string>;
}

interface MutableToolSummary {
  toolName: string;
  callCount: number;
  totalDurationMs: number;
  successCount: number;
  failureCount: number;
  models: Set<string>;
}

function computeWallTimeMs(session: Session): number {
  if (!session.startTs || !session.endTs) return 0;
  const start = new Date(session.startTs).getTime();
  const end = new Date(session.endTs).getTime();
  const diff = end - start;
  return diff > 0 ? diff : 0;
}

function getSessionModels(session: Session): string[] {
  const models = new Set<string>();
  if (session.selectedModel) {
    models.add(session.selectedModel);
  }
  for (const mc of session.modelChanges) {
    models.add(mc.model);
  }
  if (session.shutdown) {
    for (const mm of session.shutdown.modelMetrics) {
      models.add(mm.model);
    }
  }
  return [...models];
}

function getSessionTokenTotals(session: Session): { totalInput: number; totalOutput: number } {
  if (session.shutdown) {
    let totalInput = 0;
    let totalOutput = 0;
    for (const mm of session.shutdown.modelMetrics) {
      totalInput += mm.inputTokens;
      totalOutput += mm.outputTokens;
    }
    return { totalInput, totalOutput };
  }
  // Fallback: sum from assistant messages
  let totalInput = 0;
  let totalOutput = 0;
  for (const msg of session.assistantMessages) {
    totalInput += msg.inputTokens;
    totalOutput += msg.outputTokens;
  }
  return { totalInput, totalOutput };
}

function accumulateModel(
  map: Map<string, MutableModelRollup>,
  model: string,
  metrics: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
  _costSignal: undefined | null,
): void {
  let entry = map.get(model);
  if (!entry) {
    entry = {
      model,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      sessionIds: new Set(),
    };
    map.set(model, entry);
  }
  entry.totalInputTokens += metrics.inputTokens;
  entry.totalOutputTokens += metrics.outputTokens;
  entry.totalCacheReadTokens += metrics.cacheReadTokens;
  entry.totalCacheWriteTokens += metrics.cacheWriteTokens;
}

function accumulateTool(
  map: Map<string, MutableToolSummary>,
  tc: { toolName: string; durationMs: number | null; success: boolean | null; model: string | null },
): void {
  let entry = map.get(tc.toolName);
  if (!entry) {
    entry = {
      toolName: tc.toolName,
      callCount: 0,
      totalDurationMs: 0,
      successCount: 0,
      failureCount: 0,
      models: new Set(),
    };
    map.set(tc.toolName, entry);
  }
  entry.callCount += 1;
  entry.totalDurationMs += tc.durationMs ?? 0;
  if (tc.success === true) entry.successCount += 1;
  if (tc.success === false) entry.failureCount += 1;
  if (tc.model) entry.models.add(tc.model);
}

/**
 * Build final ModelUsageRollup array with per-model cost.
 *
 * Per-model cost is computed by summing session costs proportionally to the
 * model's token share within each session. If no cost calculator is provided,
 * all costs are null.
 */
function buildModelUsage(
  modelMap: Map<string, MutableModelRollup>,
  entries: readonly AggregationEntry[],
  calculateCost: CostCalculator | undefined,
): ModelUsageRollup[] {
  // Count sessions per model
  const modelSessionCount = new Map<string, Set<string>>();
  for (const entry of entries) {
    const { session } = entry;
    if (session.shutdown) {
      for (const mm of session.shutdown.modelMetrics) {
        let set = modelSessionCount.get(mm.model);
        if (!set) {
          set = new Set();
          modelSessionCount.set(mm.model, set);
        }
        set.add(session.sessionId);
      }
    }
  }

  // Per-model cost: sum proportional cost from each session
  const modelCosts = new Map<string, number | null>();
  if (calculateCost) {
    for (const entry of entries) {
      const { session } = entry;
      const sessionCost = calculateCost(session);
      if (sessionCost === null) {
        // Mark all models from this session as null-cost
        if (session.shutdown) {
          for (const mm of session.shutdown.modelMetrics) {
            modelCosts.set(mm.model, null);
          }
        }
        continue;
      }
      if (session.shutdown && session.shutdown.modelMetrics.length > 0) {
        // Distribute session cost proportionally to total tokens per model
        const totalTokens = session.shutdown.modelMetrics.reduce(
          (sum, mm) => sum + mm.inputTokens + mm.outputTokens + mm.cacheReadTokens + mm.cacheWriteTokens,
          0,
        );
        for (const mm of session.shutdown.modelMetrics) {
          const modelTokens = mm.inputTokens + mm.outputTokens + mm.cacheReadTokens + mm.cacheWriteTokens;
          const share = totalTokens > 0 ? modelTokens / totalTokens : 0;
          const existing = modelCosts.get(mm.model);
          if (existing === null) continue; // already marked unknown
          modelCosts.set(mm.model, (existing ?? 0) + sessionCost * share);
        }
      }
    }
  }

  const result: ModelUsageRollup[] = [];
  for (const [model, entry] of modelMap) {
    const sessionCount = modelSessionCount.get(model)?.size ?? 0;
    const cost = calculateCost ? (modelCosts.get(model) ?? null) : null;
    result.push({
      model: entry.model,
      totalInputTokens: entry.totalInputTokens,
      totalOutputTokens: entry.totalOutputTokens,
      totalCacheReadTokens: entry.totalCacheReadTokens,
      totalCacheWriteTokens: entry.totalCacheWriteTokens,
      totalCost: cost,
      sessionCount,
    });
  }

  return result;
}

function buildToolUsage(toolMap: Map<string, MutableToolSummary>): ToolUsageSummary[] {
  const result: ToolUsageSummary[] = [];
  for (const entry of toolMap.values()) {
    result.push({
      toolName: entry.toolName,
      callCount: entry.callCount,
      totalDurationMs: entry.totalDurationMs,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      models: [...entry.models],
    });
  }
  return result;
}
