/**
 * Stacked horizontal bar visualisation of context window composition.
 *
 * Renders each segment (system prompt, conversation, tool definitions) as
 * a proportionally-sized SVG rectangle with an in-bar label when wide enough.
 */

import { Text } from '@epam/uui';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import type { ContextWindowData } from './context-window';
import styles from './session-detail.module.css';

export interface ContextWindowBarProps {
  readonly data: ContextWindowData | null;
}

/** Minimum rect width (px) required to render an in-bar text label. */
const MIN_LABEL_WIDTH = 60;

/** Total drawable width within the SVG (x 20–1180). */
const BAR_WIDTH = 1160;

function ContextWindowBarInner({ data }: ContextWindowBarProps) {
  if (data === null || data.segments.length === 0) {
    return (
      <Text size="18" color="secondary">
        No shutdown data available.
      </Text>
    );
  }

  /* Build rects with accumulated x offsets. */
  let xOffset = 20;
  const rects = data.segments.map((segment) => {
    const width = segment.proportion * BAR_WIDTH;
    const x = xOffset;
    xOffset += width;
    return { ...segment, x, width };
  });

  return (
    <div className={styles.contextBarContainer}>
      <svg
        viewBox="0 0 1200 60"
        className={styles.contextBarSvg}
        role="img"
        aria-label="Context window composition"
      >
        <text
          x={20}
          y={14}
          fontSize={12}
          fontWeight={600}
          fill="var(--uui-text-primary)"
        >
          Context window: {formatTokenCount(data.currentTokens)} tokens used
        </text>

        {rects.map((rect) => (
          <g key={rect.label}>
            <rect
              x={rect.x}
              y={20}
              width={rect.width}
              height={28}
              fill={rect.colour}
              rx={4}
            />
            {rect.width > MIN_LABEL_WIDTH && (
              <text
                x={rect.x + rect.width / 2}
                y={38}
                textAnchor="middle"
                fill="white"
                fontSize={10}
                fontWeight="bold"
              >
                {rect.label} ({formatTokenCount(rect.tokens)})
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export const ContextWindowBar = memo(ContextWindowBarInner);
ContextWindowBar.displayName = 'ContextWindowBar';
