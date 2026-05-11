/**
 * SourceCard — displays a single session source with toggle and status.
 */

import { FlexRow, FlexCell, Text, Badge } from '@epam/uui';
import { memo, useCallback } from 'react';

import type { DiscoveryStatus, SourceConfig } from './types';

export interface SourceCardProps {
  /** Source configuration. */
  readonly source: SourceConfig;
  /** Current discovery status for this source. */
  readonly status: DiscoveryStatus;
  /** Called when the toggle is changed. */
  readonly onToggle: (enabled: boolean) => void;
}

/** Returns UUI Badge color for the status. */
function getStatusBadgeColor(status: DiscoveryStatus): 'success' | 'warning' | 'critical' | 'neutral' {
  switch (status.state) {
    case 'found':
      return 'success';
    case 'scanning':
      return 'warning';
    case 'error':
      return 'critical';
    case 'not-found':
    case 'idle':
    default:
      return 'neutral';
  }
}

/** Returns human-readable status text. */
function getStatusText(status: DiscoveryStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Idle';
    case 'scanning':
      return 'Scanning...';
    case 'found':
      return `${status.count} sessions found`;
    case 'not-found':
      return status.message || 'Not configured';
    case 'error':
      return `Error: ${status.message}`;
  }
}

export const SourceCard = memo(function SourceCard({
  source,
  status,
  onToggle,
}: SourceCardProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToggle(e.target.checked);
    },
    [onToggle],
  );

  const statusText = getStatusText(status);
  const badgeColor = getStatusBadgeColor(status);

  return (
    <FlexRow
      columnGap="12"
      padding="12"
      alignItems="center"
      rawProps={{ 'data-testid': `source-card-${source.type}`, style: { borderRadius: '8px', border: '1px solid var(--uui-neutral-40)' } }}
    >
      {/* Source info */}
      <FlexCell grow={1}>
        <FlexRow columnGap="6" alignItems="center">
          <Text
            size="24"
            fontWeight="600"
            rawProps={{ 'data-testid': `source-label-${source.type}` }}
          >
            {source.label}
          </Text>
          <Badge
            color={badgeColor}
            fill="outline"
            size="18"
            caption={statusText}
            rawProps={{ 'data-testid': `source-status-${source.type}`, 'aria-label': `Status: ${statusText}` }}
          />
        </FlexRow>
        <Text
          size="18"
          color="secondary"
          rawProps={{ 'data-testid': `source-description-${source.type}`, style: { marginTop: '4px' } }}
        >
          {source.description}
        </Text>
        {status.state === 'found' && (
          <Text
            size="18"
            color="disabled"
            rawProps={{ 'data-testid': `source-path-${source.type}`, style: { fontFamily: 'monospace' } }}
          >
            {status.path}
          </Text>
        )}
      </FlexCell>

      {/* Toggle switch */}
      <input
        type="checkbox"
        role="switch"
        checked={source.enabled}
        onChange={handleChange}
        aria-label={`Enable ${source.label}`}
        data-testid={`source-toggle-${source.type}`}
      />
    </FlexRow>
  );
});
