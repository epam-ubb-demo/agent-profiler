/**
 * Pure compute function for the Timeline tab KPI strip.
 *
 * Derives 5 stat entries from session timing data.
 */

import type { Session } from '@agent-profiler/core';

import { formatDuration } from '../comparative/format';

import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';

/**
 * Compute the 5 KPI stats shown at the top of the Timeline tab.
 *
 * | # | Label       | Source                                     |
 * |---|-------------|-------------------------------------------|
 * | 0 | Turns       | session.turns.length                       |
 * | 1 | Duration    | wall-clock ms                              |
 * | 2 | Compactions | session.compactions.length                  |
 * | 3 | Fan-outs    | session.fanoutTurns.length                  |
 * | 4 | Avg Turn    | durationMs / turns.length                   |
 */
export function computeTimelineKpis(
  session: Session,
  isLive: boolean,
): readonly StatEntry[] {
  /* 0 — Turns */
  const turns: StatEntry = {
    value: session.turns.length,
    display: String(session.turns.length),
    label: 'Turns',
  };

  /* 1 — Duration */
  let durationMs: number | null = null;
  let durationPrefix = '';

  if (isLive && session.startTs !== null) {
    durationMs = Date.now() - new Date(session.startTs).getTime();
    durationPrefix = '~';
  } else if (session.startTs !== null && session.endTs !== null) {
    durationMs = new Date(session.endTs).getTime() - new Date(session.startTs).getTime();
  }

  const duration: StatEntry = {
    value: durationMs,
    display: durationMs !== null ? `${durationPrefix}${formatDuration(durationMs)}` : '—',
    label: 'Duration',
  };

  /* 2 — Compactions */
  const compactions: StatEntry = {
    value: session.compactions.length,
    display: String(session.compactions.length),
    label: 'Compactions',
  };

  /* 3 — Fan-outs */
  const fanouts: StatEntry = {
    value: session.fanoutTurns.length,
    display: String(session.fanoutTurns.length),
    label: 'Fan-outs',
  };

  /* 4 — Avg Turn */
  const avgMs = durationMs !== null && session.turns.length > 0
    ? durationMs / session.turns.length
    : null;
  const avgTurn: StatEntry = {
    value: avgMs,
    display: avgMs !== null ? formatDuration(avgMs) : '—',
    label: 'Avg Turn',
  };

  return [turns, duration, compactions, fanouts, avgTurn] as const;
}

/**
 * Severity function for timeline KPI strip cards.
 *
 * - Index 2 (Compactions): critical > 8, warning > 3.
 * - Index 4 (Avg Turn): warning > 120 000 ms (2 min).
 */
export function timelineKpiSeverity(_index: number, stat: StatEntry): string {
  switch (_index) {
    case 2: {
      const v = stat.value;
      if (v !== null && v > 8) return styles['statCardCritical'];
      if (v !== null && v > 3) return styles['statCardWarning'];
      return '';
    }
    case 4: {
      const v = stat.value;
      if (v !== null && v > 120000) return styles['statCardWarning'];
      return '';
    }
    default:
      return '';
  }
}
