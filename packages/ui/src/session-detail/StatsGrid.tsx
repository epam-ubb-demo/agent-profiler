/**
 * Stats grid — renders a CSS Grid of 5 supplementary KPI stat cards for a
 * session (the 6 primary stats already appear in the compact header strip).
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import type { SessionStats, StatEntry } from './session-stats';

/** Props for the {@link StatsGrid} component. */
export interface StatsGridProps {
  readonly stats: SessionStats;
}

/**
 * Ordered keys for the supplementary stats not shown in the compact
 * header strip: Assistant msgs | Compactions | Avg tokens/tool call |
 * Premium requests | API time
 */
const STAT_ORDER: readonly (keyof SessionStats)[] = [
  'assistantMessageCount',
  'compactionCount',
  'avgTokensPerToolCall',
  'premiumRequests',
  'apiTime',
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
