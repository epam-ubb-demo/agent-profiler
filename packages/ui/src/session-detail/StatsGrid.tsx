/**
 * Stats grid — renders a CSS Grid of 11 KPI stat cards for a session.
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import type { SessionStats, StatEntry } from './session-stats';

/** Props for the {@link StatsGrid} component. */
export interface StatsGridProps {
  readonly stats: SessionStats;
}

/**
 * Ordered keys matching the mock-up layout:
 *
 * Row 1: Duration | Tool calls | Assistant msgs | Turns | Compactions | Sub-agent fan-outs
 * Row 2: Estimated cost | Avg tokens/tool call | Premium requests | API time | Task success
 */
const STAT_ORDER: readonly (keyof SessionStats)[] = [
  'duration',
  'toolCallCount',
  'assistantMessageCount',
  'turnCount',
  'compactionCount',
  'subagentCount',
  'estimatedCost',
  'avgTokensPerToolCall',
  'premiumRequests',
  'apiTime',
  'taskSuccess',
] as const;

function StatsGridInner({ stats }: StatsGridProps) {
  return (
    <div className={styles.statsGrid}>
      {STAT_ORDER.map((key) => {
        const stat: StatEntry = stats[key];
        const cardClass = stat.pending
          ? `${styles.statCard} ${styles.statCardPending}`
          : styles.statCard;
        return (
          <div className={cardClass} key={key} data-testid={`stat-${key}`}>
            <div className={styles.statValue}>{stat.display}</div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** KPI stat-card grid for the session detail view. */
export const StatsGrid = memo(StatsGridInner);
StatsGrid.displayName = 'StatsGrid';
