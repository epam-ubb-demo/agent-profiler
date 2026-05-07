/**
 * ToolLane — renders tool calls packed into concurrent swim lanes.
 */

import type { ToolCall } from '@agent-profiler/core';
import { memo } from 'react';

import type { TimelineConfig } from './types';
import { formatDuration, formatTime, modelColour, packToolLanes } from './utils';

export interface ToolLaneProps {
  readonly toolCalls: readonly ToolCall[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly zoom: number;
}

export const ToolLane = memo(function ToolLane({
  toolCalls,
  startMs,
  durationMs,
  config,
  y,
  zoom,
}: ToolLaneProps) {
  const assignments = packToolLanes(toolCalls, startMs, durationMs);
  const maxLane = assignments.length > 0 ? Math.max(...assignments.map((a) => a.lane)) : 0;
  const laneH = config.laneHeight - 4;
  const rowHeight = laneH / Math.max(1, maxLane + 1);

  return (
    <g data-testid="tool-lane">
      {assignments.map((a) => {
        const x = a.startFrac * config.width;
        const width = Math.max(2, (a.endFrac - a.startFrac) * config.width);
        const ry = a.lane * rowHeight + y + 2;
        const status = a.success === null ? '?' : a.success ? '✓' : '✗';
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
            >
              <title>
                {`${a.toolName} (${status})\nModel: ${a.model ?? 'unknown'}\nStart: ${a.startTs ? formatTime(a.startTs) : '?'}\nDuration: ${a.durationMs ? formatDuration(a.durationMs) : '?'}`}
              </title>
            </rect>
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
