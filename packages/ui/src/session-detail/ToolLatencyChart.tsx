/**
 * ToolLatencyChart — horizontal bar chart showing the top 10 slowest individual tool calls.
 *
 * Each bar shows a single tool call with its tool name and turn label.
 * This helps users identify which specific tool invocations took the most time.
 */

import type { Turn } from '@agent-profiler/core';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';

/* ─── Constants ──────────────────────────────────────────────────── */

const MAX_ROWS = 10;
const BAR_COLOUR = 'var(--uui-primary-50)';

/* ─── Props ──────────────────────────────────────────────────────── */

export interface ToolLatencyChartProps {
  readonly turns: readonly Turn[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

/* ─── Component ──────────────────────────────────────────────────── */

export const ToolLatencyChart = memo(function ToolLatencyChart({
  turns,
}: ToolLatencyChartProps) {
  const rows = useMemo(() => {
    const calls: Array<{ tool: string; turnIndex: number; durationMs: number }> = [];

    for (let i = 0; i < turns.length; i++) {
      const t = turns[i]!;
      for (const tc of t.toolCalls) {
        if (tc.durationMs != null && tc.durationMs > 0) {
          calls.push({
            tool: tc.toolName,
            turnIndex: i + 1,
            durationMs: tc.durationMs,
          });
        }
      }
    }

    return calls
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, MAX_ROWS);
  }, [turns]);

  const maxMs = rows.length > 0 ? rows[0]!.durationMs : 0;

  if (rows.length === 0) {
    return (
      <div className={styles['turnsBarChart']}>
        <p style={{ color: '#6b7280', fontSize: '0.8125rem', textAlign: 'center' }}>
          No tool latency data available
        </p>
      </div>
    );
  }

  return (
    <div className={styles['turnsBarChart']}>
      {rows.map((row, i) => {
        const pct = (row.durationMs / maxMs) * 100;
        return (
          <div key={i} className={styles['turnsBarRow']}>
            <span className={styles['turnsBarLabel']} title={row.tool}>
              {row.tool.length > 8 ? `${row.tool.slice(0, 7)}…` : row.tool}
            </span>
            <div className={styles['turnsBarTrack']}>
              <div
                className={styles['turnsBarFill']}
                style={{ width: `${pct}%`, background: BAR_COLOUR }}
              />
            </div>
            <span className={styles['turnsBarValue']}>
              {formatMs(row.durationMs)} <span style={{ color: '#9ca3af', fontSize: '0.625rem' }}>T{row.turnIndex}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
});
ToolLatencyChart.displayName = 'ToolLatencyChart';
