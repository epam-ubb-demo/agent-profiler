/**
 * Pure-function utilities for computing per-tool token consumption
 * and call frequency statistics from a Session.
 *
 * Token attribution distributes each turn's total output tokens evenly
 * across the tool calls within that turn. Turns with no tool calls
 * contribute tokens to the overall total but are not attributed to any tool.
 */

import type { Session, Turn } from '@agent-profiler/core';

/* ------------------------------------------------------------------ */
/*  Public interfaces                                                  */
/* ------------------------------------------------------------------ */

/** Per-tool token consumption row. */
export interface ToolTokenRow {
  /** Tool name. */
  readonly tool: string;
  /** Unique model names observed for calls to this tool. */
  readonly models: readonly string[];
  /** Total number of calls to this tool. */
  readonly callCount: number;
  /** Attributed output tokens across all calls. */
  readonly totalTokens: number;
  /** Average attributed output tokens per call. */
  readonly avgTokensPerCall: number;
  /** Estimated total USD cost (placeholder — always null). */
  readonly totalUsd: number | null;
  /** Estimated average USD cost per call (placeholder — always null). */
  readonly avgUsdPerCall: number | null;
  /** Proportion of totalTokens relative to the highest-consuming tool (0–1, for bar width). */
  readonly proportion: number;
}

/** Per-tool call frequency row. */
export interface ToolFrequencyRow {
  /** Tool name. */
  readonly tool: string;
  /** Total number of calls. */
  readonly callCount: number;
  /** Proportion of callCount relative to the most-called tool (0–1, for bar width). */
  readonly proportion: number;
}

/** Aggregated result returned by {@link computeToolStats}. */
export interface ToolStatsResult {
  /** Token consumption rows sorted by totalTokens descending. */
  readonly tokenStats: readonly ToolTokenRow[];
  /** Frequency rows sorted by callCount descending (top 15). */
  readonly frequencyStats: readonly ToolFrequencyRow[];
  /** Grand totals across all tool token rows. */
  readonly tokenTotals: {
    readonly callCount: number;
    readonly totalTokens: number;
    readonly totalUsd: number | null;
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Maximum number of tools to include in the frequency chart. */
const TOP_FREQUENCY_LIMIT = 15;

/** Mutable accumulator used during the grouping phase. */
interface ToolAccumulator {
  tokens: number;
  callCount: number;
  models: Set<string>;
}

/**
 * Computes the total output tokens for a turn by summing its assistant
 * messages' `outputTokens` values.
 */
function turnOutputTokens(turn: Turn): number {
  let total = 0;
  for (const msg of turn.assistantMessages) {
    total += msg.outputTokens;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/*  Main computation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Computes per-tool token attribution and call frequency statistics
 * for a given session.
 *
 * @param session - The session to analyse.
 * @returns Aggregated token and frequency statistics.
 */
export function computeToolStats(session: Session): ToolStatsResult {
  /* ---- Phase 1: attribute tokens per tool via turns ---- */
  const accumulators = new Map<string, ToolAccumulator>();

  for (const turn of session.turns) {
    const toolCalls = turn.toolCalls;
    const totalTokens = turnOutputTokens(turn);

    if (toolCalls.length === 0) {
      // Tokens from turns with no tool calls are not attributed.
      continue;
    }

    const tokensPerTool = totalTokens / toolCalls.length;

    for (const tc of toolCalls) {
      let acc = accumulators.get(tc.toolName);
      if (!acc) {
        acc = { tokens: 0, callCount: 0, models: new Set<string>() };
        accumulators.set(tc.toolName, acc);
      }
      acc.tokens += tokensPerTool;
      acc.callCount += 1;
      if (tc.model !== null) {
        acc.models.add(tc.model);
      }
    }
  }

  // Fallback for enrichment sessions where turns are absent but toolCalls exist.
  // Populate accumulators with zero token attribution so call counts are still
  // surfaced in the UI.
  if (accumulators.size === 0 && session.toolCalls.length > 0) {
    for (const tc of session.toolCalls) {
      let acc = accumulators.get(tc.toolName);
      if (!acc) {
        acc = { tokens: 0, callCount: 0, models: new Set<string>() };
        accumulators.set(tc.toolName, acc);
      }
      acc.callCount += 1;
      if (tc.model !== null) {
        acc.models.add(tc.model);
      }
    }
  }

  /* ---- Phase 2: build sorted token rows ---- */
  const unsortedRows: Omit<ToolTokenRow, 'proportion'>[] = [];
  for (const [tool, acc] of accumulators) {
    unsortedRows.push({
      tool,
      models: [...acc.models].sort(),
      callCount: acc.callCount,
      totalTokens: Math.round(acc.tokens),
      avgTokensPerCall: acc.callCount > 0 ? Math.round(acc.tokens / acc.callCount) : 0,
      totalUsd: null,
      avgUsdPerCall: null,
    });
  }

  unsortedRows.sort((a, b) => b.totalTokens - a.totalTokens);

  const firstRow = unsortedRows[0] as (typeof unsortedRows)[number] | undefined;
  const maxTokens = firstRow?.totalTokens ?? 1;

  const tokenStats: ToolTokenRow[] = unsortedRows.map((row) => ({
    ...row,
    proportion: maxTokens > 0 ? row.totalTokens / maxTokens : 0,
  }));

  /* ---- Phase 3: frequency stats from all tool calls ---- */
  const freqMap = new Map<string, number>();
  for (const tc of session.toolCalls) {
    freqMap.set(tc.toolName, (freqMap.get(tc.toolName) ?? 0) + 1);
  }

  const freqEntries = [...freqMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_FREQUENCY_LIMIT);

  const firstFreq = freqEntries[0] as (typeof freqEntries)[number] | undefined;
  const maxCount = firstFreq?.[1] ?? 1;

  const frequencyStats: ToolFrequencyRow[] = freqEntries.map(([tool, callCount]) => ({
    tool,
    callCount,
    proportion: maxCount > 0 ? callCount / maxCount : 0,
  }));

  /* ---- Phase 4: totals ---- */
  let totalCallCount = 0;
  let totalTokensSum = 0;
  for (const row of tokenStats) {
    totalCallCount += row.callCount;
    totalTokensSum += row.totalTokens;
  }

  return {
    tokenStats,
    frequencyStats,
    tokenTotals: {
      callCount: totalCallCount,
      totalTokens: totalTokensSum,
      totalUsd: null,
    },
  };
}
