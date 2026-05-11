/**
 * ModelLane — renders horizontal model segments coloured by model name.
 */

import type { ModelChange } from '@agent-profiler/core';
import { memo, useCallback } from 'react';

import { modelTipContent } from './tooltip-content';
import type { TimelineConfig, TooltipHandlers } from './types';
import { computeModelSegments, modelColour } from './utils';

export interface ModelLaneProps {
  readonly selectedModel: string;
  readonly modelChanges: readonly ModelChange[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly tooltip: TooltipHandlers;
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
  tooltip,
}: ModelLaneProps) {
  const segments = computeModelSegments(selectedModel, modelChanges, startMs, durationMs, startTs, endTs);

  const handleEnter = useCallback(
    (i: number, e: React.MouseEvent) => {
      const seg = segments[i];
      if (!seg) return;
      tooltip.show(
        modelTipContent(seg.model, seg.startTs, seg.endTs, seg.durationMs, startMs),
        e,
      );
    },
    [segments, startMs, tooltip],
  );

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
