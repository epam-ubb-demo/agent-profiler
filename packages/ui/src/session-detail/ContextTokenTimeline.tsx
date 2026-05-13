/**
 * SVG area chart showing absolute token usage over time.
 *
 * Each sample's `used` token count is plotted against its timestamp.
 * Compaction events are marked with vertical dashed lines and downward
 * triangles.  A horizontal dashed line indicates the context-window limit.
 *
 * Hand-crafted SVG — no external charting library.
 */

import type { Compaction, UtilisationSample } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';

export interface ContextTokenTimelineProps {
  readonly samples: readonly UtilisationSample[];
  readonly compactions: readonly Compaction[];
}

/* --- Chart geometry constants ------------------------------------------- */

const X_MIN = 50;
const X_MAX = 780;
const Y_MIN = 30;
const Y_MAX = 230;
const CHART_WIDTH = X_MAX - X_MIN;
const CHART_HEIGHT = Y_MAX - Y_MIN;

/** Vertical position of the legend row. */
const LEGEND_Y = 258;

/* --- Helpers ------------------------------------------------------------- */

/**
 * Compute a "nice" step size for a Y-axis that produces roughly 5 ticks.
 * Examples: max=198K → step=50K; max=850 → step=200.
 */
function computeNiceStep(maxVal: number): number {
  if (maxVal <= 0) return 1;
  const rough = maxVal / 5;
  const exp = Math.floor(Math.log10(rough));
  const magnitude = Math.pow(10, exp);
  const fraction = rough / magnitude;
  if (fraction < 1.5) return magnitude;
  if (fraction < 3.5) return 2 * magnitude;
  if (fraction < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Format an ISO timestamp as HH:MM (for X-axis labels). */
function formatHHMM(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Format an ISO timestamp as HH:MM:SS (for tooltips). */
function formatHHMMSS(isoString: string): string {
  const d = new Date(isoString);
  return (
    `${String(d.getHours()).padStart(2, '0')}:` +
    `${String(d.getMinutes()).padStart(2, '0')}:` +
    `${String(d.getSeconds()).padStart(2, '0')}`
  );
}

/* --- Component ----------------------------------------------------------- */

function ContextTokenTimelineInner({ samples, compactions }: ContextTokenTimelineProps) {
  const computed = useMemo(() => {
    if (samples.length === 0) return null;

    const times = samples.map((s) => new Date(s.timestamp).getTime());
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tRange = tMax - tMin || 1; // avoid division by zero

    const maxUsed = Math.max(...samples.map((s) => s.used));
    const maxTotal = Math.max(...samples.map((s) => s.total));

    /* Compute a nice rounded Y ceiling with 10 % headroom. */
    const rawYMax = Math.max(maxUsed, maxTotal) * 1.1;
    const niceStep = computeNiceStep(rawYMax);
    const yMax = Math.ceil(rawYMax / niceStep) * niceStep || 1;

    const tokenToY = (value: number): number =>
      Y_MAX - (value / yMax) * CHART_HEIGHT;

    const timestampToX = (ts: string): number => {
      const t = new Date(ts).getTime();
      return X_MIN + ((t - tMin) / tRange) * CHART_WIDTH;
    };

    /* Sample points. */
    const points = samples.map((s, i) => {
      const t = times[i] ?? tMin;
      const x = X_MIN + ((t - tMin) / tRange) * CHART_WIDTH;
      const y = tokenToY(s.used);
      return { x, y, sample: s };
    });

    /* Y-axis ticks from 0 to yMax at niceStep intervals. */
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += niceStep) {
      yTicks.push(v);
    }

    /* X-axis labels: up to 6 evenly-spaced sample indices. */
    const labelCount = Math.min(samples.length, 6);
    const xLabelIndices =
      labelCount <= 1
        ? [0]
        : Array.from({ length: labelCount }, (_, i) =>
            Math.round((i * (samples.length - 1)) / (labelCount - 1)),
          );

    /* Filter compactions that have a non-null timestamp. */
    const compactionMarkers = compactions
      .filter((c): c is Compaction & { readonly timestamp: string } => c.timestamp !== null)
      .map((c) => ({
        x: timestampToX(c.timestamp),
        compaction: c,
      }));

    return { points, yTicks, tokenToY, maxTotal, xLabelIndices, compactionMarkers };
  }, [samples, compactions]);

  if (samples.length === 0 || computed === null) {
    return (
      <Text size="18" color="secondary">
        No context-utilisation samples found in process log.
      </Text>
    );
  }

  const { points, yTicks, tokenToY, maxTotal, xLabelIndices, compactionMarkers } = computed;

  /* Build SVG path strings. */
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${lastPoint?.x ?? X_MAX},${Y_MAX}`,
    `${firstPoint?.x ?? X_MIN},${Y_MAX}`,
  ].join(' ');

  const showLimitLine = maxTotal > 0;
  const limitY = showLimitLine ? tokenToY(maxTotal) : Y_MIN;
  const showCompactionLegend = compactionMarkers.length > 0;

  const ariaLabel = `Context token usage over time with ${compactionMarkers.length} compaction events`;

  return (
    <div className={styles.tokenTimelineContainer}>
      <svg
        viewBox="0 0 800 280"
        className={styles.tokenTimelineSvg}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Title */}
        <text
          x={400}
          y={16}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--uui-text-primary)"
        >
          Token usage over time
        </text>

        {/* Y-axis labels + horizontal grid lines */}
        {yTicks.map((v) => {
          const y = tokenToY(v);
          return (
            <g key={v}>
              <line
                x1={X_MIN}
                y1={y}
                x2={X_MAX}
                y2={y}
                stroke="var(--uui-neutral-30)"
                strokeDasharray="4 4"
              />
              <text
                x={X_MIN - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--uui-text-secondary)"
              >
                {formatTokenCount(v)}
              </text>
            </g>
          );
        })}

        {/* Context window limit line */}
        {showLimitLine && (
          <g>
            <line
              x1={X_MIN}
              y1={limitY}
              x2={X_MAX}
              y2={limitY}
              stroke="var(--uui-critical-50)"
              strokeDasharray="6 3"
              strokeWidth={1.5}
            />
            <text
              x={X_MAX}
              y={limitY - 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--uui-critical-50)"
            >
              {`Limit: ${formatTokenCount(maxTotal)}`}
            </text>
          </g>
        )}

        {/* Area fill */}
        <polygon points={areaPoints} fill="var(--uui-primary-10)" />

        {/* Stroke line */}
        <polyline
          points={linePoints}
          stroke="var(--uui-primary-50)"
          strokeWidth={2}
          fill="none"
        />

        {/* Sample dots with tooltips */}
        {points.map((p, i) => {
          const s = p.sample;
          return (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--uui-primary-50)">
              <title>{`${formatHHMMSS(s.timestamp)} — ${formatTokenCount(s.used)} / ${formatTokenCount(s.total)} tokens (${s.percentage}%)`}</title>
            </circle>
          );
        })}

        {/* Compaction markers: vertical line + downward triangle + hit area */}
        {compactionMarkers.map((m, i) => {
          const x = m.x;
          const c = m.compaction;
          return (
            <g key={i}>
              <line
                x1={x}
                y1={Y_MIN}
                x2={x}
                y2={Y_MAX}
                stroke="var(--uui-warning-50)"
                strokeDasharray="4 2"
                strokeWidth={1.5}
              />
              <polygon
                points={`${x - 5},${Y_MIN + 2} ${x + 5},${Y_MIN + 2} ${x},${Y_MIN + 10}`}
                fill="var(--uui-warning-50)"
              />
              <circle cx={x} cy={Y_MIN + 6} r={10} fill="transparent">
                <title>{`Compaction at ${formatHHMMSS(c.timestamp)}\nInput: ${formatTokenCount(c.inputTokens)} tokens\nModel: ${c.model ?? 'unknown'}`}</title>
              </circle>
            </g>
          );
        })}

        {/* X-axis time labels */}
        {xLabelIndices.map((idx) => {
          const p = points[idx];
          const s = samples[idx];
          if (!p || !s) return null;
          return (
            <text
              key={idx}
              x={p.x}
              y={Y_MAX + 14}
              textAnchor="middle"
              fontSize={9}
              fill="var(--uui-text-secondary)"
            >
              {formatHHMM(s.timestamp)}
            </text>
          );
        })}

        {/* Legend row */}
        {/* Token usage */}
        <circle cx={64} cy={LEGEND_Y - 3} r={4} fill="var(--uui-primary-50)" />
        <text x={74} y={LEGEND_Y} fontSize={9} fill="var(--uui-text-secondary)">
          Token usage
        </text>

        {/* Window limit */}
        {showLimitLine && (
          <g>
            <line
              x1={180}
              y1={LEGEND_Y - 3}
              x2={200}
              y2={LEGEND_Y - 3}
              stroke="var(--uui-critical-50)"
              strokeDasharray="6 3"
              strokeWidth={1.5}
            />
            <text x={205} y={LEGEND_Y} fontSize={9} fill="var(--uui-text-secondary)">
              Window limit
            </text>
          </g>
        )}

        {/* Compaction */}
        {showCompactionLegend && (
          <g>
            <line
              x1={300}
              y1={LEGEND_Y - 3}
              x2={320}
              y2={LEGEND_Y - 3}
              stroke="var(--uui-warning-50)"
              strokeDasharray="4 2"
              strokeWidth={1.5}
            />
            <text x={325} y={LEGEND_Y} fontSize={9} fill="var(--uui-text-secondary)">
              Compaction
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export const ContextTokenTimeline = memo(ContextTokenTimelineInner);
ContextTokenTimeline.displayName = 'ContextTokenTimeline';
