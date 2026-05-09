/**
 * Hot-consumption ranking utility.
 *
 * Ranks all turns, sub-agents, and (optionally) compactions by total token
 * count to produce the data backing the "Hottest token consumption points"
 * table. Every function in this module is pure — no side-effects.
 */

import type {
  Compaction,
  Session,
  SubagentInvocation,
  Turn,
} from '@agent-profiler/core';
import { DEFAULT_PRICING_TABLE } from '@agent-profiler/pricing';

import { formatDuration, formatTokenCount } from '../comparative/format';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Discriminator for the kind of entry in the ranking. */
export type HotConsumptionType = 'turn' | 'sub-agent' | 'compaction';

/** A single row in the hot-consumption table. */
export interface HotConsumptionEntry {
  /** 1-based rank after sorting by tokens descending. */
  readonly rank: number;
  /** Timestamp of the event (ISO-8601 or null). */
  readonly time: string | null;
  /** Category of event that produced this consumption. */
  readonly type: HotConsumptionType;
  /** Human-readable location, e.g. "Turn #3" or "Sub-agent: task". */
  readonly where: string;
  /** Model used for the event, if known. */
  readonly model: string | null;
  /** Total token count across all buckets for this event. */
  readonly tokens: number;
  /** Estimated cost in USD — null when cost data is unavailable. */
  readonly estimatedUsd: number | null;
  /** Proportion of tokens relative to the highest entry (0–1, for bar width). */
  readonly proportion: number;
  /** Brief human-readable summary of the event's contents. */
  readonly detail: string;
  /** Child session reference for sub-agent entries (null otherwise). */
  readonly childSessionRef: string | null;
}

/** Aggregated result returned by {@link computeHotConsumption}. */
export interface HotConsumptionResult {
  /** Ranked entries, sliced to the requested limit. */
  readonly entries: readonly HotConsumptionEntry[];
  /** Total number of candidate entries before slicing. */
  readonly totalEntries: number;
  /** Sum of tokens across *all* candidate entries (not just top-N). */
  readonly totalTokens: number;
  /** Sum of tokens across the returned (top-N) entries only. */
  readonly topNTokens: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options accepted by {@link computeHotConsumption}. */
export interface HotConsumptionOptions {
  /** Include compaction events in the ranking. Defaults to `false`. */
  readonly includeCompactions?: boolean;
  /** Maximum number of entries to return. Defaults to `15`. */
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Intermediate representation shared across all entry kinds before final
 * ranking and proportion calculation.
 */
interface RawEntry {
  readonly time: string | null;
  readonly type: HotConsumptionType;
  readonly where: string;
  readonly model: string | null;
  readonly tokens: number;
  readonly estimatedUsd: number | null;
  readonly detail: string;
  readonly childSessionRef: string | null;
}

/** Estimate USD cost from token counts and model name using the pricing table. */
function estimateCostUsd(
  model: string | null,
  output: number,
  input: number,
  cacheRead: number,
  cacheWrite: number,
): number | null {
  if (!model) return null;
  const rates = DEFAULT_PRICING_TABLE[model];
  if (!rates) return null;
  return (
    (output * rates.output +
      Math.max(0, input - cacheRead) * rates.input +
      cacheRead * rates.cacheRead +
      cacheWrite * rates.cacheWrite) /
    1_000_000
  );
}

/** Compute total tokens for a single turn across all assistant messages. */
function turnTokens(turn: Turn): number {
  let total = 0;
  for (const m of turn.assistantMessages) {
    total += m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheWriteTokens;
  }
  return total;
}

/** Compute duration in ms between two ISO timestamps, or `null`. */
function durationMs(startTs: string | null, endTs: string | null): number | null {
  if (!startTs || !endTs) return null;
  const start = new Date(startTs).getTime();
  const end = new Date(endTs).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  const diff = end - start;
  return diff >= 0 ? diff : null;
}

/** Build a detail string for a turn entry. */
function turnDetail(turn: Turn): string {
  const parts: string[] = [];

  const toolCount = turn.toolCalls.length;
  parts.push(`${String(toolCount)} tool${toolCount !== 1 ? 's' : ''}`);

  const subCount = turn.subagents.length;
  if (subCount > 0) {
    let subTokens = 0;
    for (const s of turn.subagents) {
      subTokens += s.totalTokens;
    }
    parts.push(
      `${String(subCount)} sub-agent${subCount !== 1 ? 's' : ''} (${formatTokenCount(subTokens)} tok)`,
    );
  }

  const dur = durationMs(turn.startTs, turn.endTs);
  if (dur !== null) {
    parts.push(formatDuration(dur));
  }

  return parts.join(' · ');
}

/** Build a detail string for a sub-agent entry. */
function subagentDetail(sub: SubagentInvocation): string {
  return `${String(sub.messageCount)} message${sub.messageCount !== 1 ? 's' : ''} · ${String(sub.toolCallCount)} tool${sub.toolCallCount !== 1 ? 's' : ''}`;
}

/** Build a detail string for a compaction entry. */
function compactionDetail(c: Compaction): string {
  const parts = [
    `in ${formatTokenCount(c.inputTokens)}`,
    `out ${formatTokenCount(c.outputTokens)}`,
    `cacheR ${formatTokenCount(c.cacheRead)}`,
    `cacheW ${formatTokenCount(c.cacheWrite)}`,
  ];
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rank all turns, sub-agents, and (optionally) compactions by total token
 * consumption.
 *
 * The returned entries are sorted by tokens descending, assigned ranks
 * starting at 1, and sliced to the requested limit. The `proportion` field
 * is relative to the entry with the highest token count so it can drive a
 * proportional bar in the UI.
 *
 * @param session - The parsed session to analyse.
 * @param options - Optional behaviour overrides.
 * @returns A {@link HotConsumptionResult} with the ranked entries and totals.
 */
export function computeHotConsumption(
  session: Session,
  options?: HotConsumptionOptions,
): HotConsumptionResult {
  const includeCompactions = options?.includeCompactions ?? false;
  const limit = options?.limit ?? 15;

  const raw: RawEntry[] = [];

  // --- Turns ---
  for (const turn of session.turns) {
    const tokens = turnTokens(turn);
    const model = turn.assistantMessages.length > 0
      ? (turn.assistantMessages[0]?.model ?? null)
      : null;

    // Aggregate per-bucket token totals for cost estimation.
    let outTok = 0;
    let inTok = 0;
    let cacheRdTok = 0;
    let cacheWrTok = 0;
    for (const m of turn.assistantMessages) {
      outTok += m.outputTokens;
      inTok += m.inputTokens;
      cacheRdTok += m.cacheReadTokens;
      cacheWrTok += m.cacheWriteTokens;
    }

    raw.push({
      time: turn.startTs,
      type: 'turn',
      where: `Turn #${turn.turnId}`,
      model,
      tokens,
      estimatedUsd: estimateCostUsd(model, outTok, inTok, cacheRdTok, cacheWrTok),
      detail: turnDetail(turn),
      childSessionRef: null,
    });
  }

  // --- Sub-agents ---
  for (const sub of session.subagents) {
    raw.push({
      time: sub.timestamp,
      type: 'sub-agent',
      where: `Sub-agent: ${sub.agentName}`,
      model: null,
      tokens: sub.totalTokens,
      estimatedUsd: null,
      detail: subagentDetail(sub),
      childSessionRef: sub.childSessionRef,
    });
  }

  // --- Compactions (opt-in) ---
  if (includeCompactions) {
    for (const c of session.compactions) {
      const tokens = c.inputTokens + c.outputTokens + c.cacheRead + c.cacheWrite;
      raw.push({
        time: c.timestamp,
        type: 'compaction',
        where: 'Compaction',
        model: c.model,
        tokens,
        estimatedUsd: estimateCostUsd(c.model, c.outputTokens, c.inputTokens, c.cacheRead, c.cacheWrite),
        detail: compactionDetail(c),
        childSessionRef: null,
      });
    }
  }

  // Sort descending by token count
  raw.sort((a, b) => b.tokens - a.tokens);

  const totalTokens = raw.reduce((sum, e) => sum + e.tokens, 0);
  const maxTokens = raw.length > 0 ? (raw[0]?.tokens ?? 1) : 1;

  const topN = raw.slice(0, limit);
  const topNTokens = topN.reduce((sum, e) => sum + e.tokens, 0);

  const entries: HotConsumptionEntry[] = topN.map((e, i) => ({
    rank: i + 1,
    time: e.time,
    type: e.type,
    where: e.where,
    model: e.model,
    tokens: e.tokens,
    estimatedUsd: e.estimatedUsd,
    proportion: maxTokens > 0 ? e.tokens / maxTokens : 0,
    detail: e.detail,
    childSessionRef: e.childSessionRef,
  }));

  return {
    entries,
    totalEntries: raw.length,
    totalTokens,
    topNTokens,
  };
}
