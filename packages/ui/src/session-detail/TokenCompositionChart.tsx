/**
 * SVG donut chart showing token composition by bucket type.
 *
 * Segments:
 *   - Fresh input  = inputTokens − cacheReadTokens  (billed at full rate)
 *   - Cache reads  = cacheReadTokens                (cheapest — reused context)
 *   - Output       = outputTokens                   (model-generated)
 *   - Cache writes = cacheWriteTokens               (small overhead)
 *
 * The centre text shows the cache-hit percentage (cacheReadTokens / inputTokens),
 * giving an at-a-glance signal of how well the session reuses cached context.
 * A high cache-hit rate means the agent is efficiently re-using earlier context
 * rather than re-sending it as fresh (more expensive) input.
 */

import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatTokenCost, formatTokenCount } from '../comparative/format';
import { TimelineTooltip } from '../timeline/TimelineTooltip';
import type { TooltipContent } from '../timeline/types';
import { useTimelineTooltip } from '../timeline/useTimelineTooltip';

import type { ModelSpendResult } from './model-spend';
import styles from './session-detail.module.css';

/* --- SVG layout constants (match ModelTokenDistribution) ----------------- */

const CX = 120;
const CY = 108;
const RADIUS = 52;
const STROKE_WIDTH = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const LEGEND_START_Y = 188;
const LEGEND_ROW_HEIGHT = 22;

/* --- Types ---------------------------------------------------------------- */

interface TokenBucket {
  readonly label: string;
  readonly tokens: number;
  readonly colour: string;
  readonly costUsd: number;
}

/* --- Props ---------------------------------------------------------------- */

export interface TokenCompositionChartProps {
  readonly modelSpend: ModelSpendResult | null;
}

/* --- Component ----------------------------------------------------------- */

function TokenCompositionChartInner({ modelSpend }: TokenCompositionChartProps) {
  const buckets = useMemo((): readonly TokenBucket[] => {
    if (!modelSpend) return [];

    const { totals } = modelSpend;
    const freshInput = Math.max(0, totals.inputTokens - totals.cacheReadTokens);

    return [
      { label: 'Fresh input', tokens: freshInput, colour: 'var(--uui-warning-50)', costUsd: totals.inputCostUsd },
      { label: 'Cache reads', tokens: totals.cacheReadTokens, colour: 'var(--uui-success-50)', costUsd: totals.cacheReadCostUsd },
      { label: 'Output', tokens: totals.outputTokens, colour: 'var(--uui-primary-50)', costUsd: totals.outputCostUsd },
      { label: 'Cache writes', tokens: totals.cacheWriteTokens, colour: 'var(--uui-info-50)', costUsd: totals.cacheWriteCostUsd },
    ].filter((b) => b.tokens > 0);
  }, [modelSpend]);

  const { state: tooltipState, handlers: tooltip, tooltipRef } = useTimelineTooltip();

  if (!modelSpend) {
    return (
      <Text size="18" color="secondary">
        No token data available.
      </Text>
    );
  }

  const grandTotal = buckets.reduce((sum, b) => sum + b.tokens, 0);

  if (grandTotal === 0) {
    return (
      <Text size="18" color="secondary">
        No token usage recorded.
      </Text>
    );
  }

  const withProportions = buckets.map((b) => ({ ...b, proportion: b.tokens / grandTotal }));

  let cumulativeProportion = 0;
  const arcs = withProportions.map((bucket) => {
    const dashLength = bucket.proportion * CIRCUMFERENCE;
    const dashOffset = CIRCUMFERENCE * (1 - cumulativeProportion);
    cumulativeProportion += bucket.proportion;
    const pct = Math.round(bucket.proportion * 100);
    const rows: { key: string; value: string }[] = [
      { key: 'Tokens', value: `${formatTokenCount(bucket.tokens)} (${pct}%)` },
    ];
    if (bucket.costUsd > 0) {
      rows.push({ key: 'Est. cost', value: formatTokenCost(bucket.costUsd) });
    }
    const tooltipContent: TooltipContent = { header: bucket.label, rows };
    return { ...bucket, dashLength, dashOffset, tooltipContent };
  });

  const { totals } = modelSpend;
  const cacheHitPct =
    totals.inputTokens > 0
      ? Math.round((totals.cacheReadTokens / totals.inputTokens) * 100)
      : 0;

  const svgHeight = LEGEND_START_Y + buckets.length * LEGEND_ROW_HEIGHT + 12;

  const ariaLabel = `Token composition: ${withProportions
    .map((b) => `${b.label} ${Math.round(b.proportion * 100)}%`)
    .join(', ')}`;

  return (
    <div className={styles.contextDonutContainer}>
      <svg
        viewBox={`0 0 240 ${svgHeight}`}
        className={styles.contextDonutSvg}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Title */}
        <text
          x={CX}
          y={16}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--uui-text-primary)"
        >
          Token composition
        </text>

        {/* Background track */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--uui-neutral-20)"
          strokeWidth={STROKE_WIDTH}
        />

        {/* Arcs, rotated so the first arc starts at 12 o'clock */}
        <g transform={`rotate(-90, ${CX}, ${CY})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={CX}
              cy={CY}
              r={RADIUS}
              fill="none"
              stroke={arc.colour}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${arc.dashLength} ${CIRCUMFERENCE - arc.dashLength}`}
              strokeDashoffset={arc.dashOffset}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => { tooltip.show(arc.tooltipContent, e); }}
              onMouseMove={tooltip.move}
              onMouseLeave={tooltip.hide}
            >
              <title>{`${arc.label}: ${formatTokenCount(arc.tokens)} (${Math.round(arc.proportion * 100)}%)${arc.costUsd > 0 ? ` — ${formatTokenCost(arc.costUsd)}` : ''}`}</title>
            </circle>
          ))}
        </g>

        {/* Centre text: cache-hit percentage */}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill="var(--uui-text-primary)"
        >
          {cacheHitPct}%
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          fontSize={9}
          fill="var(--uui-text-secondary)"
        >
          cache hit
        </text>

        {/* Legend */}
        {withProportions.map((bucket, index) => {
          const y = LEGEND_START_Y + index * LEGEND_ROW_HEIGHT;
          const pct = Math.round(bucket.proportion * 100);
          return (
            <g key={bucket.label}>
              <circle cx={18} cy={y - 4} r={5} fill={bucket.colour} />
              <text x={30} y={y} fontSize={11} fill="var(--uui-text-primary)">
                {bucket.label}
              </text>
              <text x={228} y={y} fontSize={11} textAnchor="end" fill="var(--uui-text-secondary)">
                {formatTokenCount(bucket.tokens)} ({pct}%)
              </text>
            </g>
          );
        })}
      </svg>
      <TimelineTooltip state={tooltipState} tooltipRef={tooltipRef} />
    </div>
  );
}

export const TokenCompositionChart = memo(TokenCompositionChartInner);
TokenCompositionChart.displayName = 'TokenCompositionChart';
