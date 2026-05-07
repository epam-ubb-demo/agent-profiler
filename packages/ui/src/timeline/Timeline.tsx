/**
 * Timeline — main container component for session timeline visualization.
 *
 * Renders a full-width, scrollable SVG timeline with lanes for tokens,
 * model changes, tool calls, messages, and compactions.
 */

import type { Session } from '@agent-profiler/core';
import { FlexRow, FlexCell } from '@epam/uui';
import { memo, useCallback, useRef } from 'react';

import { useTimelineZoom } from '../hooks/useTimelineZoom';

import { AdaptiveTicks } from './AdaptiveTicks';
import { CompactionLane } from './CompactionLane';
import { MessageLane } from './MessageLane';
import { ModelLane } from './ModelLane';
import { TimelineControls } from './TimelineControls';
import { TimelineTooltip } from './TimelineTooltip';
import { TokenHeatmap } from './TokenHeatmap';
import { ToolLane, getToolLaneCount } from './ToolLane';
import { DEFAULT_CONFIG } from './types';
import { useTimelineTooltip } from './useTimelineTooltip';

export interface TimelineProps {
  readonly session: Session;
}

export const Timeline = memo(function Timeline({ session }: TimelineProps) {
  const { zoom, zoomIn, zoomOut, resetZoom, startPan, updatePan, endPan, isPanning } =
    useTimelineZoom();
  const containerRef = useRef<HTMLDivElement>(null);
  const { state: tooltipState, handlers: tooltipHandlers, tooltipRef } = useTimelineTooltip();

  const config = DEFAULT_CONFIG;

  // Compute session time bounds
  const startMs = session.startTs ? new Date(session.startTs).getTime() : 0;
  const endMs = session.endTs ? new Date(session.endTs).getTime() : startMs;
  const durationMs = Math.max(1, endMs - startMs);

  // Compute lane count for tool calls
  const toolLaneCount = getToolLaneCount(session.toolCalls, startMs, durationMs);

  // Compute Y positions for each lane
  const ticksY = 0;
  const ticksHeight = 24;
  const heatmapY = ticksHeight;
  const modelY = heatmapY + config.laneHeight + config.lanePadding;
  const toolY = modelY + config.laneHeight + config.lanePadding;
  const toolHeight = Math.max(config.laneHeight, toolLaneCount * 12 + 8);
  const messageY = toolY + toolHeight + config.lanePadding;
  const compactionY = messageY + config.laneHeight + config.lanePadding;
  const totalHeight = compactionY + config.laneHeight + config.lanePadding;

  // Pan handlers — hide tooltip during pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        startPan(e.clientX);
        tooltipHandlers.hide();
      }
    },
    [startPan, tooltipHandlers],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      updatePan(e.clientX);
    },
    [updatePan],
  );

  const handleMouseUp = useCallback(() => {
    endPan();
  }, [endPan]);

  const handleMouseLeave = useCallback(() => {
    endPan();
    tooltipHandlers.hide();
  }, [endPan, tooltipHandlers]);

  // Lane labels
  const labels = [
    { y: heatmapY, text: 'Tokens' },
    { y: modelY, text: 'Model' },
    { y: toolY, text: 'Tools' },
    { y: messageY, text: 'Msgs' },
    { y: compactionY, text: 'Compact' },
  ];

  return (
    <div data-testid="timeline" style={{ display: 'flex', flexDirection: 'column', width: '100%', background: 'var(--uui-surface-main)' }}>
      <TimelineControls zoom={zoom.scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
      <FlexRow>
        {/* Fixed gutter with lane labels */}
        <FlexCell
          width={config.gutterWidth}
          shrink={0}
          rawProps={{ 'data-testid': 'timeline-gutter' }}
        >
          <svg width={config.gutterWidth} height={totalHeight}>
            {labels.map((label) => (
              <text
                key={label.text}
                x={config.gutterWidth - 8}
                y={label.y + config.laneHeight / 2}
                fontSize={10}
                fill="var(--uui-text-primary)"
                textAnchor="end"
                dominantBaseline="central"
              >
                {label.text}
              </text>
            ))}
          </svg>
        </FlexCell>

        {/* Scrollable timeline area */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', cursor: isPanning ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <svg
            data-testid="timeline-svg"
            width={config.width * zoom.scale}
            height={totalHeight}
            viewBox={`${String(-zoom.panX / zoom.scale)} 0 ${String(config.width)} ${String(totalHeight)}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            {/* Adaptive ticks (x-axis) */}
            <AdaptiveTicks
              startMs={startMs}
              durationMs={durationMs}
              config={config}
              y={ticksY}
              zoom={zoom.scale}
            />

            {/* Token heatmap */}
            <TokenHeatmap
              messages={session.assistantMessages}
              compactions={session.compactions}
              startMs={startMs}
              durationMs={durationMs}
              config={config}
              y={heatmapY}
              tooltip={tooltipHandlers}
            />

            {/* Model lane */}
            <ModelLane
              selectedModel={session.selectedModel}
              modelChanges={session.modelChanges}
              startMs={startMs}
              durationMs={durationMs}
              startTs={session.startTs}
              endTs={session.endTs}
              config={config}
              y={modelY}
              tooltip={tooltipHandlers}
            />

            {/* Tool lane */}
            <ToolLane
              toolCalls={session.toolCalls}
              startMs={startMs}
              durationMs={durationMs}
              config={config}
              y={toolY}
              zoom={zoom.scale}
              tooltip={tooltipHandlers}
            />

            {/* Message lane */}
            <MessageLane
              messages={session.assistantMessages}
              startMs={startMs}
              durationMs={durationMs}
              config={config}
              y={messageY}
              tooltip={tooltipHandlers}
            />

            {/* Compaction lane */}
            <CompactionLane
              compactions={session.compactions}
              startMs={startMs}
              durationMs={durationMs}
              config={config}
              y={compactionY}
              tooltip={tooltipHandlers}
            />
          </svg>
        </div>
      </FlexRow>

      {/* Floating tooltip — rendered outside SVG for proper HTML layout */}
      <TimelineTooltip state={tooltipState} tooltipRef={tooltipRef} />
    </div>
  );
});
