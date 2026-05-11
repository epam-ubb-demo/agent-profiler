/**
 * SVG area chart showing context-window utilisation over time.
 *
 * Each sample is plotted as percentage (0–100 %) on the Y axis against
 * its timestamp on the X axis.  An area fill, stroke line and dots
 * provide the visual encoding; horizontal grid lines at 25 % intervals
 * give reference points.
 */

import type { UtilisationSample } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';

export interface ContextUtilisationChartProps {
  readonly samples: readonly UtilisationSample[];
}

/* --- Chart geometry constants ------------------------------------------- */

const X_MIN = 50;
const X_MAX = 780;
const Y_MIN = 10;
const Y_MAX = 180;
const CHART_WIDTH = X_MAX - X_MIN;
const CHART_HEIGHT = Y_MAX - Y_MIN;

/** Grid lines at 25 % intervals. */
const GRID_PERCENTAGES = [25, 50, 75] as const;

/** Y-axis label values. */
const Y_LABELS = [0, 25, 50, 75, 100] as const;

/* --- Helpers ------------------------------------------------------------- */

/** Map a percentage (0–100) to a Y coordinate within the chart area. */
function percentageToY(pct: number): number {
  return Y_MAX - (pct / 100) * CHART_HEIGHT;
}

/* --- Component ----------------------------------------------------------- */

function ContextUtilisationChartInner({
  samples,
}: ContextUtilisationChartProps) {
  const points = useMemo(() => {
    if (samples.length === 0) return [];

    /* Parse timestamps and derive linear X positions. */
    const times = samples.map((s) => new Date(s.timestamp).getTime());
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tRange = tMax - tMin || 1; // avoid division by zero for single-sample

    return samples.map((s, i) => {
      const t = times[i] ?? tMin;
      const x = X_MIN + ((t - tMin) / tRange) * CHART_WIDTH;
      const y = percentageToY(s.percentage);
      return { x, y };
    });
  }, [samples]);

  if (samples.length === 0) {
    return (
      <Text size="18" color="secondary">
        No context-utilisation samples found in process log.
      </Text>
    );
  }

  /* Build SVG path strings. */
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const areaPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${lastPoint?.x ?? X_MAX},${Y_MAX}`,
    `${firstPoint?.x ?? X_MIN},${Y_MAX}`,
  ].join(' ');

  return (
    <div className={styles.utilisationContainer}>
      <svg viewBox="0 0 800 200" className={styles.utilisationSvg}>
        {/* Horizontal grid lines */}
        {GRID_PERCENTAGES.map((pct) => {
          const y = percentageToY(pct);
          return (
            <line
              key={pct}
              x1={X_MIN}
              y1={y}
              x2={X_MAX}
              y2={y}
              stroke="var(--uui-neutral-30)"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Y-axis labels */}
        {Y_LABELS.map((pct) => (
          <text
            key={pct}
            x={X_MIN - 6}
            y={percentageToY(pct) + 3}
            textAnchor="end"
            fill="var(--uui-text-secondary)"
            fontSize={10}
          >
            {pct}%
          </text>
        ))}

        {/* Area fill */}
        <polygon points={areaPoints} fill="var(--uui-info-10)" />

        {/* Stroke line */}
        <polyline
          points={linePoints}
          stroke="var(--uui-info-50)"
          strokeWidth={2}
          fill="none"
        />

        {/* Sample dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--uui-info-50)"
          />
        ))}
      </svg>
    </div>
  );
}

export const ContextUtilisationChart = memo(ContextUtilisationChartInner);
ContextUtilisationChart.displayName = 'ContextUtilisationChart';
