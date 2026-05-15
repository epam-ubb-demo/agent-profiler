/**
 * CumulativeCostChart — SVG line chart showing running total cost across turns.
 *
 * X-axis: turn index, Y-axis: cumulative USD.
 * Aggregates assistant messages by model per turn before calculating cost.
 * Uses monotone cubic Bézier for smooth curves.
 */

import type { Turn } from '@agent-profiler/core';
import { calculateCost } from '@agent-profiler/pricing';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';
import { smoothPath } from './svg-path-utils';

/* ─── Chart geometry ─────────────────────────────────────────────── */

const SVG_W = 800;
const SVG_H = 200;
const M = { top: 20, right: 20, bottom: 32, left: 60 } as const;
const CW = SVG_W - M.left - M.right;
const CH = SVG_H - M.top - M.bottom;

const LINE_COLOUR = '#22c55e';
const FILL_COLOUR = 'rgba(34, 197, 94, 0.10)';
const GRID_COLOUR = '#e5e7eb';
const TEXT_COLOUR = '#6b7280';

/* ─── Props ──────────────────────────────────────────────────────── */

export interface CumulativeCostChartProps {
  readonly turns: readonly Turn[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

/** Aggregate messages by model within a turn, then calculate cost. */
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

function computeNiceStep(maxVal: number): number {
  if (maxVal <= 0) return 0.01;
  const rough = maxVal / 4;
  const exp = Math.floor(Math.log10(rough));
  const magnitude = Math.pow(10, exp);
  const fraction = rough / magnitude;
  if (fraction < 1.5) return magnitude;
  if (fraction < 3.5) return 2 * magnitude;
  if (fraction < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}

/* ─── Component ──────────────────────────────────────────────────── */

export const CumulativeCostChart = memo(function CumulativeCostChart({
  turns,
}: CumulativeCostChartProps) {
  const cumulative = useMemo(() => {
    let running = 0;
    return turns.map((t, i) => {
      running += turnCost(t);
      return { turnIndex: i + 1, cost: running };
    });
  }, [turns]);

  const n = cumulative.length;
  const maxCost = n > 0 ? cumulative[n - 1]!.cost : 0;

  if (n === 0 || maxCost <= 0) {
    return (
      <div className={styles['turnsBarChart']}>
        <p style={{ color: TEXT_COLOUR, fontSize: '0.8125rem', textAlign: 'center' }}>
          No cost data available
        </p>
      </div>
    );
  }

  const step = computeNiceStep(maxCost);
  const niceMax = Math.ceil(maxCost / step) * step;

  const xScale = (idx: number) => M.left + ((idx - 1) / Math.max(1, n - 1)) * CW;
  const yScale = (cost: number) => M.top + CH - (cost / niceMax) * CH;

  const svgPoints = cumulative.map((p) => ({ x: xScale(p.turnIndex), y: yScale(p.cost) }));
  const linePath = smoothPath(svgPoints);
  const areaPath = svgPoints.length > 0
    ? `${linePath} L${svgPoints[svgPoints.length - 1]!.x},${yScale(0)} L${svgPoints[0]!.x},${yScale(0)} Z`
    : '';

  // Y-axis gridlines
  const yTicks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) yTicks.push(v);

  // X-axis labels
  const maxLabels = Math.max(2, Math.floor(CW / 60));
  const xStep = Math.max(1, Math.ceil(n / maxLabels));

  return (
    <div className={styles['turnsBarChart']}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={styles['tokenTimelineSvg']}>
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={M.left} y1={yScale(v)} x2={SVG_W - M.right} y2={yScale(v)}
              stroke={GRID_COLOUR} strokeDasharray="3,3"
            />
            <text x={M.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize={10} fill={TEXT_COLOUR}>
              {formatUsd(v)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={FILL_COLOUR} />}

        {/* Smooth line */}
        <path d={linePath} fill="none" stroke={LINE_COLOUR} strokeWidth={2} />

        {/* X-axis labels */}
        {Array.from({ length: n }, (_, i) => i).filter((i) => i % xStep === 0).map((i) => (
          <text
            key={i}
            x={xScale(i + 1)}
            y={SVG_H - 4}
            textAnchor="middle"
            fontSize={10}
            fill={TEXT_COLOUR}
          >
            T{i + 1}
          </text>
        ))}
      </svg>
    </div>
  );
});
CumulativeCostChart.displayName = 'CumulativeCostChart';
