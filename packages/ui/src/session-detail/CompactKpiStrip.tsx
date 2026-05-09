/**
 * CompactKpiStrip — compact horizontal row of 6 key stats displayed
 * in the sticky header area. Applies severity colouring based on
 * stat thresholds.
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import type { SessionStats, StatEntry } from './session-stats';

/** Props for the {@link CompactKpiStrip} component. */
export interface CompactKpiStripProps {
  readonly stats: SessionStats;
}

/** Keys of the 6 stats shown in the compact strip, in display order. */
const COMPACT_STAT_KEYS: readonly (keyof SessionStats)[] = [
  'estimatedCost',
  'turnCount',
  'duration',
  'subagentCount',
  'toolCallCount',
  'taskSuccess',
] as const;

/**
 * Derive the severity CSS class for a given stat entry.
 * Returns the appropriate severity modifier or an empty string.
 */
function severityClass(key: keyof SessionStats, stat: StatEntry): string {
  if (stat.pending) return styles['statCardPending'];

  switch (key) {
    case 'estimatedCost': {
      const v = stat.value;
      if (v !== null && v > 20) return styles['statCardCritical'];
      if (v !== null && v > 5) return styles['statCardWarning'];
      return '';
    }
    case 'taskSuccess': {
      /* value 0 means task failed */
      if (stat.value === 0) return styles['statCardCritical'];
      return '';
    }
    case 'compactionCount': {
      if (stat.value !== null && stat.value > 5) return styles['statCardWarning'];
      return '';
    }
    default:
      return '';
  }
}

function CompactKpiStripInner({ stats }: CompactKpiStripProps) {
  return (
    <div className={styles['compactKpiStrip']} data-testid="compact-kpi-strip">
      {COMPACT_STAT_KEYS.map((key) => {
        const stat: StatEntry = stats[key];
        const severity = severityClass(key, stat);
        const cardClass = severity
          ? `${styles['compactStatCard']} ${severity}`
          : styles['compactStatCard'];

        return (
          <div className={cardClass} key={key} data-testid={`compact-stat-${key}`}>
            <div className={styles['compactStatValue']}>{stat.display}</div>
            <div className={styles['compactStatLabel']}>{stat.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact KPI strip for the sticky header area. */
export const CompactKpiStrip = memo(CompactKpiStripInner);
CompactKpiStrip.displayName = 'CompactKpiStrip';
