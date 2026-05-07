/**
 * ModelLane — renders horizontal model segments coloured by model name.
 */

import type { ModelChange } from '@agent-profiler/core';
import { memo } from 'react';

import type { TimelineConfig } from './types';
import { computeModelSegments, formatDuration, formatTime, modelColour } from './utils';

export interface ModelLaneProps {
  readonly selectedModel: string;
  readonly modelChanges: readonly ModelChange[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly config: TimelineConfig;
  readonly y: number;
}

export const ModelLane = memo(function ModelLane({
  selectedModel,
  modelChanges,
  startMs,
  durationMs,
  startTs,
  endTs,
  config,
  y,
}: ModelLaneProps) {
  const segments = computeModelSegments(selectedModel, modelChanges, startMs, durationMs, startTs, endTs);

  return (
    <g data-testid="model-lane">
      {segments.map((seg, i) => {
        const x = seg.startFrac * config.width;
        const width = (seg.endFrac - seg.startFrac) * config.width;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={width}
            height={config.laneHeight}
            fill={modelColour(seg.model)}
            rx={3}
            ry={3}
          >
            <title>
              {`${seg.model}\n${formatTime(seg.startTs)} → ${formatTime(seg.endTs)}\nDuration: ${formatDuration(seg.durationMs)}`}
            </title>
          </rect>
        );
      })}
    </g>
  );
});
