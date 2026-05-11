/**
 * CompactionLane — renders diamond markers at compaction events.
 */

import type { Compaction } from '@agent-profiler/core';
import { memo, useCallback } from 'react';

import { compactionTipContent } from './tooltip-content';
import type { TimelineConfig, TooltipHandlers } from './types';
import { modelColour, timeFraction } from './utils';

export interface CompactionLaneProps {
  readonly compactions: readonly Compaction[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly tooltip: TooltipHandlers;
}

export const CompactionLane = memo(function CompactionLane({
  compactions,
  startMs,
  durationMs,
  config,
  y,
  tooltip,
}: CompactionLaneProps) {
  const midY = y + config.laneHeight / 2;
  const size = 6;

  const handleEnter = useCallback(
    (i: number, e: React.MouseEvent) => {
      const c = compactions[i];
      if (!c?.timestamp) return;
      tooltip.show(
        compactionTipContent(
          c.timestamp,
          c.inputTokens,
          c.outputTokens,
          c.cacheRead,
          c.cacheWrite,
          c.model,
          startMs,
        ),
        e,
      );
    },
    [compactions, startMs, tooltip],
  );

  return (
    <g data-testid="compaction-lane">
      {compactions.map((c, i) => {
        if (!c.timestamp) return null;
        const frac = timeFraction(c.timestamp, startMs, durationMs);
        const cx = frac * config.width;

        // Diamond shape
        const points = [
          `${String(cx)},${String(midY - size)}`,
          `${String(cx + size)},${String(midY)}`,
          `${String(cx)},${String(midY + size)}`,
          `${String(cx - size)},${String(midY)}`,
        ].join(' ');

        return (
          <polygon
            key={i}
            points={points}
            fill={modelColour(c.model)}
            stroke="#34406b"
            strokeWidth={0.5}
            style={{ cursor: 'crosshair' }}
            onMouseEnter={(e) => { handleEnter(i, e); }}
            onMouseMove={tooltip.move}
            onMouseLeave={tooltip.hide}
          />
        );
      })}
    </g>
  );
});
