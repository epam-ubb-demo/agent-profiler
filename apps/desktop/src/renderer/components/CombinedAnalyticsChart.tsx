/**
 * SVG dual-axis chart: cost line (left Y-axis, USD) + stacked model token areas (right Y-axis).
 *
 * Hand-crafted SVG — no external charting library.
 */

import { Text } from '@epam/uui';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { smoothPath, smoothPathReverse } from './svg-path-utils';

/* ─── Props ─────────────────────────────────────────────────────────────────── */

export interface DailyAnalytics {
  readonly date: string;
  /** Null when no session in this day had cost data. */
  readonly cost: number | null;
  /** Average tokens per cost (total tokens / cost). Null when cost is 0 or null. */
  readonly avgTokensPerCost: number | null;
  /** Null when no session in this day had wall-time data. */
  readonly wallTimeMs: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** Per-model token breakdown for this day */
  readonly modelBreakdown: ReadonlyArray<{
    readonly model: string;
    readonly totalTokens: number;
    /** Null when the model is not in the pricing table (cost unknown). */
    readonly costUsd: number | null;
  }>;
}

export type Granularity = 'day' | 'week' | 'month';

export interface CombinedAnalyticsChartProps {
  readonly data: ReadonlyArray<DailyAnalytics>;
  readonly granularity?: Granularity | undefined;
}

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const MARGIN_TOP = 16;
const MARGIN_RIGHT = 44; // right Y-axis (tokens)
const MARGIN_BOTTOM = 28; // room for x-axis labels
const MARGIN_LEFT = 52; // room for y-axis labels (dual-axis: "$300.00" needs ~50px)

const SVG_HEIGHT = 180;

/** These are stable aliases for the fixed margins — they never change with container size. */
const CHART_X = MARGIN_LEFT;
const CHART_Y = MARGIN_TOP;

const DOT_RADIUS = 4;

/* ─── Colours ────────────────────────────────────────────────────────────────── */

const MODEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#d946ef',
];

const OTHER_COLOUR = '#9ca3af';
const AVG_TK_COST_SERIES_KEY = '__avg_tk_cost__';

function modelColour(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash = ((hash << 5) - hash + model.charCodeAt(i)) | 0;
  return MODEL_PALETTE[Math.abs(hash) % MODEL_PALETTE.length]!;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatBucketLabel(dateKey: string, granularity: Granularity): string {
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

function formatBucketTooltip(dateKey: string, granularity: Granularity): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  if (granularity === 'month') {
    return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (granularity === 'week') {
    return `Week commencing ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

function formatTokensPerCost(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M/$`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K/$`;
  return `${value}/$`;
}

function formatTk(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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

/* ─── Tooltip state ──────────────────────────────────────────────────────────── */

interface TooltipState {
  readonly item: DailyAnalytics;
  /** Model keys in stack order (may include "Other"). */
  readonly stackOrder: ReadonlyArray<string>;
  /** Set of top-model names (excludes "Other"). Used to compute "Other" bucket. */
  readonly topModelSet: ReadonlySet<string>;
  readonly x: number;
  readonly y: number;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

function CombinedAnalyticsChartInner({ data, granularity = 'day' }: CombinedAnalyticsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  const [chartWidth, setChartWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]!.contentRect.width);
      if (w > 0) setChartWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleColumnLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ── Derived geometry from current container dimensions ─────────────────────
  const svgH = SVG_HEIGHT;
  const CHART_W = Math.max(chartWidth - MARGIN_LEFT - MARGIN_RIGHT, 1);
  const CHART_H = Math.max(svgH - MARGIN_TOP - MARGIN_BOTTOM, 1);

  const computed = useMemo(() => {
    if (data.length === 0) return null;

    const n = data.length;

    // ── Avg tokens per cost axis ─────────────────────────────────────────────
    const maxAvgTkCost = Math.max(...data.map((d) => d.avgTokensPerCost ?? 0));
    const avgTkCostNiceStep = computeNiceStep(maxAvgTkCost > 0 ? maxAvgTkCost * 1.1 : 100);
    const avgTkCostYMax =
      maxAvgTkCost > 0 ? Math.ceil((maxAvgTkCost * 1.1) / avgTkCostNiceStep) * avgTkCostNiceStep : avgTkCostNiceStep;
    const avgTkCostYTicks: number[] = [];
    for (let v = 0; v <= avgTkCostYMax + avgTkCostNiceStep * 0.5; v += avgTkCostNiceStep) {
      avgTkCostYTicks.push(v);
    }

    // ── Model ordering ────────────────────────────────────────────────────────
    const modelTotals = new Map<string, number>();
    for (const day of data) {
      for (const mb of day.modelBreakdown) {
        modelTotals.set(mb.model, (modelTotals.get(mb.model) ?? 0) + mb.totalTokens);
      }
    }
    const sortedModels = Array.from(modelTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);

    const TOP_N = 8;
    const topModels = sortedModels.slice(0, TOP_N);
    const topModelSet = new Set(topModels);
    const hasOther = sortedModels.length > TOP_N;
    const stackOrder: string[] = [...topModels, ...(hasOther ? ['Other'] : [])];

    // ── Per-day token counts per model key (top or "Other") ──────────────────
    const dayModelTokens = data.map((day) => {
      const tokens = new Map<string, number>();
      for (const mb of day.modelBreakdown) {
        const key = topModelSet.has(mb.model) ? mb.model : 'Other';
        tokens.set(key, (tokens.get(key) ?? 0) + mb.totalTokens);
      }
      return tokens;
    });

    // ── Token axis (based on max stacked height) ──────────────────────────────
    const dayTokenTotals = data.map((_, dayIdx) => {
      let total = 0;
      for (const modelKey of stackOrder) {
        total += dayModelTokens[dayIdx]!.get(modelKey) ?? 0;
      }
      return total;
    });
    const maxTokens = Math.max(...dayTokenTotals, 0);
    const tokenNiceStep = computeNiceStep(maxTokens > 0 ? maxTokens * 1.1 : 1000);
    const tokenYMax =
      maxTokens > 0 ? Math.ceil((maxTokens * 1.1) / tokenNiceStep) * tokenNiceStep : tokenNiceStep;
    const tokenYTicks: number[] = [];
    for (let v = 0; v <= tokenYMax + tokenNiceStep * 0.5; v += tokenNiceStep) {
      tokenYTicks.push(v);
    }

    // ── Empty check (keep axis domains for all data; only skip render if truly empty) ──
    const hasAnyAvgTkCost = maxAvgTkCost > 0;
    const hasAnyTokens = maxTokens > 0;
    if (!hasAnyAvgTkCost && !hasAnyTokens) return null;

    // ── X positions ───────────────────────────────────────────────────────────
    const slotW = n > 1 ? CHART_W / (n - 1) : 0;
    const xPositions = data.map((_, i) =>
      n > 1 ? CHART_X + slotW * i : CHART_X + CHART_W / 2,
    );

    // ── Avg tokens per cost line segments (break on null) ────────────────────
    const avgTkCostPointsY = data.map((item) =>
      item.avgTokensPerCost != null ? CHART_Y + CHART_H - (item.avgTokensPerCost / avgTkCostYMax) * CHART_H : null,
    );

    const avgTkCostSegments: Array<Array<{ x: number; y: number }>> = [];
    let currentSeg: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const y = avgTkCostPointsY[i];
      if (y !== null && y !== undefined) {
        currentSeg.push({ x: xPositions[i]!, y });
      } else if (currentSeg.length > 0) {
        avgTkCostSegments.push(currentSeg);
        currentSeg = [];
      }
    }
    if (currentSeg.length > 0) avgTkCostSegments.push(currentSeg);

    const avgTkCostLinePaths = avgTkCostSegments.map((seg) => smoothPath(seg));

    // ── Stacked model areas ───────────────────────────────────────────────────
    function tokenToY(tokens: number): number {
      return CHART_Y + CHART_H - (tokens / tokenYMax) * CHART_H;
    }

    // Cumulative stacks: cumulTokens[dayIdx][0] = 0 (baseline),
    //                    cumulTokens[dayIdx][k+1] = bottom of model k+1
    const cumulTokens: number[][] = data.map((_, dayIdx) => {
      const cumul: number[] = [0];
      for (const modelKey of stackOrder) {
        const prev = cumul[cumul.length - 1]!;
        cumul.push(prev + (dayModelTokens[dayIdx]!.get(modelKey) ?? 0));
      }
      return cumul;
    });

    // Generate smooth paths for ALL cumulative levels first (ensures alignment between layers)
    const cumulativePaths = Array.from({ length: stackOrder.length + 1 }, (_, levelIdx) => {
      if (n === 1) {
        const x = xPositions[0]!;
        const y = tokenToY(cumulTokens[0]![levelIdx]!);
        return { path: `M${x},${y}`, points: [{ x, y }] };
      }
      const points = data.map((_, dayIdx) => ({
        x: xPositions[dayIdx]!,
        y: tokenToY(cumulTokens[dayIdx]![levelIdx]!),
      }));
      return { path: smoothPath(points), points };
    });

    const modelAreaPaths = stackOrder.map((_, mIdx) => {
      if (n === 1) {
        const top = tokenToY(cumulTokens[0]![mIdx + 1]!);
        const bottom = tokenToY(cumulTokens[0]![mIdx]!);
        const x = xPositions[0]!;
        return `M${x - 3},${top} L${x + 3},${top} L${x + 3},${bottom} L${x - 3},${bottom} Z`;
      }
      // Use pre-generated smooth paths for both edges (ensures layers align perfectly)
      const topPath = cumulativePaths[mIdx + 1]!.path;
      const bottomPath = smoothPathReverse(cumulativePaths[mIdx]!.points);
      
      return `${topPath}${bottomPath} Z`;
    });

    // ── X-axis labels ─────────────────────────────────────────────────────────
    const maxLabels = Math.min(n, 8);
    const labelIndices =
      maxLabels <= 1
        ? [0]
        : Array.from({ length: maxLabels }, (_, i) =>
            Math.round((i * (n - 1)) / (maxLabels - 1)),
          );

    // ── Hit rect (per-column, full chart height) ──────────────────────────────
    const hitRects = xPositions.map((x, i) => {
      const leftEdge = i === 0 ? CHART_X : x - slotW / 2;
      const rightEdge = i === n - 1 ? CHART_X + CHART_W : x + slotW / 2;
      return { x: leftEdge, width: rightEdge - leftEdge };
    });

    return {
      avgTkCostYTicks,
      avgTkCostYMax,
      tokenYTicks,
      tokenYMax,
      avgTkCostLinePaths,
      avgTkCostPointsY,
      modelAreaPaths,
      stackOrder,
      topModelSet,
      xPositions,
      labelIndices,
      hitRects,
    };
  }, [data, CHART_W, CHART_H]);

  if (data.length === 0 || computed === null) {
    return (
      <Text size="18" color="secondary">
        No analytics data
      </Text>
    );
  }

  const {
    avgTkCostYTicks,
    avgTkCostYMax,
    tokenYTicks,
    tokenYMax,
    avgTkCostLinePaths,
    avgTkCostPointsY,
    modelAreaPaths,
    stackOrder,
    topModelSet,
    xPositions,
    labelIndices,
    hitRects,
  } = computed;

  const axisBaseY = CHART_Y + CHART_H;

  const legendItems: Array<{ key: string; label: string; colour: string }> = [
    { key: AVG_TK_COST_SERIES_KEY, label: 'Avg tokens per cost', colour: 'var(--uui-primary-50)' },
    ...stackOrder.map((model) => ({
      key: model,
      label: model,
      colour: model === 'Other' ? OTHER_COLOUR : modelColour(model),
    })),
  ];

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      <Text
        cx="block"
        fontSize="14"
        fontWeight="600"
        rawProps={{ style: { marginBottom: 4 } }}
      >
        Timeline
      </Text>
      <Text cx="block" fontSize="12" color="secondary" rawProps={{ style: { marginBottom: 8 } }}>
        Cost and model token usage over time
      </Text>
      <svg
        ref={svgRef}
        width={chartWidth}
        height={svgH}
        style={{ display: 'block' }}
        role="img"
        aria-label="Combined analytics chart: daily average tokens per cost and model token usage"
        data-testid="combined-analytics-chart"
      >
        {/* Clip path to enforce chart bounds */}
        <defs>
          <clipPath id="chart-clip">
            <rect x={CHART_X} y={CHART_Y} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Left Y-axis gridlines + labels (avg tokens per cost) */}
        {avgTkCostYTicks.map((v) => {
          const y = CHART_Y + CHART_H - (v / avgTkCostYMax) * CHART_H;
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
                fill="var(--uui-primary-50)"
              >
                {formatTokensPerCost(v)}
              </text>
            </g>
          );
        })}

        {/* Right Y-axis labels (tokens) — no separate gridlines */}
        {tokenYTicks.map((v) => {
          const y = CHART_Y + CHART_H - (v / tokenYMax) * CHART_H;
          return (
            <text
              key={v}
              x={CHART_X + CHART_W + 6}
              y={y + 4}
              textAnchor="start"
              fontSize={10}
              fill="var(--uui-text-tertiary)"
            >
              {formatTk(v)}
            </text>
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

        {/* Chart content with clipping */}
        <g clipPath="url(#chart-clip)">
          {/* Stacked model areas (bottom layer) */}
          {stackOrder.map((model, mIdx) => {
            if (hiddenSeries.has(model)) return null;
            const colour = model === 'Other' ? OTHER_COLOUR : modelColour(model);
            return (
              <path
                key={model}
                d={modelAreaPaths[mIdx]!}
                fill={colour}
                opacity={0.6}
                data-testid={`model-area-${mIdx}`}
              />
            );
          })}

          {/* Avg tokens per cost line — first segment gets the testid */}
          {!hiddenSeries.has(AVG_TK_COST_SERIES_KEY) &&
            avgTkCostLinePaths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--uui-primary-50)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                {...(i === 0 ? { 'data-testid': 'avg-tk-cost-line' } : {})}
              />
            ))}

        {/* Avg tokens per cost data points (visible dots for non-null avgTokensPerCost) */}
        {!hiddenSeries.has(AVG_TK_COST_SERIES_KEY) &&
          xPositions.map((x, i) => {
            const y = avgTkCostPointsY[i];
            if (y == null) return null;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={DOT_RADIUS}
                fill="var(--uui-primary-50)"
                stroke="#fff"
                strokeWidth={2}
                data-testid="avg-tk-cost-point"
              />
            );
          })}
        </g> {/* End chart content clipping */}

        {/* Invisible hit targets — one per date column, full chart height */}
        {xPositions.map((_, i) => {
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
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                setTooltip({
                  item: data[i]!,
                  stackOrder,
                  topModelSet,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top - 8,
                });
              }}
              onMouseMove={(e) => {
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

        {/* X-axis date labels */}
        {labelIndices.map((idx) => {
          const x = xPositions[idx];
          if (x == null) return null;
          return (
            <text
              key={idx}
              x={x}
              y={axisBaseY + 14}
              textAnchor="middle"
              fontSize={10}
              fill="var(--uui-text-secondary)"
            >
              {formatBucketLabel(data[idx]!.date, granularity)}
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
            {formatBucketTooltip(tooltip.item.date, granularity)}
          </div>
          <div>
            Avg tokens per cost: {tooltip.item.avgTokensPerCost != null ? formatTokensPerCost(tooltip.item.avgTokensPerCost) : '—'}
          </div>
          <div>Cost: {tooltip.item.cost != null ? formatUsd(tooltip.item.cost) : '—'}</div>
          <div>
            Time: {tooltip.item.wallTimeMs != null ? formatMs(tooltip.item.wallTimeMs) : '—'}
          </div>
          <div>In: {formatTk(tooltip.item.inputTokens)} tk</div>
          <div>Out: {formatTk(tooltip.item.outputTokens)} tk</div>
          <div>Cached: {formatTk(tooltip.item.cacheReadTokens)} tk</div>
          <hr
            style={{
              border: 'none',
              borderTop: '1px solid rgba(255,255,255,0.2)',
              margin: '4px 0',
            }}
          />
          {tooltip.stackOrder.map((modelKey) => {
            let tokens = 0;
            let costUsd: number | null = null;
            if (modelKey === 'Other') {
              for (const mb of tooltip.item.modelBreakdown) {
                if (!tooltip.topModelSet.has(mb.model)) {
                  tokens += mb.totalTokens;
                  if (mb.costUsd != null) costUsd = (costUsd ?? 0) + mb.costUsd;
                }
              }
            } else {
              for (const mb of tooltip.item.modelBreakdown) {
                if (mb.model === modelKey) {
                  tokens += mb.totalTokens;
                  if (mb.costUsd != null) costUsd = (costUsd ?? 0) + mb.costUsd;
                }
              }
            }
            return (
              <div
                key={modelKey}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: modelKey === 'Other' ? OTHER_COLOUR : modelColour(modelKey),
                      flexShrink: 0,
                    }}
                  />
                  {modelKey}
                </span>
                <span>
                  {formatTk(tokens)} tk{costUsd != null ? ` · ${formatUsd(costUsd)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Toggleable legend */}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}
        data-testid="chart-legend"
      >
        {legendItems.map(({ key, label, colour }) => (
          <button
            type="button"
            key={key}
            aria-pressed={!hiddenSeries.has(key)}
            onClick={() => toggleSeries(key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              opacity: hiddenSeries.has(key) ? 0.5 : 1,
              fontSize: '0.75rem',
              color: 'inherit',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: colour,
                flexShrink: 0,
              }}
            />
            <span style={{ textDecoration: hiddenSeries.has(key) ? 'line-through' : 'none' }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export const CombinedAnalyticsChart = memo(CombinedAnalyticsChartInner);
CombinedAnalyticsChart.displayName = 'CombinedAnalyticsChart';
