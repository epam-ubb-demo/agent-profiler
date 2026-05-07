/**
 * CompactionLane — renders diamond markers at compaction events.
 */

import type { Compaction } from '@agent-profiler/core';
import { memo } from 'react';

import type { TimelineConfig } from './types';
import { formatTime, modelColour, timeFraction } from './utils';

export interface CompactionLaneProps {
  readonly compactions: readonly Compaction[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
}

export const CompactionLane = memo(function CompactionLane({
  compactions,
  startMs,
  durationMs,
  config,
  y,
}: CompactionLaneProps) {
  const midY = y + config.laneHeight / 2;
  const size = 6;

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
          >
            <title>
              {`Compaction @ ${formatTime(c.timestamp)}\nModel: ${c.model ?? 'unknown'}\nInput: ${String(c.inputTokens)} | Output: ${String(c.outputTokens)} | Cache: ${String(c.cacheWrite)}`}
            </title>
          </polygon>
        );
      })}
    </g>
  );
});
