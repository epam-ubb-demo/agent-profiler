/**
 * TurnDurationChart — horizontal bar chart showing wall-clock duration per turn.
 *
 * Highlights outliers (> 2× median, minimum 30 s, at least 5 turns)
 * in a warning colour to help users spot expensive turns at a glance.
 * Displays top 15 turns sorted by duration descending.
 */

import type { Turn } from '@agent-profiler/core';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';

/* ─── Constants ──────────────────────────────────────────────────── */

const MAX_ROWS = 15;
const BAR_COLOUR = 'var(--uui-info-50)';
const OUTLIER_COLOUR = 'var(--uui-warning-50)';
const MIN_OUTLIER_SECONDS = 30;
const MIN_TURNS_FOR_OUTLIER = 5;

/* ─── Props ──────────────────────────────────────────────────────── */

export interface TurnDurationChartProps {
  readonly turns: readonly Turn[];
}

/* ─── Component ──────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  return `${seconds.toFixed(0)}s`;
}

export const TurnDurationChart = memo(function TurnDurationChart({
  turns,
}: TurnDurationChartProps) {
  const { rows, maxDuration, outlierThreshold } = useMemo(() => {
    const durations = turns.map((t, i) => {
      if (!t.startTs || !t.endTs) return { index: i + 1, seconds: 0 };
      const s = (new Date(t.endTs).getTime() - new Date(t.startTs).getTime()) / 1000;
      return { index: i + 1, seconds: Math.max(0, s) };
    }).filter((d) => d.seconds > 0);

    // Calculate outlier threshold
    let threshold = Infinity;
    if (durations.length >= MIN_TURNS_FOR_OUTLIER) {
      const sorted = [...durations].sort((a, b) => a.seconds - b.seconds);
      const median = sorted[Math.floor(sorted.length / 2)]!.seconds;
      threshold = Math.max(MIN_OUTLIER_SECONDS, median * 2);
    }

    const sorted = [...durations].sort((a, b) => b.seconds - a.seconds).slice(0, MAX_ROWS);
    const max = sorted.length > 0 ? sorted[0]!.seconds : 1;

    return { rows: sorted, maxDuration: max, outlierThreshold: threshold };
  }, [turns]);

  if (rows.length === 0) {
    return (
      <div className={styles['turnsBarChart']}>
        <p style={{ color: '#6b7280', fontSize: '0.8125rem', textAlign: 'center' }}>
          No turn durations available
        </p>
      </div>
    );
  }

  return (
    <div className={styles['turnsBarChart']}>
      {rows.map((row) => {
        const pct = (row.seconds / maxDuration) * 100;
        const isOutlier = row.seconds >= outlierThreshold;
        return (
          <div key={row.index} className={styles['turnsBarRow']}>
            <span className={styles['turnsBarLabel']}>T{row.index}</span>
            <div className={styles['turnsBarTrack']}>
              <div
                className={styles['turnsBarFill']}
                style={{
                  width: `${pct}%`,
                  background: isOutlier ? OUTLIER_COLOUR : BAR_COLOUR,
                }}
              />
            </div>
            <span className={styles['turnsBarValue']}>{formatDuration(row.seconds)}</span>
          </div>
        );
      })}
    </div>
  );
});
TurnDurationChart.displayName = 'TurnDurationChart';
