/**
 * MessageLane — renders vertical bars for each assistant message.
 */

import type { AssistantMessage } from '@agent-profiler/core';
import { memo } from 'react';

import type { TimelineConfig } from './types';
import { formatTime, modelColour, timeFraction } from './utils';

export interface MessageLaneProps {
  readonly messages: readonly AssistantMessage[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
}

export const MessageLane = memo(function MessageLane({
  messages,
  startMs,
  durationMs,
  config,
  y,
}: MessageLaneProps) {
  const maxOutput = Math.max(1, ...messages.map((m) => m.outputTokens));
  const barWidth = Math.max(2, config.width / (messages.length * 3 || 1));

  return (
    <g data-testid="message-lane">
      {messages.map((msg, i) => {
        if (!msg.timestamp) return null;
        const frac = timeFraction(msg.timestamp, startMs, durationMs);
        const x = frac * config.width;
        const heightRatio = msg.outputTokens / maxOutput;
        const barHeight = heightRatio * config.laneHeight;

        return (
          <rect
            key={i}
            x={x}
            y={y + config.laneHeight - barHeight}
            width={Math.min(barWidth, 6)}
            height={barHeight}
            fill={modelColour(msg.model)}
            opacity={0.8}
          >
            <title>
              {`Time: ${formatTime(msg.timestamp)}\nModel: ${msg.model ?? 'unknown'}\nOutput tokens: ${String(msg.outputTokens)}`}
            </title>
          </rect>
        );
      })}
    </g>
  );
});
