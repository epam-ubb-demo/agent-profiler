/**
 * TokenHeatmap — renders token intensity bins as coloured rectangles.
 */

import type { AssistantMessage, Compaction } from '@agent-profiler/core';
import { memo, useCallback } from 'react';

import { heatmapTipContent } from './tooltip-content';
import type { TimelineConfig, TooltipHandlers } from './types';
import { computeHeatmapBins, heatmapColour } from './utils';

export interface TokenHeatmapProps {
  readonly messages: readonly AssistantMessage[];
  readonly compactions: readonly Compaction[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly tooltip: TooltipHandlers;
}

export const TokenHeatmap = memo(function TokenHeatmap({
  messages,
  compactions,
  startMs,
  durationMs,
  config,
  y,
  tooltip,
}: TokenHeatmapProps) {
  const bins = computeHeatmapBins(messages, compactions, startMs, durationMs, config.heatmapBins);
  const maxTokens = Math.max(1, ...bins);
  const binWidth = config.width / config.heatmapBins;
  const binDurationMs = durationMs / config.heatmapBins;

  const handleEnter = useCallback(
    (i: number, e: React.MouseEvent) => {
      const count = bins[i] ?? 0;
      const intensity = (count / maxTokens) * 100;
      const binStartMs = startMs + i * binDurationMs;
      const binEndMs = binStartMs + binDurationMs;
      tooltip.show(heatmapTipContent(binStartMs, binEndMs, count, intensity), e);
    },
    [bins, maxTokens, startMs, binDurationMs, tooltip],
  );

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
