/**
 * TimelineTooltip — floating tooltip rendered outside the SVG.
 *
 * Receives state from useTimelineTooltip and renders a dark overlay
 * with header + key-value rows matching the reference mock-up.
 */

import { memo, type RefObject } from 'react';

import css from './timeline-tooltip.module.css';
import type { TooltipState } from './useTimelineTooltip';

interface TimelineTooltipProps {
  readonly state: TooltipState;
  readonly tooltipRef: RefObject<HTMLDivElement | null>;
}

export const TimelineTooltip = memo(function TimelineTooltip({
  state,
  tooltipRef,
}: TimelineTooltipProps) {
  const { content, x, y, visible } = state;

  if (!content) return null;

  return (
    <div
      ref={tooltipRef}
      className={`${css.tooltip ?? ''} ${visible ? '' : css.hidden ?? ''}`}
      style={{ left: x, top: y }}
    >
      <div className={`${css.row ?? ''} ${css.header ?? ''}`}>{content.header}</div>
      {content.rows.map((row, i) => (
        <div key={i} className={css.row}>
          <span className={css.key}>{row.key}</span>
          <span className={css.value}>{row.value}</span>
        </div>
      ))}
    </div>
  );
});

TimelineTooltip.displayName = 'TimelineTooltip';
