/**
 * CostPerTurnChart — horizontal bar chart showing the top 15 most expensive turns by USD cost.
 *
 * Aggregates assistant messages by model per turn before pricing.
 * Distinct from TokensPerTurnChart because pricing/cache change rankings.
 */

import type { Turn } from '@agent-profiler/core';
import { calculateCost } from '@agent-profiler/pricing';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';

/* ─── Constants ──────────────────────────────────────────────────── */

const MAX_ROWS = 15;
const BAR_COLOUR = 'var(--uui-success-50)';

/* ─── Props ──────────────────────────────────────────────────────── */

export interface CostPerTurnChartProps {
  readonly turns: readonly Turn[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

function turnCost(turn: Turn): number {
  const byModel = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>();
  for (const msg of turn.assistantMessages) {
    const model = msg.model ?? 'unknown';
    const existing = byModel.get(model);
    if (existing) {
      existing.input += msg.inputTokens;
      existing.output += msg.outputTokens;
      existing.cacheRead += msg.cacheReadTokens;
      existing.cacheWrite += msg.cacheWriteTokens;
    } else {
      byModel.set(model, {
        input: msg.inputTokens,
        output: msg.outputTokens,
        cacheRead: msg.cacheReadTokens,
        cacheWrite: msg.cacheWriteTokens,
      });
    }
  }

  if (byModel.size === 0) return 0;

  const modelMetrics = [...byModel.entries()].map(([model, t]) => ({
    model,
    inputTokens: t.input,
    outputTokens: t.output,
    cacheReadTokens: t.cacheRead,
    cacheWriteTokens: t.cacheWrite,
  }));

  const result = calculateCost({ modelMetrics });
  return result.totalUsd;
}

/* ─── Component ──────────────────────────────────────────────────── */

export const CostPerTurnChart = memo(function CostPerTurnChart({
  turns,
}: CostPerTurnChartProps) {
  const rows = useMemo(() => {
    const costs = turns.map((t, i) => ({ index: i + 1, cost: turnCost(t) }))
      .filter((c) => c.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, MAX_ROWS);
    return costs;
  }, [turns]);

  const maxCost = rows.length > 0 ? rows[0]!.cost : 0;

  if (rows.length === 0) {
    return (
      <div className={styles['turnsBarChart']}>
        <p style={{ color: '#6b7280', fontSize: '0.8125rem', textAlign: 'center' }}>
          No cost data available
        </p>
      </div>
    );
  }

  return (
    <div className={styles['turnsBarChart']}>
      {rows.map((row) => {
        const pct = (row.cost / maxCost) * 100;
        return (
          <div key={row.index} className={styles['turnsBarRow']}>
            <span className={styles['turnsBarLabel']}>T{row.index}</span>
            <div className={styles['turnsBarTrack']}>
              <div
                className={styles['turnsBarFill']}
                style={{ width: `${pct}%`, background: BAR_COLOUR }}
              />
            </div>
            <span className={styles['turnsBarValue']}>{formatUsd(row.cost)}</span>
          </div>
        );
      })}
    </div>
  );
});
CostPerTurnChart.displayName = 'CostPerTurnChart';
