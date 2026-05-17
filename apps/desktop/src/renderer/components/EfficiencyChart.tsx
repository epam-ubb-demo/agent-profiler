import { Text } from '@epam/uui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import type { PricingTable } from '@agent-profiler/pricing';

import type { DailyAnalytics, Granularity } from './CombinedAnalyticsChart';
import { smoothPath } from './svg-path-utils';

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const MARGIN = { top: 16, right: 24, bottom: 32, left: 48 } as const;
/** Fixed viewBox dimensions — SVG scales to its container via width="100%". */
const VIEW_W = 800;
const SVG_HEIGHT = 180;
const DOT_RADIUS = 3.5;

const CHART_W = VIEW_W - MARGIN.left - MARGIN.right;
const CHART_H = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

const EFFICIENCY_COLOUR = '#10b981'; // emerald-500
const EFFICIENCY_FILL = 'rgba(16, 185, 129, 0.15)';
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

function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/* ─── Props ──────────────────────────────────────────────────────────────────── */

export interface EfficiencyChartProps {
  readonly data: ReadonlyArray<DailyAnalytics>;
  readonly granularity?: Granularity | undefined;
  readonly pricingTable: PricingTable;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export const EfficiencyChart = memo(function EfficiencyChart({
  data,
  granularity = 'day',
  pricingTable,
}: EfficiencyChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    date: string;
    efficiency: number;
    actualCost: number;
    naiveCost: number;
  } | null>(null);

  // Memoise max rates — recomputed only when pricingTable changes
  const { maxInputRate, maxOutputRate } = useMemo(() => {
    const rates = Object.values(pricingTable);
    return {
      maxInputRate: rates.length > 0 ? Math.max(...rates.map((r) => r.input)) : 0,
      maxOutputRate: rates.length > 0 ? Math.max(...rates.map((r) => r.output)) : 0,
    };
  }, [pricingTable]);

  // Compute per-bucket efficiency
  const points = useMemo(() => {
    return data.map((d) => {
      const naiveCost =
        (d.inputTokens * maxInputRate + d.outputTokens * maxOutputRate) / 1_000_000;
      if (naiveCost <= 0 || d.cost == null) {
        return { date: d.date, efficiency: null, actualCost: null, naiveCost: 0 };
      }
      const efficiency = Math.max(0, Math.min(1, 1 - d.cost / naiveCost));
      return { date: d.date, efficiency, actualCost: d.cost, naiveCost };
    });
  }, [data, maxInputRate, maxOutputRate]);

  // Y scale: 0–100% maps to chartH..0 (bottom to top)
  const yScale = useCallback(
    (pct: number) => CHART_H - (pct / 100) * CHART_H,
    [],
  );

  // X positions
  const n = points.length;
  const xScale = useCallback(
    (i: number) => (n === 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W),
    [n],
  );

  // Build segments (gap where efficiency is null)
  const segments = useMemo((): Array<Array<{ x: number; y: number; idx: number }>> => {
    const segs: Array<Array<{ x: number; y: number; idx: number }>> = [];
    let cur: Array<{ x: number; y: number; idx: number }> = [];
    for (let i = 0; i < n; i++) {
      const eff = points[i]!.efficiency;
      if (eff !== null) {
        cur.push({
          x: MARGIN.left + xScale(i),
          y: MARGIN.top + yScale(eff * 100),
          idx: i,
        });
      } else if (cur.length > 0) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) segs.push(cur);
    return segs;
  }, [points, n, xScale, yScale]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (n === 0) return [];
    const maxLabels = Math.max(2, Math.floor(CHART_W / 70));
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const labels: Array<{ x: number; text: string }> = [];
    for (let i = 0; i < n; i += step) {
      labels.push({
        x: MARGIN.left + xScale(i),
        text: formatShortDate(points[i]!.date, granularity),
      });
    }
    return labels;
  }, [n, points, granularity, xScale]);

  // Y-axis gridlines: 0%, 25%, 50%, 75%, 100%
  const yTicks = [0, 25, 50, 75, 100];

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (data.length === 0) {
    return (
      <div style={{ padding: '24px 0' }}>
        <Text fontSize="14" color="secondary">
          No data for efficiency chart.
        </Text>
      </div>
    );
  }

  // Clamp tooltip so it stays within the SVG viewBox
  const TOOLTIP_W = 182;
  const TOOLTIP_H = 94;
  const tooltipX = tooltip
    ? Math.max(2, Math.min(tooltip.x - TOOLTIP_W / 2, VIEW_W - TOOLTIP_W - 2))
    : 0;
  const tooltipY = tooltip
    ? Math.max(2, tooltip.y - TOOLTIP_H - 8)
    : 0;

  return (
    <div>
      <Text
        cx="block"
        fontSize="14"
        fontWeight="600"
        rawProps={{ style: { marginBottom: 8 } }}
      >
        Cost Efficiency
      </Text>
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${SVG_HEIGHT}`}
          width="100%"
          role="img"
          aria-label="Cost efficiency chart"
          data-testid="efficiency-chart"
        >
          {/* Y gridlines + labels */}
          {yTicks.map((tick) => {
            const y = MARGIN.top + yScale(tick);
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + CHART_W}
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

          {/* Area fills + lines per segment */}
          {segments.map((seg, si) => {
            const pts = seg.map(({ x, y }) => ({ x, y }));
            const linePath = smoothPath(pts);
            const bottomY = MARGIN.top + CHART_H;
            const areaPath =
              pts.length > 0
                ? `${linePath} L${pts[pts.length - 1]!.x},${bottomY} L${pts[0]!.x},${bottomY} Z`
                : '';
            return (
              <g key={si}>
                <path d={areaPath} fill={EFFICIENCY_FILL} />
                <path
                  d={linePath}
                  fill="none"
                  stroke={EFFICIENCY_COLOUR}
                  strokeWidth={2}
                  data-testid={si === 0 ? 'efficiency-line' : undefined}
                />
              </g>
            );
          })}

          {/* Dots for non-null efficiency points */}
          {segments.flatMap((seg) =>
            seg.map(({ x, y, idx }) => (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r={DOT_RADIUS}
                fill={EFFICIENCY_COLOUR}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                data-testid={`efficiency-dot-${idx}`}
                onMouseEnter={() => {
                  const pt = points[idx]!;
                  setTooltip({
                    x,
                    y,
                    date: pt.date,
                    efficiency: pt.efficiency!,
                    actualCost: pt.actualCost!,
                    naiveCost: pt.naiveCost,
                  });
                }}
                onMouseLeave={handleMouseLeave}
              />
            )),
          )}

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
            <g data-testid="efficiency-tooltip">
              <rect
                x={tooltipX}
                y={tooltipY}
                width={TOOLTIP_W}
                height={TOOLTIP_H}
                rx={4}
                fill="#1f2937"
                opacity={0.92}
              />
              {/* Date */}
              <text
                x={tooltipX + TOOLTIP_W / 2}
                y={tooltipY + 14}
                textAnchor="middle"
                fontSize={11}
                fill="#d1d5db"
              >
                {formatShortDate(tooltip.date, granularity)}
              </text>
              {/* Efficiency */}
              <text
                x={tooltipX + TOOLTIP_W / 2}
                y={tooltipY + 30}
                textAnchor="middle"
                fontSize={12}
                fill="#fff"
                fontWeight={600}
              >
                Efficiency: {(tooltip.efficiency * 100).toFixed(1)}%
              </text>
              {/* Actual cost */}
              <text
                x={tooltipX + TOOLTIP_W / 2}
                y={tooltipY + 46}
                textAnchor="middle"
                fontSize={11}
                fill="#d1d5db"
              >
                Actual: {formatUsd(tooltip.actualCost)}
              </text>
              {/* Naïve cost */}
              <text
                x={tooltipX + TOOLTIP_W / 2}
                y={tooltipY + 62}
                textAnchor="middle"
                fontSize={11}
                fill="#d1d5db"
              >
                Naïve: {formatUsd(tooltip.naiveCost)}
              </text>
              {/* Savings */}
              <text
                x={tooltipX + TOOLTIP_W / 2}
                y={tooltipY + 78}
                textAnchor="middle"
                fontSize={11}
                fill="#6ee7b7"
              >
                Savings: {formatUsd(tooltip.naiveCost - tooltip.actualCost)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
});
