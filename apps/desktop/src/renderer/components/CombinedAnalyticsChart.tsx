/**
 * SVG dual-axis chart: cost line (left Y-axis, USD) + stacked model token areas (right Y-axis).
 *
 * Hand-crafted SVG — no external charting library.
 */

import { Text } from '@epam/uui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

/* ─── Props ─────────────────────────────────────────────────────────────────── */

export interface DailyAnalytics {
  readonly date: string;
  /** Null when no session in this day had cost data. */
  readonly cost: number | null;
  /** Null when no session in this day had wall-time data. */
  readonly wallTimeMs: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  /** Per-model token breakdown for this day */
  readonly modelBreakdown: ReadonlyArray<{ readonly model: string; readonly totalTokens: number }>;
}

export interface CombinedAnalyticsChartProps {
  readonly data: ReadonlyArray<DailyAnalytics>;
}

/* ─── Chart geometry ────────────────────────────────────────────────────────── */

const VIEW_W = 800;
const VIEW_H = 200;

const MARGIN_TOP = 20;
const MARGIN_RIGHT = 60; // right Y-axis (tokens)
const MARGIN_BOTTOM = 40; // room for x-axis labels
const MARGIN_LEFT = 60; // room for y-axis labels

const CHART_X = MARGIN_LEFT;
const CHART_Y = MARGIN_TOP;
const CHART_W = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT;
const CHART_H = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM;

const DOT_RADIUS = 4;

/* ─── Colours ────────────────────────────────────────────────────────────────── */

const MODEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#d946ef',
];

const OTHER_COLOUR = '#9ca3af';
const COST_SERIES_KEY = '__cost__';

function modelColour(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash = ((hash << 5) - hash + model.charCodeAt(i)) | 0;
  return MODEL_PALETTE[Math.abs(hash) % MODEL_PALETTE.length]!;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
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

function CombinedAnalyticsChartInner({ data }: CombinedAnalyticsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());

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

  const computed = useMemo(() => {
    if (data.length === 0) return null;

    const n = data.length;

    // ── Cost axis ─────────────────────────────────────────────────────────────
    const maxCost = Math.max(...data.map((d) => d.cost ?? 0));
    const costNiceStep = computeNiceStep(maxCost > 0 ? maxCost * 1.1 : 0.01);
    const costYMax =
      maxCost > 0 ? Math.ceil((maxCost * 1.1) / costNiceStep) * costNiceStep : costNiceStep;
    const costYTicks: number[] = [];
    for (let v = 0; v <= costYMax + costNiceStep * 0.5; v += costNiceStep) {
      costYTicks.push(v);
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

    // ── Token axis ────────────────────────────────────────────────────────────
    const dayTokenTotals = data.map((day) =>
      day.modelBreakdown.reduce((sum, mb) => sum + mb.totalTokens, 0),
    );
    const maxTokens = Math.max(...dayTokenTotals, 0);
    const tokenNiceStep = computeNiceStep(maxTokens > 0 ? maxTokens * 1.1 : 1000);
    const tokenYMax =
      maxTokens > 0 ? Math.ceil((maxTokens * 1.1) / tokenNiceStep) * tokenNiceStep : tokenNiceStep;
    const tokenYTicks: number[] = [];
    for (let v = 0; v <= tokenYMax + tokenNiceStep * 0.5; v += tokenNiceStep) {
      tokenYTicks.push(v);
    }

    // ── Empty check (keep axis domains for all data; only skip render if truly empty) ──
    const hasAnyCost = maxCost > 0;
    const hasAnyTokens = maxTokens > 0;
    if (!hasAnyCost && !hasAnyTokens) return null;

    // ── X positions ───────────────────────────────────────────────────────────
    const slotW = n > 1 ? CHART_W / (n - 1) : 0;
    const xPositions = data.map((_, i) =>
      n > 1 ? CHART_X + slotW * i : CHART_X + CHART_W / 2,
    );

    // ── Cost line segments (break on null) ────────────────────────────────────
    const costPointsY = data.map((item) =>
      item.cost != null ? CHART_Y + CHART_H - (item.cost / costYMax) * CHART_H : null,
    );

    const costSegments: Array<Array<{ x: number; y: number }>> = [];
    let currentSeg: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const y = costPointsY[i];
      if (y !== null && y !== undefined) {
        currentSeg.push({ x: xPositions[i]!, y });
      } else if (currentSeg.length > 0) {
        costSegments.push(currentSeg);
        currentSeg = [];
      }
    }
    if (currentSeg.length > 0) costSegments.push(currentSeg);

    const costLinePaths = costSegments.map((seg) =>
      seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '),
    );
    const costAreaPaths = costSegments.map((seg) => {
      if (seg.length === 0) return '';
      const line = seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      return (
        line +
        ` L${seg[seg.length - 1]!.x},${CHART_Y + CHART_H}` +
        ` L${seg[0]!.x},${CHART_Y + CHART_H} Z`
      );
    });

    // ── Stacked model areas ───────────────────────────────────────────────────
    function tokenToY(tokens: number): number {
      return CHART_Y + CHART_H - (tokens / tokenYMax) * CHART_H;
    }

    // Per-day token counts per model key (top or "Other")
    const dayModelTokens = data.map((day) => {
      const tokens = new Map<string, number>();
      for (const mb of day.modelBreakdown) {
        const key = topModelSet.has(mb.model) ? mb.model : 'Other';
        tokens.set(key, (tokens.get(key) ?? 0) + mb.totalTokens);
      }
      return tokens;
    });

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

    const modelAreaPaths = stackOrder.map((_, mIdx) => {
      if (n === 1) {
        const top = tokenToY(cumulTokens[0]![mIdx + 1]!);
        const bottom = tokenToY(cumulTokens[0]![mIdx]!);
        const x = xPositions[0]!;
        return `M${x - 3},${top} L${x + 3},${top} L${x + 3},${bottom} L${x - 3},${bottom} Z`;
      }
      const topEdge = data.map((_, dayIdx) => ({
        x: xPositions[dayIdx]!,
        y: tokenToY(cumulTokens[dayIdx]![mIdx + 1]!),
      }));
      const bottomEdge = data.map((_, dayIdx) => ({
        x: xPositions[dayIdx]!,
        y: tokenToY(cumulTokens[dayIdx]![mIdx]!),
      }));
      const topPath = topEdge.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const bottomPath = [...bottomEdge]
        .reverse()
        .map((p) => `L${p.x},${p.y}`)
        .join(' ');
      return `${topPath} ${bottomPath} Z`;
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
      costYTicks,
      costYMax,
      tokenYTicks,
      tokenYMax,
      costLinePaths,
      costAreaPaths,
      costPointsY,
      modelAreaPaths,
      stackOrder,
      topModelSet,
      xPositions,
      labelIndices,
      hitRects,
    };
  }, [data]);

  if (data.length === 0 || computed === null) {
    return (
      <Text size="18" color="secondary">
        No analytics data
      </Text>
    );
  }

  const {
    costYTicks,
    costYMax,
    tokenYTicks,
    tokenYMax,
    costLinePaths,
    costAreaPaths,
    costPointsY,
    modelAreaPaths,
    stackOrder,
    topModelSet,
    xPositions,
    labelIndices,
    hitRects,
  } = computed;

  const axisBaseY = CHART_Y + CHART_H;

  const legendItems: Array<{ key: string; label: string; colour: string }> = [
    { key: COST_SERIES_KEY, label: 'Cost', colour: 'var(--uui-primary-50)' },
    ...stackOrder.map((model) => ({
      key: model,
      label: model,
      colour: model === 'Other' ? OTHER_COLOUR : modelColour(model),
    })),
  ];

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        style={{ display: 'block' }}
        role="img"
        aria-label="Combined analytics chart: daily cost and model token usage"
        data-testid="combined-analytics-chart"
      >
        {/* Left Y-axis gridlines + labels (cost USD) */}
        {costYTicks.map((v) => {
          const y = CHART_Y + CHART_H - (v / costYMax) * CHART_H;
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
                {formatUsd(v)}
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

        {/* Cost area fill */}
        {!hiddenSeries.has(COST_SERIES_KEY) &&
          costAreaPaths.map((d, i) => (
            <path key={i} d={d} fill="var(--uui-primary-50)" opacity={0.15} />
          ))}

        {/* Cost line — first segment gets the testid */}
        {!hiddenSeries.has(COST_SERIES_KEY) &&
          costLinePaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="var(--uui-primary-50)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              {...(i === 0 ? { 'data-testid': 'cost-line' } : {})}
            />
          ))}

        {/* Cost data points (visible dots for non-null cost) */}
        {!hiddenSeries.has(COST_SERIES_KEY) &&
          xPositions.map((x, i) => {
            const y = costPointsY[i];
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
                data-testid="cost-point"
              />
            );
          })}

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
              {formatShortDate(data[idx]!.date)}
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
            {formatShortDate(tooltip.item.date)}
          </div>
          <div>Cost: {tooltip.item.cost != null ? formatUsd(tooltip.item.cost) : '—'}</div>
          <div>
            Time: {tooltip.item.wallTimeMs != null ? formatMs(tooltip.item.wallTimeMs) : '—'}
          </div>
          <hr
            style={{
              border: 'none',
              borderTop: '1px solid rgba(255,255,255,0.2)',
              margin: '4px 0',
            }}
          />
          {tooltip.stackOrder.map((modelKey) => {
            let tokens = 0;
            if (modelKey === 'Other') {
              for (const mb of tooltip.item.modelBreakdown) {
                if (!tooltip.topModelSet.has(mb.model)) tokens += mb.totalTokens;
              }
            } else {
              for (const mb of tooltip.item.modelBreakdown) {
                if (mb.model === modelKey) tokens += mb.totalTokens;
              }
            }
            return (
              <div key={modelKey}>
                {modelKey}: {formatTk(tokens)} tokens
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
