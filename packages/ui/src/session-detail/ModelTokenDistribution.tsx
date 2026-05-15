/**
 * SVG donut chart showing per-model token distribution.
 *
 * Each model's combined input+output tokens is rendered as a proportional
 * arc segment.  Models representing less than 3 % of total are collapsed
 * into an "Other" segment when more than 5 models are present.
 *
 * Arc geometry uses the stroke-dasharray / stroke-dashoffset technique —
 * matches ContextWindowBar exactly.  No external charting library.
 */

import type { ModelMetrics } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatTokenCost, formatTokenCount } from '../comparative/format';
import { TimelineTooltip } from '../timeline/TimelineTooltip';
import type { TooltipContent } from '../timeline/types';
import { useTimelineTooltip } from '../timeline/useTimelineTooltip';

import styles from './session-detail.module.css';

export interface ModelTokenDistributionProps {
  readonly modelColours: Record<string, string>;
  readonly modelMetrics: readonly ModelMetrics[];
  readonly costByModel?: Record<string, number>;
}

/* --- SVG layout constants (match ContextWindowBar) ---------------------- */

const CX = 120;
const CY = 108;
const RADIUS = 52;
const STROKE_WIDTH = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const LEGEND_START_Y = 188;
const LEGEND_ROW_HEIGHT = 22;

/* --- Types --------------------------------------------------------------- */

interface Segment {
  readonly model: string;
  readonly tokens: number;
  readonly proportion: number;
  readonly colour: string;
}

/* --- Helpers ------------------------------------------------------------- */

/** Truncate a model name to at most `max` characters, appending "…". */
function truncateName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/* --- Component ----------------------------------------------------------- */

function ModelTokenDistributionInner({ modelColours, modelMetrics, costByModel }: ModelTokenDistributionProps) {
  const segments = useMemo((): readonly Segment[] => {
    if (modelMetrics.length === 0) return [];

    const withTokens = modelMetrics.map((m) => ({
      model: m.model,
      tokens: m.inputTokens + m.outputTokens,
      colour: modelColours[m.model] ?? 'var(--uui-neutral-50)',
    }));

    const grandTotal = withTokens.reduce((sum, m) => sum + m.tokens, 0);
    if (grandTotal === 0) return [];

    /* Sort descending by token count. */
    const sorted = [...withTokens].sort((a, b) => b.tokens - a.tokens);

    /* Aggregate tiny models into "Other" when >5 total. */
    let finalModels = sorted;
    if (sorted.length > 5) {
      const threshold = grandTotal * 0.03;
      const significant = sorted.filter((m) => m.tokens >= threshold);
      const others = sorted.filter((m) => m.tokens < threshold);
      if (others.length > 0) {
        const otherTokens = others.reduce((sum, m) => sum + m.tokens, 0);
        finalModels = [
          ...significant,
          { model: 'Other', tokens: otherTokens, colour: 'var(--uui-neutral-50)' },
        ];
      }
    }

    return finalModels.map((m) => ({
      ...m,
      proportion: m.tokens / grandTotal,
    }));
  }, [modelMetrics, modelColours]);

  const { state: tooltipState, handlers: tooltip, tooltipRef } = useTimelineTooltip();

  /* --- Edge cases -------------------------------------------------------- */

  if (modelMetrics.length === 0) {
    return (
      <Text size="18" color="secondary">
        No model metrics available.
      </Text>
    );
  }

  const grandTotal = segments.reduce((sum, s) => sum + s.tokens, 0);

  if (grandTotal === 0) {
    return (
      <Text size="18" color="secondary">
        No token usage recorded.
      </Text>
    );
  }

  /* --- Arc descriptors -------------------------------------------------- */

  let cumulativeProportion = 0;
  const arcs = segments.map((seg) => {
    const dashLength = seg.proportion * CIRCUMFERENCE;
    const dashOffset = CIRCUMFERENCE * (1 - cumulativeProportion);
    cumulativeProportion += seg.proportion;
    const cost = costByModel?.[seg.model] ?? 0;
    const costSuffix = cost > 0 ? ` — ${formatTokenCost(cost)}` : '';
    const pct = Math.round(seg.proportion * 100);
    const rows: { key: string; value: string }[] = [
      { key: 'Tokens', value: `${formatTokenCount(seg.tokens)} (${pct}%)` },
    ];
    if (cost > 0) {
      rows.push({ key: 'Est. cost', value: formatTokenCost(cost) });
    }
    const tooltipContent: TooltipContent = { header: seg.model, rows };
    return { ...seg, dashLength, dashOffset, costSuffix, tooltipContent };
  });

  /* --- Layout ----------------------------------------------------------- */

  const svgHeight = LEGEND_START_Y + segments.length * LEGEND_ROW_HEIGHT + 12;

  const ariaLabel = `Token distribution by model: ${segments
    .map((s) => `${s.model} ${Math.round(s.proportion * 100)}%`)
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
          Token distribution by model
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

        {/* Model arcs, rotated so the first arc begins at 12 o'clock */}
        <g transform={`rotate(-90, ${CX}, ${CY})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.model}
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
              <title>{`${arc.model}: ${formatTokenCount(arc.tokens)} (${Math.round(arc.proportion * 100)}%)${arc.costSuffix}`}</title>
            </circle>
          ))}
        </g>

        {/* Centre text: total token count */}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill="var(--uui-text-primary)"
        >
          {formatTokenCount(grandTotal)}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          fontSize={9}
          fill="var(--uui-text-secondary)"
        >
          total tokens
        </text>

        {/* Legend — one row per segment */}
        {segments.map((seg, index) => {
          const y = LEGEND_START_Y + index * LEGEND_ROW_HEIGHT;
          const pct = Math.round(seg.proportion * 100);
          const isTruncated = seg.model.length > 25;
          const displayName = truncateName(seg.model, 25);

          return (
            <g key={seg.model}>
              {/* Colour dot */}
              <circle cx={18} cy={y - 4} r={5} fill={seg.colour} />
              {/* Model name with optional tooltip for truncated names */}
              <text x={30} y={y} fontSize={11} fill="var(--uui-text-primary)">
                {isTruncated ? (
                  <>
                    <title>{seg.model}</title>
                    {displayName}
                  </>
                ) : (
                  displayName
                )}
              </text>
              {/* Token count + percentage, right-aligned */}
              <text x={228} y={y} fontSize={11} textAnchor="end" fill="var(--uui-text-secondary)">
                {formatTokenCount(seg.tokens)} ({pct}%)
              </text>
            </g>
          );
        })}
      </svg>
      <TimelineTooltip state={tooltipState} tooltipRef={tooltipRef} />
    </div>
  );
}

export const ModelTokenDistribution = memo(ModelTokenDistributionInner);
ModelTokenDistribution.displayName = 'ModelTokenDistribution';
