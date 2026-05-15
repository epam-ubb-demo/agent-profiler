/**
 * CacheHitPerTurnChart — SVG line chart showing cache hit rate per turn.
 *
 * X-axis: turn index (1-based), Y-axis: cacheRead / input × 100.
 * Uses monotone cubic Bézier interpolation for smooth curves.
 */

import type { Turn } from '@agent-profiler/core';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';
import { smoothPath } from './svg-path-utils';

/* ─── Chart geometry ─────────────────────────────────────────────── */

const SVG_W = 800;
const SVG_H = 200;
const M = { top: 20, right: 20, bottom: 32, left: 48 } as const;
const CW = SVG_W - M.left - M.right;
const CH = SVG_H - M.top - M.bottom;

const LINE_COLOUR = '#06b6d4';
const FILL_COLOUR = 'rgba(6, 182, 212, 0.12)';
const GRID_COLOUR = '#e5e7eb';
const TEXT_COLOUR = '#6b7280';

/* ─── Props ──────────────────────────────────────────────────────── */

export interface CacheHitPerTurnChartProps {
  readonly turns: readonly Turn[];
}

/* ─── Component ──────────────────────────────────────────────────── */

export const CacheHitPerTurnChart = memo(function CacheHitPerTurnChart({
  turns,
}: CacheHitPerTurnChartProps) {
  const points = useMemo(() => {
    return turns.map((t, i) => {
      let totalInput = 0;
      let totalCacheRead = 0;
      for (const msg of t.assistantMessages) {
        totalInput += msg.inputTokens;
        totalCacheRead += msg.cacheReadTokens;
      }
      const rate = totalInput > 0 ? (totalCacheRead / totalInput) * 100 : 0;
      return { turnIndex: i + 1, rate };
    });
  }, [turns]);

  const n = points.length;

  if (n === 0) {
    return (
      <div className={styles['turnsBarChart']}>
        <p style={{ color: TEXT_COLOUR, fontSize: '0.8125rem', textAlign: 'center' }}>
          No turns to display
        </p>
      </div>
    );
  }

  const xScale = (idx: number) => M.left + ((idx - 1) / Math.max(1, n - 1)) * CW;
  const yScale = (rate: number) => M.top + CH - (rate / 100) * CH;

  const svgPoints = points.map((p) => ({ x: xScale(p.turnIndex), y: yScale(p.rate) }));
  const linePath = smoothPath(svgPoints);

  // Closed area path for fill
  const areaPath = svgPoints.length > 0
    ? `${linePath} L${svgPoints[svgPoints.length - 1]!.x},${yScale(0)} L${svgPoints[0]!.x},${yScale(0)} Z`
    : '';

  // Y-axis gridlines: 0%, 25%, 50%, 75%, 100%
  const yTicks = [0, 25, 50, 75, 100];

  // X-axis labels (show at most ~10)
  const maxLabels = Math.max(2, Math.floor(CW / 60));
  const step = Math.max(1, Math.ceil(n / maxLabels));

  return (
    <div className={styles['turnsBarChart']}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={styles['tokenTimelineSvg']}>
        {/* Grid lines */}
        {yTicks.map((pct) => (
          <g key={pct}>
            <line
              x1={M.left} y1={yScale(pct)} x2={SVG_W - M.right} y2={yScale(pct)}
              stroke={GRID_COLOUR} strokeDasharray="3,3"
            />
            <text x={M.left - 6} y={yScale(pct) + 4} textAnchor="end" fontSize={10} fill={TEXT_COLOUR}>
              {pct}%
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={FILL_COLOUR} />}

        {/* Smooth line */}
        <path d={linePath} fill="none" stroke={LINE_COLOUR} strokeWidth={2} />

        {/* Dots */}
        {svgPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={LINE_COLOUR} />
        ))}

        {/* X-axis labels */}
        {Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0).map((i) => (
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
CacheHitPerTurnChart.displayName = 'CacheHitPerTurnChart';
