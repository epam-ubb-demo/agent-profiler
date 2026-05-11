/**
 * Pure-function utility that counts event types observed in a session.
 */

import type { Session } from '@agent-profiler/core';

/** A single row summarising the count for one event type. */
export interface EventTypeRow {
  readonly type: string;
  readonly count: number;
}

/**
 * Count each event category present in {@link Session} and return the
 * non-zero counts sorted by descending frequency.
 *
 * Rows with a zero count are excluded so consumers can render the result
 * directly without additional filtering.
 */
export function computeEventTypeStats(
  session: Session,
): readonly EventTypeRow[] {
  const rows: EventTypeRow[] = [
    { type: 'Tool calls', count: session.toolCalls.length },
    { type: 'Assistant messages', count: session.assistantMessages.length },
    { type: 'User messages', count: session.userMessages.length },
    { type: 'Compactions', count: session.compactions.length },
    { type: 'Sub-agent invocations', count: session.subagents.length },
    { type: 'Model changes', count: session.modelChanges.length },
  ];

  return rows
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}
