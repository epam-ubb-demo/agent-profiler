/**
 * SVG donut chart visualisation of context window composition.
 *
 * Renders each segment (system prompt, conversation, tool definitions) as a
 * proportional arc on a donut ring, with the total token count centred inside
 * the ring and a legend below listing each segment's label, colour swatch, and
 * token count.
 *
 * Arc geometry uses the stroke-dasharray / stroke-dashoffset technique on
 * concentric circles — no external charting library required.
 */

import { Text } from '@epam/uui';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import type { ContextWindowData } from './context-window';
import styles from './session-detail.module.css';

export interface ContextWindowBarProps {
  readonly data: ContextWindowData | null;
}

/* ------------------------------------------------------------------ */
/*  SVG layout constants                                               */
/* ------------------------------------------------------------------ */

/** Horizontal centre of the donut within the viewBox. */
const CX = 120;

/** Vertical centre of the donut within the viewBox. */
const CY = 108;

/** Radius of the circle on which the arc stroke is centred. */
const RADIUS = 52;

/** Thickness of each arc stroke (produces a ring of this width). */
const STROKE_WIDTH = 26;

/** Full circumference of the arc circle (2πr). */
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function ContextWindowBarInner({ data }: ContextWindowBarProps) {
  if (data === null) {
    return (
      <Text size="18" color="secondary">
        No shutdown data available.
      </Text>
    );
  }

  if (data.segments.length === 0) {
    return (
      <Text size="18" color="secondary">
        No context window segments recorded.
      </Text>
    );
  }

  /*
   * Build arc descriptors for each segment.
   *
   * Each arc is drawn on the same circle using:
   *   strokeDasharray  = [segmentLength, circumference]
   *   strokeDashoffset = circumference × (1 − cumulativeProportion)
   *
   * This places each arc immediately after the previous one, starting
   * from the 12 o'clock position (via the −90° rotation on the group).
   */
  let cumulativeProportion = 0;
  const arcs = data.segments.map((segment) => {
    const dashLength = segment.proportion * CIRCUMFERENCE;
    const dashOffset = CIRCUMFERENCE * (1 - cumulativeProportion);
    cumulativeProportion += segment.proportion;
    return { ...segment, dashLength, dashOffset };
  });

  return (
    <div className={styles.contextDonutContainer}>
      <svg
        viewBox="0 0 240 248"
        className={styles.contextDonutSvg}
        role="img"
        aria-label="Context window composition"
        data-testid="context-window-chart"
      >
        {/* Title line */}
        <text
          x={CX}
          y={16}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--uui-text-primary)"
        >
          Context window: {formatTokenCount(data.currentTokens)} tokens used
        </text>

        {/* Background track — always visible, fills any floating-point gaps */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="var(--uui-neutral-20)"
          strokeWidth={STROKE_WIDTH}
        />

        {/* Segment arcs, rotated so the first arc begins at 12 o'clock */}
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
            />
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
          {formatTokenCount(data.currentTokens)}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          fontSize={9}
          fill="var(--uui-text-secondary)"
        >
          tokens used
        </text>

        {/* Legend — one row per segment, placed below the donut */}
        {data.segments.map((segment, index) => {
          const y = 188 + index * 22;
          return (
            <g key={segment.label}>
              {/* Colour dot */}
              <circle cx={18} cy={y - 4} r={5} fill={segment.colour} />
              {/* Segment label */}
              <text x={30} y={y} fontSize={11} fill="var(--uui-text-primary)">
                {segment.label}
              </text>
              {/* Token count, right-aligned */}
              <text
                x={228}
                y={y}
                fontSize={11}
                textAnchor="end"
                fill="var(--uui-text-secondary)"
              >
                {formatTokenCount(segment.tokens)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const ContextWindowBar = memo(ContextWindowBarInner);
ContextWindowBar.displayName = 'ContextWindowBar';
