/**
 * TimelineControls — zoom buttons for the timeline.
 */

import { Button, FlexRow, Text } from '@epam/uui';
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
    <FlexRow data-testid="timeline-controls" columnGap="6" alignItems="center" rawProps={{ 'data-testid': 'timeline-controls', style: { padding: '4px 8px' } }}>
      <Button
        fill="outline"
        size="24"
        caption="−"
        onClick={onZoomOut}
        rawProps={{ 'aria-label': 'Zoom out' }}
      />
      <Text size="18" rawProps={{ 'data-testid': 'zoom-level', style: { fontFamily: 'monospace', minWidth: '3ch', textAlign: 'center' } }}>
        {zoom.toFixed(1)}x
      </Text>
      <Button
        fill="outline"
        size="24"
        caption="+"
        onClick={onZoomIn}
        rawProps={{ 'aria-label': 'Zoom in' }}
      />
      <Button
        fill="outline"
        size="24"
        caption="1x"
        onClick={onReset}
        rawProps={{ 'aria-label': 'Reset zoom' }}
      />
    </FlexRow>
  );
});
