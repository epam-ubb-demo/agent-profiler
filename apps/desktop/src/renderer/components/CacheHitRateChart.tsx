import { Text } from '@epam/uui';
import { memo, useMemo, useRef, useState } from 'react';

import type { DailyAnalytics, Granularity } from './CombinedAnalyticsChart';
import { smoothPath } from './svg-path-utils';

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const MARGIN = { top: 16, right: 24, bottom: 32, left: 48 } as const;
const SVG_HEIGHT = 180;
const DOT_RADIUS = 3.5;

const CACHE_COLOUR = '#06b6d4'; // cyan-500
const GRID_COLOUR = '#e5e7eb'; // gray-200
const TEXT_COLOUR = '#6b7280'; // gray-500

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatShortDate(dateKey: string, granularity: Granularity = 'day'): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  if (granularity === 'month') {
    return dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  if (granularity === 'week') {
    return `W/C ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export interface CacheHitRateChartProps {
  readonly data: ReadonlyArray<DailyAnalytics>;
  readonly granularity?: Granularity | undefined;
}

export const CacheHitRateChart = memo(function CacheHitRateChart({
  data,
  granularity = 'day',
}: CacheHitRateChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    date: string;
    rate: number;
  } | null>(null);

  // Observe container width
  const resizeRef = useRef<ResizeObserver | null>(null);
  const setContainer = (el: HTMLDivElement | null) => {
    if (resizeRef.current) resizeRef.current.disconnect();
    if (el) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setWidth(el.clientWidth);
      resizeRef.current = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w != null) setWidth(w);
      });
      resizeRef.current.observe(el);
    }
  };

  // Compute per-bucket cache hit rate
  const points = useMemo(() => {
    return data.map((d) => {
      const rate = d.inputTokens > 0
        ? (d.cacheReadTokens / d.inputTokens) * 100
        : 0;
      return { date: d.date, rate: Math.min(rate, 100) };
    });
  }, [data]);

  // Chart dimensions
  const chartW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const chartH = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
  const n = points.length;

  // X positions
  const xScale = (i: number) =>
    n === 1 ? chartW / 2 : (i / (n - 1)) * chartW;

  // Y scale: always 0–100%
  const yScale = (rate: number) => chartH - (rate / 100) * chartH;

  // Build smooth path
  const svgPoints = useMemo(() => {
    return points.map((p, i) => ({
      x: MARGIN.left + xScale(i),
      y: MARGIN.top + yScale(p.rate),
    }));
  }, [points, chartW, chartH]);

  const linePath = useMemo(() => smoothPath(svgPoints), [svgPoints]);

  // Area fill (line → bottom)
  const areaPath = useMemo(() => {
    if (svgPoints.length === 0) return '';
    const bottomY = MARGIN.top + chartH;
    const first = svgPoints[0]!;
    const last = svgPoints[svgPoints.length - 1]!;
    return `${linePath} L${last.x},${bottomY} L${first.x},${bottomY} Z`;
  }, [linePath, svgPoints, chartH]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (n === 0) return [];
    const maxLabels = Math.max(2, Math.floor(chartW / 70));
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const labels: Array<{ x: number; text: string }> = [];
    for (let i = 0; i < n; i += step) {
      labels.push({
        x: MARGIN.left + xScale(i),
        text: formatShortDate(points[i]!.date, granularity),
      });
    }
    return labels;
  }, [n, chartW, points]);

  // Y-axis gridlines: 0%, 25%, 50%, 75%, 100%
  const yTicks = [0, 25, 50, 75, 100];

  if (data.length === 0) {
    return (
      <div style={{ padding: '24px 0' }}>
        <Text fontSize="14" color="secondary">
          No data for cache hit rate chart.
        </Text>
      </div>
    );
  }

  return (
    <div>
      <Text
        cx="block"
        fontSize="14"
        fontWeight="600"
        rawProps={{ style: { marginBottom: 8 } }}
      >
        Cache hit rate
      </Text>
      <div ref={setContainer} style={{ width: '100%', position: 'relative' }}>
        {width > 0 && (
          <svg
            width={width}
            height={SVG_HEIGHT}
            role="img"
            aria-label="Cache hit rate chart"
          >
            {/* Y gridlines + labels */}
            {yTicks.map((tick) => {
              const y = MARGIN.top + yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={MARGIN.left + chartW}
                    y1={y}
                    y2={y}
                    stroke={GRID_COLOUR}
                    strokeWidth={1}
                  />
                  <text
                    x={MARGIN.left - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="central"
                    fontSize={11}
                    fill={TEXT_COLOUR}
                  >
                    {tick}%
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill={CACHE_COLOUR} opacity={0.1} />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={CACHE_COLOUR}
              strokeWidth={2}
            />

            {/* Dots */}
            {svgPoints.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={DOT_RADIUS}
                fill={CACHE_COLOUR}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() =>
                  setTooltip({
                    x: pt.x,
                    y: pt.y,
                    date: points[i]!.date,
                    rate: points[i]!.rate,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            ))}

            {/* X-axis labels */}
            {xLabels.map((label, i) => (
              <text
                key={i}
                x={label.x}
                y={SVG_HEIGHT - 4}
                textAnchor="middle"
                fontSize={11}
                fill={TEXT_COLOUR}
              >
                {label.text}
              </text>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <g>
                <rect
                  x={tooltip.x - 50}
                  y={tooltip.y - 32}
                  width={100}
                  height={24}
                  rx={4}
                  fill="#1f2937"
                  opacity={0.9}
                />
                <text
                  x={tooltip.x}
                  y={tooltip.y - 16}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#fff"
                  fontWeight={500}
                >
                  {formatShortDate(tooltip.date, granularity)}: {tooltip.rate.toFixed(1)}%
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
});
