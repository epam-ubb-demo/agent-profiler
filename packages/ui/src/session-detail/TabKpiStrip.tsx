/**
 * TabKpiStrip — generic compact KPI strip for tab content panels.
 *
 * Renders a horizontal row of stat cards reusing the same CSS classes
 * as {@link CompactKpiStrip}. Accepts an optional severity function
 * to apply conditional colouring per card.
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabKpiStrip} component. */
export interface TabKpiStripProps {
  readonly stats: readonly StatEntry[];
  readonly severityFn?: ((index: number, stat: StatEntry) => string) | undefined;
  readonly testIdPrefix?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabKpiStripInner({ stats, severityFn, testIdPrefix }: TabKpiStripProps) {
  return (
    <div className={styles['compactKpiStrip']} data-testid={testIdPrefix ? `${testIdPrefix}-strip` : 'tab-kpi-strip'}>
      {stats.map((stat, index) => {
        const severity = severityFn ? severityFn(index, stat) : '';
        const cardClass = severity
          ? `${styles['compactStatCard']} ${severity}`
          : styles['compactStatCard'];

        return (
          <div
            className={cardClass}
            key={stat.label}
            {...(testIdPrefix ? { 'data-testid': `${testIdPrefix}-${index}` } : {})}
          >
            <div className={styles['compactStatValue']}>{stat.display}</div>
            <div className={styles['compactStatLabel']}>{stat.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Generic tab-level KPI strip. */
export const TabKpiStrip = memo(TabKpiStripInner);
TabKpiStrip.displayName = 'TabKpiStrip';
