/**
 * Aggregates skill-invocation data from a session's toolCalls.
 *
 * Skills are `toolName === 'skill'` entries. Skill metadata is extracted by
 * the adapter parser from the `toolTelemetry` block on `tool.execution_complete`
 * events. For sessions parsed before that change, a fallback parses the
 * `argumentsPreview` JSON for the `skill` key.
 */

import type { Session, ToolCall } from '@agent-profiler/core';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Aggregated stats for a single skill across all its invocations. */
export interface SkillRow {
  readonly skillName: string;
  readonly callCount: number;
  /** Primary source category (most common observed, or null if unknown). */
  readonly source: string | null;
  /** Average characters of skill content loaded per invocation, or null if not recorded. */
  readonly avgContentLength: number | null;
  readonly totalDurationMs: number;
  readonly avgDurationMs: number | null;
  /** Fraction of total skill invocations attributed to this skill. */
  readonly proportion: number;
  /** Most common resolution outcome for this skill across its invocations. */
  readonly outcome: 'loaded' | 'not_found' | 'disabled' | 'read_error';
  /** Error message from the most recent read_error invocation, if any. */
  readonly skillErrorMessage?: string | null;
}

/** Aggregated skill stats for a full session. */
export interface SkillStatsResult {
  readonly rows: readonly SkillRow[];
  readonly totalInvocations: number;
  readonly uniqueSkills: number;
  /** Total characters of skill content loaded across all invocations. */
  readonly totalContentLength: number;
  /** Invocations grouped by skillSource, sorted by count descending. */
  readonly sourceBreakdown: readonly { readonly source: string; readonly count: number }[];
  /** Invocations grouped by skillOutcome, sorted by count descending. */
  readonly outcomeBreakdown: readonly { readonly outcome: string; readonly count: number }[];
  /** Count of invocations where the outcome is not 'loaded' (failed skill loads). */
  readonly failedInvocations: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolves the skill name from telemetry or falls back to `argumentsPreview` JSON. */
function resolveSkillName(tc: ToolCall): string {
  if (tc.skillName) return tc.skillName;
  if (tc.argumentsPreview) {
    try {
      const args = JSON.parse(tc.argumentsPreview) as Record<string, unknown>;
      if (typeof args['skill'] === 'string' && args['skill'].length > 0) {
        return args['skill'];
      }
    } catch {
      // ignore parse errors
    }
  }
  return '(unknown)';
}

/* ------------------------------------------------------------------ */
/*  Computation                                                        */
/* ------------------------------------------------------------------ */

/** Aggregates all `toolName === 'skill'` tool calls in the session. */
export function computeSkillStats(session: Session): SkillStatsResult {
  const skillCalls = session.toolCalls.filter((tc) => tc.toolName === 'skill');

  if (skillCalls.length === 0) {
    return { rows: [], totalInvocations: 0, uniqueSkills: 0, totalContentLength: 0, sourceBreakdown: [], outcomeBreakdown: [], failedInvocations: 0 };
  }

  const bySkill = new Map<
    string,
    {
      callCount: number;
      sourceCounts: Map<string, number>;
      outcomeCounts: Map<string, number>;
      contentLengths: number[];
      durations: number[];
      lastErrorMessage: string | null;
    }
  >();
  const sourceTotals = new Map<string, number>();
  const outcomeTotals = new Map<string, number>();
  let totalContentLength = 0;
  let failedInvocations = 0;

  for (const tc of skillCalls) {
    const name = resolveSkillName(tc);
    const src = tc.skillSource ?? null;
    // For sessions parsed before outcome tracking, default to 'loaded'
    const outcome: 'loaded' | 'not_found' | 'disabled' | 'read_error' =
      (tc.skillOutcome ?? 'loaded') as 'loaded' | 'not_found' | 'disabled' | 'read_error';

    if (src) {
      sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + 1);
    }
    outcomeTotals.set(outcome, (outcomeTotals.get(outcome) ?? 0) + 1);
    if (outcome !== 'loaded') {
      failedInvocations++;
    }
    if (tc.skillContentLength != null) {
      totalContentLength += tc.skillContentLength;
    }

    const entry = bySkill.get(name);
    if (!entry) {
      bySkill.set(name, {
        callCount: 1,
        sourceCounts: new Map(src ? [[src, 1]] : []),
        outcomeCounts: new Map([[outcome, 1]]),
        contentLengths: tc.skillContentLength != null ? [tc.skillContentLength] : [],
        durations: tc.durationMs != null ? [tc.durationMs] : [],
        lastErrorMessage: outcome === 'read_error' ? (tc.skillErrorMessage ?? null) : null,
      });
    } else {
      entry.callCount++;
      if (src) entry.sourceCounts.set(src, (entry.sourceCounts.get(src) ?? 0) + 1);
      entry.outcomeCounts.set(outcome, (entry.outcomeCounts.get(outcome) ?? 0) + 1);
      if (tc.skillContentLength != null) entry.contentLengths.push(tc.skillContentLength);
      if (tc.durationMs != null) entry.durations.push(tc.durationMs);
      if (outcome === 'read_error' && tc.skillErrorMessage) {
        entry.lastErrorMessage = tc.skillErrorMessage;
      }
    }
  }

  const total = skillCalls.length;
  const rows: SkillRow[] = [];

  for (const [skillName, entry] of bySkill) {
    let topSource: string | null = null;
    let topCount = 0;
    for (const [s, c] of entry.sourceCounts) {
      if (c > topCount) { topSource = s; topCount = c; }
    }

    let topOutcome: 'loaded' | 'not_found' | 'disabled' | 'read_error' = 'loaded';
    let topOutcomeCount = 0;
    for (const [o, c] of entry.outcomeCounts) {
      if (c > topOutcomeCount) {
        topOutcome = o as 'loaded' | 'not_found' | 'disabled' | 'read_error';
        topOutcomeCount = c;
      }
    }

    const avgContentLength =
      entry.contentLengths.length > 0
        ? Math.round(entry.contentLengths.reduce((s, v) => s + v, 0) / entry.contentLengths.length)
        : null;
    const totalDurationMs = entry.durations.reduce((s, v) => s + v, 0);
    const avgDurationMs =
      entry.durations.length > 0 ? Math.round(totalDurationMs / entry.durations.length) : null;

    const rowBase = {
      skillName,
      callCount: entry.callCount,
      source: topSource,
      avgContentLength,
      totalDurationMs,
      avgDurationMs,
      proportion: entry.callCount / total,
      outcome: topOutcome,
    };

    rows.push(
      entry.lastErrorMessage !== null
        ? { ...rowBase, skillErrorMessage: entry.lastErrorMessage }
        : rowBase,
    );
  }

  rows.sort((a, b) => b.callCount - a.callCount);

  const sourceBreakdown = [...sourceTotals.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const outcomeBreakdown = [...outcomeTotals.entries()]
    .map(([outcome, count]) => ({ outcome, count }))
    .sort((a, b) => b.count - a.count);

  return { rows, totalInvocations: total, uniqueSkills: bySkill.size, totalContentLength, sourceBreakdown, outcomeBreakdown, failedInvocations };
}
