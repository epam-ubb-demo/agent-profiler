/**
 * SVG bar chart showing cost (USD) per day.
 *
 * Hand-crafted SVG — no external charting library.
 */

import { Text } from '@epam/uui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

/* ─── Props ─────────────────────────────────────────────────────────────────── */

export interface DailyMetrics {
  readonly date: string;
  /** Null when no session in this day had cost data. */
  readonly cost: number | null;
  /** Null when no session in this day had wall-time data. */
  readonly wallTimeMs: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
}

export interface DailySpendChartProps {
  readonly data: ReadonlyArray<DailyMetrics>;
}

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const VIEW_W = 800;
const VIEW_H = 200;

const MARGIN_TOP = 20;
const MARGIN_RIGHT = 20;
const MARGIN_BOTTOM = 40; // room for x-axis labels
const MARGIN_LEFT = 60; // room for y-axis labels

const CHART_X = MARGIN_LEFT;
const CHART_Y = MARGIN_TOP;
const CHART_W = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Format a YYYY-MM-DD date key as a short label like "May 10". */
function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Format a USD value for the Y-axis. */
function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** Format a duration in ms as human-readable. */
function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

/** Format a token count as K/M shorthand. */
function formatTk(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Compute a "nice" step size for a Y-axis that produces roughly 4-5 ticks.
 */
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

/* ─── Tooltip state ─────────────────────────────────────────────────────────── */

interface TooltipState {
  readonly item: DailyMetrics;
  readonly x: number;
  readonly y: number;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

function DailySpendChartInner({ data }: DailySpendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleBarEnter = useCallback(
    (item: DailyMetrics, e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltip({
        item,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 8,
      });
      (e.currentTarget as SVGRectElement).setAttribute('fill', 'var(--uui-primary-60)');
    },
    [],
  );

  const handleBarMove = useCallback(
    (item: DailyMetrics, e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltip({
        item,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 8,
      });
    },
    [],
  );

  const handleBarLeave = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    setTooltip(null);
    (e.currentTarget as SVGRectElement).setAttribute('fill', 'var(--uui-primary-50)');
  }, []);

  const computed = useMemo(() => {
    if (data.length === 0) return null;

    const maxCost = Math.max(...data.map((d) => d.cost ?? 0));
    if (maxCost === 0) return null;

    const niceStep = computeNiceStep(maxCost * 1.1);
    const yMax = Math.ceil((maxCost * 1.1) / niceStep) * niceStep || niceStep;

    const n = data.length;
    const barAreaW = CHART_W;
    const barW = Math.max(4, Math.min(40, barAreaW / n - 4));
    const slotW = barAreaW / n;

    const bars = data.map((item, i) => {
      const barH = ((item.cost ?? 0) / yMax) * CHART_H;
      const cx = CHART_X + slotW * i + slotW / 2;
      const x = cx - barW / 2;
      const y = CHART_Y + CHART_H - barH;
      return { x, y, width: barW, height: barH, item, cx };
    });

    const yTicks: number[] = [];
    for (let v = 0; v <= yMax + niceStep * 0.5; v += niceStep) {
      yTicks.push(v);
    }

    // X-axis labels: show up to 8 evenly spaced ones to avoid overlap
    const maxLabels = Math.min(n, 8);
    const labelIndices =
      maxLabels <= 1
        ? [0]
        : Array.from({ length: maxLabels }, (_, i) =>
            Math.round((i * (n - 1)) / (maxLabels - 1)),
          );

    return { bars, yTicks, yMax, labelIndices };
  }, [data]);

  if (data.length === 0 || computed === null) {
    return (
      <Text size="18" color="secondary">
        No cost data
      </Text>
    );
  }

  const { bars, yTicks, labelIndices } = computed;

  const axisBaseY = CHART_Y + CHART_H;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        style={{ display: 'block' }}
        role="img"
        aria-label="Daily spend bar chart"
        data-testid="daily-spend-chart"
      >
        {/* Y-axis gridlines + labels */}
        {yTicks.map((v) => {
          const y = CHART_Y + CHART_H - (v / computed.yMax) * CHART_H;
          return (
            <g key={v}>
              <line
                x1={CHART_X}
                y1={y}
                x2={CHART_X + CHART_W}
                y2={y}
                stroke="var(--uui-neutral-40)"
                strokeDasharray="4,4"
                strokeWidth={1}
              />
              <text
                x={CHART_X - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--uui-text-secondary)"
              >
                {formatUsd(v)}
              </text>
            </g>
          );
        })}

        {/* Axis baseline */}
        <line
          x1={CHART_X}
          y1={axisBaseY}
          x2={CHART_X + CHART_W}
          y2={axisBaseY}
          stroke="var(--uui-neutral-40)"
          strokeWidth={1}
        />

        {/* Bars */}
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill="var(--uui-primary-50)"
            rx={2}
            data-testid="spend-bar"
            style={{ cursor: 'default' }}
            onMouseEnter={(e) => handleBarEnter(bar.item, e)}
            onMouseMove={(e) => handleBarMove(bar.item, e)}
            onMouseLeave={handleBarLeave}
          />
        ))}

        {/* X-axis date labels */}
        {labelIndices.map((idx) => {
          const bar = bars[idx];
          if (!bar) return null;
          return (
            <text
              key={idx}
              x={bar.cx}
              y={axisBaseY + 14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--uui-text-secondary)"
            >
              {formatShortDate(bar.item.date)}
            </text>
          );
        })}
      </svg>

      {/* HTML tooltip overlay */}
      {tooltip && (
        <div
          data-testid="chart-tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'var(--uui-surface-highest, #1f2937)',
            color: 'var(--uui-text-primary-invert, #fff)',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.75rem',
            lineHeight: 1.5,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatShortDate(tooltip.item.date)}
          </div>
          <div>Cost: {tooltip.item.cost != null ? formatUsd(tooltip.item.cost) : '—'}</div>
          <div>Time: {tooltip.item.wallTimeMs != null ? formatMs(tooltip.item.wallTimeMs) : '—'}</div>
          <div>In: {formatTk(tooltip.item.inputTokens)}</div>
          <div>Out: {formatTk(tooltip.item.outputTokens)}</div>
          <div>Cached: {formatTk(tooltip.item.cacheReadTokens)}</div>
        </div>
      )}
    </div>
  );
}

export const DailySpendChart = memo(DailySpendChartInner);
DailySpendChart.displayName = 'DailySpendChart';
