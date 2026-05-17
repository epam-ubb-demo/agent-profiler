import { Text } from '@epam/uui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import type { PricingTable } from '@agent-profiler/pricing';

import type { DailyAnalytics, Granularity } from './CombinedAnalyticsChart';
import { smoothPath } from './svg-path-utils';

/* ─── SVG path helpers ───────────────────────────────────────────────────────── */

/** Simple linear SVG path — no Bézier smoothing. For area fills where shared
 *  boundaries must match exactly. */
function linearPath(pts: ReadonlyArray<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i]!.x},${pts[i]!.y}`;
  }
  return d;
}

function linearPathReverse(pts: ReadonlyArray<{ x: number; y: number }>): string {
  if (pts.length <= 1) return '';
  let d = '';
  for (let i = pts.length - 1; i >= 0; i--) {
    d += ` L${pts[i]!.x},${pts[i]!.y}`;
  }
  return d;
}

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const MARGIN = { top: 16, right: 24, bottom: 32, left: 48 } as const;
/** Fixed viewBox dimensions — SVG scales to its container via width="100%". */
const VIEW_W = 800;
const SVG_HEIGHT = 180;
const DOT_RADIUS = 3.5;

const CHART_W = VIEW_W - MARGIN.left - MARGIN.right;
const CHART_H = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
const CHART_Y = MARGIN.top;

const CACHE_COLOUR = '#10b981';              // emerald-500 (green)
const CACHE_FILL = 'rgba(16, 185, 129, 0.2)';
const ROUTING_COLOUR = '#3b82f6';            // blue-500
const ROUTING_FILL = 'rgba(59, 130, 246, 0.2)';
const GRID_COLOUR = '#e5e7eb';               // gray-200
const TEXT_COLOUR = '#6b7280';               // gray-500

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

/* ─── Tooltip state ──────────────────────────────────────────────────────────── */

interface TooltipState {
  readonly x: number;
  readonly y: number;
  readonly date: string;
  readonly totalSavingsPct: number;
  readonly cacheSavingsPct: number;
  readonly routingSavingsPct: number;
  readonly actualCost: number;
  readonly worstCaseCost: number;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export const EfficiencyChart = memo(function EfficiencyChart({
  data,
  granularity = 'day',
  pricingTable,
}: EfficiencyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Memoise max rates — recomputed only when pricingTable changes
  const { maxInputRate, maxOutputRate } = useMemo(() => {
    const rates = Object.values(pricingTable);
    return {
      maxInputRate: rates.length > 0 ? Math.max(...rates.map((r) => r.input)) : 0,
      maxOutputRate: rates.length > 0 ? Math.max(...rates.map((r) => r.output)) : 0,
    };
  }, [pricingTable]);

  // Compute per-bucket savings, decomposed into cache savings + routing savings
  const points = useMemo(() => {
    return data.map((d) => {
      // 1. Worst-case cost: all tokens at most expensive rates, no caching
      const worstCaseCost =
        (d.inputTokens * maxInputRate + d.outputTokens * maxOutputRate) / 1_000_000;

      if (worstCaseCost <= 0 || d.cost == null) {
        return {
          date: d.date,
          totalSavingsPct: null as number | null,
          cacheSavingsPct: null as number | null,
          routingSavingsPct: null as number | null,
          actualCost: null as number | null,
          worstCaseCost: 0,
        };
      }

      // 2. Same-models-no-cache cost: actual models used, but without cache discounts.
      //    Approximated as each model's totalTokens × that model's input rate.
      //    When modelBreakdown is unavailable, attribute all savings to caching.
      let sameModelsNoCacheCost: number;
      if (d.modelBreakdown.length === 0) {
        sameModelsNoCacheCost = worstCaseCost;
      } else {
        sameModelsNoCacheCost = 0;
        for (const mb of d.modelBreakdown) {
          const pricing = pricingTable[mb.model];
          if (pricing != null) {
            sameModelsNoCacheCost += (mb.totalTokens * pricing.input) / 1_000_000;
          } else if (mb.costUsd != null) {
            // Fallback: use actual model cost when not in the pricing table
            sameModelsNoCacheCost += mb.costUsd;
          }
        }
        // Clamp to worst-case — routing can only save costs, not increase them
        sameModelsNoCacheCost = Math.min(sameModelsNoCacheCost, worstCaseCost);
      }

      const actualCost = d.cost;
      // Clamp actual to same-models-no-cache (cache can only save costs)
      const actualCostClamped = Math.min(actualCost, sameModelsNoCacheCost);

      // Routing savings: choosing cheaper models vs worst-case
      const routingSavingsPct = Math.max(
        0,
        (worstCaseCost - sameModelsNoCacheCost) / worstCaseCost,
      );
      // Cache savings: caching on top of routing savings
      const cacheSavingsPct = Math.max(
        0,
        (sameModelsNoCacheCost - actualCostClamped) / worstCaseCost,
      );
      // Total savings (source of truth — not derived from the two above)
      const totalSavingsPct = Math.max(0, Math.min(1, 1 - actualCost / worstCaseCost));

      return {
        date: d.date,
        totalSavingsPct,
        cacheSavingsPct,
        routingSavingsPct,
        actualCost,
        worstCaseCost,
      };
    });
  }, [data, maxInputRate, maxOutputRate, pricingTable]);

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

  // Hit rects — one per data column, spanning the full chart height
  const hitRects = useMemo(() => {
    return points.map((_, i) => {
      const x = MARGIN.left + xScale(i);
      const halfGap = n > 1 ? (CHART_W / (n - 1)) / 2 : CHART_W / 2;
      return {
        x: Math.max(MARGIN.left, x - halfGap),
        width: Math.min(halfGap * 2, CHART_W),
      };
    });
  }, [n, xScale]);

  // Total savings line — segments split at gaps (null savings)
  const totalSegments = useMemo((): Array<Array<{ x: number; y: number; idx: number }>> => {
    const segs: Array<Array<{ x: number; y: number; idx: number }>> = [];
    let cur: Array<{ x: number; y: number; idx: number }> = [];
    for (let i = 0; i < n; i++) {
      const pct = points[i]!.totalSavingsPct;
      if (pct !== null) {
        cur.push({
          x: MARGIN.left + xScale(i),
          y: MARGIN.top + yScale(pct * 100),
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

  // Cache savings area — bottom stacked layer: from 0% up to cacheSavingsPct
  const cacheAreaSegments = useMemo((): Array<Array<{ x: number; yTop: number }>> => {
    const segs: Array<Array<{ x: number; yTop: number }>> = [];
    let cur: Array<{ x: number; yTop: number }> = [];
    for (let i = 0; i < n; i++) {
      const pt = points[i]!;
      if (pt.cacheSavingsPct !== null) {
        cur.push({
          x: MARGIN.left + xScale(i),
          yTop: MARGIN.top + yScale(pt.cacheSavingsPct * 100),
        });
      } else if (cur.length > 0) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) segs.push(cur);
    return segs;
  }, [points, n, xScale, yScale]);

  // Routing savings area — top stacked layer: from cacheSavingsPct up to totalSavingsPct
  const routingAreaSegments = useMemo((): Array<Array<{ x: number; yTop: number; yBottom: number }>> => {
    const segs: Array<Array<{ x: number; yTop: number; yBottom: number }>> = [];
    let cur: Array<{ x: number; yTop: number; yBottom: number }> = [];
    for (let i = 0; i < n; i++) {
      const pt = points[i]!;
      if (pt.totalSavingsPct !== null && pt.cacheSavingsPct !== null) {
        cur.push({
          x: MARGIN.left + xScale(i),
          yTop: MARGIN.top + yScale(pt.totalSavingsPct * 100),
          yBottom: MARGIN.top + yScale(pt.cacheSavingsPct * 100),
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

  const handleColumnLeave = useCallback(() => setTooltip(null), []);

  if (data.length === 0) {
    return (
      <div style={{ padding: '24px 0' }}>
        <Text fontSize="14" color="secondary">
          No data for efficiency chart.
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
        rawProps={{ style: { marginBottom: 4 } }}
      >
        Cost Savings
      </Text>
      <Text cx="block" fontSize="12" color="secondary" rawProps={{ style: { marginBottom: 8 } }}>
        Savings vs most expensive model with no caching
      </Text>
      <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${SVG_HEIGHT}`}
          width="100%"
          role="img"
          aria-label="Cost savings chart"
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

          {/* Cache savings area (green, bottom layer) */}
          {cacheAreaSegments.map((seg, si) => {
            const topPts = seg.map(({ x, yTop }) => ({ x, y: yTop }));
            const topPath = linearPath(topPts);
            const bottomY = MARGIN.top + CHART_H;
            const areaPath =
              topPts.length > 0
                ? `${topPath} L${topPts[topPts.length - 1]!.x},${bottomY} L${topPts[0]!.x},${bottomY} Z`
                : '';
            return <path key={`cache-${si}`} d={areaPath} fill={CACHE_FILL} />;
          })}

          {/* Routing savings area (blue, top layer) */}
          {routingAreaSegments.map((seg, si) => {
            const topPts = seg.map(({ x, yTop }) => ({ x, y: yTop }));
            const bottomPts = seg.map(({ x, yBottom }) => ({ x, y: yBottom }));
            const topPath = linearPath(topPts);
            const bottomPath = linearPathReverse(bottomPts);
            const areaPath = topPts.length > 0 ? `${topPath}${bottomPath} Z` : '';
            return <path key={`routing-${si}`} d={areaPath} fill={ROUTING_FILL} />;
          })}

          {/* Total savings line — first segment gets the test-id */}
          {totalSegments.map((seg, si) => {
            const pts = seg.map(({ x, y }) => ({ x, y }));
            const linePath = smoothPath(pts);
            return (
              <path
                key={`line-${si}`}
                d={linePath}
                fill="none"
                stroke={CACHE_COLOUR}
                strokeWidth={2}
                data-testid={si === 0 ? 'efficiency-line' : undefined}
              />
            );
          })}

          {/* Dots for non-null savings points */}
          {totalSegments.flatMap((seg) =>
            seg.map(({ x, y, idx }) => (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r={DOT_RADIUS}
                fill={CACHE_COLOUR}
                stroke="#fff"
                strokeWidth={1.5}
                data-testid={`efficiency-dot-${idx}`}
              />
            )),
          )}

          {/* Invisible hit targets — one per date column, full chart height */}
          {points.map((pt, i) => {
            const hr = hitRects[i]!;
            return (
              <rect
                key={`hit-${i}`}
                x={hr.x}
                y={CHART_Y}
                width={hr.width}
                height={CHART_H}
                fill="transparent"
                style={{ cursor: 'default' }}
                onMouseEnter={(e) => {
                  if (pt.totalSavingsPct == null) return;
                  const svg = svgRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  setTooltip({
                    date: pt.date,
                    totalSavingsPct: pt.totalSavingsPct,
                    cacheSavingsPct: pt.cacheSavingsPct!,
                    routingSavingsPct: pt.routingSavingsPct!,
                    actualCost: pt.actualCost!,
                    worstCaseCost: pt.worstCaseCost,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 8,
                  });
                }}
                onMouseMove={(e) => {
                  if (pt.totalSavingsPct == null) return;
                  const svg = svgRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  setTooltip((prev) =>
                    prev
                      ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top - 8 }
                      : null,
                  );
                }}
                onMouseLeave={handleColumnLeave}
                data-testid={`hit-col-${i}`}
              />
            );
          })}

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
        </svg>

        {/* HTML tooltip overlay — positioned relative to the container div */}
        {tooltip && (
          <div
            data-testid="efficiency-tooltip"
            style={{
              position: 'absolute',
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
              background: '#1e293b',
              color: '#f1f5f9',
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
              {formatShortDate(tooltip.date, granularity)}
            </div>
            <div style={{ fontWeight: 600 }}>
              Total savings: {(tooltip.totalSavingsPct * 100).toFixed(1)}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: CACHE_COLOUR,
                  flexShrink: 0,
                }}
              />
              Cache savings: {(tooltip.cacheSavingsPct * 100).toFixed(1)}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ROUTING_COLOUR,
                  flexShrink: 0,
                }}
              />
              Routing savings: {(tooltip.routingSavingsPct * 100).toFixed(1)}%
            </div>
            <div style={{ color: '#94a3b8' }}>
              You paid: {formatUsd(tooltip.actualCost)}
            </div>
            <div style={{ color: '#94a3b8' }}>
              Worst case: {formatUsd(tooltip.worstCaseCost)}
            </div>
            <div style={{ color: '#6ee7b7' }}>
              You saved: {formatUsd(tooltip.worstCaseCost - tooltip.actualCost)}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '8px 0',
          fontSize: '0.75rem',
          color: TEXT_COLOUR,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: CACHE_FILL,
              border: `1.5px solid ${CACHE_COLOUR}`,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          Cache savings
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: ROUTING_FILL,
              border: `1.5px solid ${ROUTING_COLOUR}`,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          Routing savings
        </span>
      </div>
    </div>
  );
});
