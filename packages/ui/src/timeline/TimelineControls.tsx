/**
 * TimelineControls — zoom buttons for the timeline.
 */

import { memo } from 'react';

export interface TimelineControlsProps {
  readonly zoom: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onReset: () => void;
}

export const TimelineControls = memo(function TimelineControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: TimelineControlsProps) {
  return (
    <div data-testid="timeline-controls" className="flex items-center gap-2 py-1 px-2">
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="rounded border px-2 py-0.5 text-sm"
      >
        −
      </button>
      <span className="text-xs font-mono min-w-[3ch] text-center" data-testid="zoom-level">
        {zoom.toFixed(1)}x
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="rounded border px-2 py-0.5 text-sm"
      >
        +
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset zoom"
        className="rounded border px-2 py-0.5 text-xs"
      >
        1x
      </button>
    </div>
  );
});
