/**
 * ToolLane — renders tool calls packed into concurrent swim lanes.
 */

import type { ToolCall } from '@agent-profiler/core';
import { memo, useCallback } from 'react';

import { toolTipContent } from './tooltip-content';
import type { TimelineConfig, TooltipHandlers } from './types';
import { modelColour, packToolLanes } from './utils';

export interface ToolLaneProps {
  readonly toolCalls: readonly ToolCall[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly zoom: number;
  readonly tooltip: TooltipHandlers;
}

export const ToolLane = memo(function ToolLane({
  toolCalls,
  startMs,
  durationMs,
  config,
  y,
  zoom,
  tooltip,
}: ToolLaneProps) {
  const assignments = packToolLanes(toolCalls, startMs, durationMs);
  const maxLane = assignments.length > 0 ? Math.max(...assignments.map((a) => a.lane)) : 0;
  const laneH = config.laneHeight - 4;
  const rowHeight = laneH / Math.max(1, maxLane + 1);

  const handleEnter = useCallback(
    (i: number, e: React.MouseEvent) => {
      const a = assignments[i];
      if (!a) return;
      // Find the original tool call for args preview
      const tc = toolCalls.find((t) => t.toolCallId === a.toolCallId);
      tooltip.show(
        toolTipContent(
          a.toolName,
          a.model,
          a.startTs,
          a.durationMs,
          a.success,
          tc?.argumentsPreview ?? '',
          startMs,
        ),
        e,
      );
    },
    [assignments, toolCalls, startMs, tooltip],
  );

  return (
    <g data-testid="tool-lane">
      {assignments.map((a, i) => {
        const x = a.startFrac * config.width;
        const width = Math.max(2, (a.endFrac - a.startFrac) * config.width);
        const ry = a.lane * rowHeight + y + 2;
        const showLabel = width * zoom > 60;

        return (
          <g key={a.toolCallId}>
            <rect
              x={x}
              y={ry}
              width={width}
              height={Math.max(4, rowHeight - 2)}
              fill={modelColour(a.model)}
              rx={2}
              ry={2}
              opacity={0.85}
              style={{ cursor: 'crosshair' }}
              onMouseEnter={(e) => { handleEnter(i, e); }}
              onMouseMove={tooltip.move}
              onMouseLeave={tooltip.hide}
            />
            {showLabel && (
              <text
                x={x + 3}
                y={ry + Math.max(4, rowHeight - 2) / 2}
                fontSize={9 / zoom}
                fill="#34406b"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {a.toolName}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});

/**
 * Returns the number of concurrent lanes needed for the given tool calls.
 */
export function getToolLaneCount(
  toolCalls: readonly ToolCall[],
  startMs: number,
  durationMs: number,
): number {
  const assignments = packToolLanes(toolCalls, startMs, durationMs);
  if (assignments.length === 0) return 1;
  return Math.max(...assignments.map((a) => a.lane)) + 1;
}
