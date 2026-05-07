/**
 * TokenHeatmap — renders token intensity bins as coloured rectangles.
 */

import type { AssistantMessage, Compaction } from '@agent-profiler/core';
import { memo } from 'react';

import type { TimelineConfig } from './types';
import { computeHeatmapBins, heatmapColour } from './utils';

export interface TokenHeatmapProps {
  readonly messages: readonly AssistantMessage[];
  readonly compactions: readonly Compaction[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
}

export const TokenHeatmap = memo(function TokenHeatmap({
  messages,
  compactions,
  startMs,
  durationMs,
  config,
  y,
}: TokenHeatmapProps) {
  const bins = computeHeatmapBins(messages, compactions, startMs, durationMs, config.heatmapBins);
  const maxTokens = Math.max(1, ...bins);
  const binWidth = config.width / config.heatmapBins;

  return (
    <g data-testid="token-heatmap">
      {bins.map((count, i) => {
        const intensity = count / maxTokens;
        return (
          <rect
            key={i}
            x={i * binWidth}
            y={y}
            width={binWidth}
            height={config.laneHeight}
            fill={heatmapColour(intensity)}
            opacity={count === 0 ? 0.15 : 0.85}
          >
            <title>{`Bin ${String(i + 1)}: ${String(count)} tokens`}</title>
          </rect>
        );
      })}
    </g>
  );
});
