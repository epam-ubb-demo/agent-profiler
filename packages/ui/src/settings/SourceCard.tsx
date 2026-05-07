/**
 * SourceCard — displays a single session source with toggle and status.
 */

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

/** Returns semantic colour class name for the status badge. */
function getStatusColor(status: DiscoveryStatus): string {
  switch (status.state) {
    case 'found':
      return 'color: #16a34a'; // green
    case 'scanning':
      return 'color: #ca8a04'; // yellow
    case 'error':
      return 'color: #dc2626'; // red
    case 'not-found':
    case 'idle':
    default:
      return 'color: #6b7280'; // grey
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
  const statusColor = getStatusColor(status);

  return (
    <div
      data-testid={`source-card-${source.type}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Source info */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span data-testid={`source-label-${source.type}`} style={{ fontWeight: 600, fontSize: '14px' }}>
            {source.label}
          </span>
          <span
            data-testid={`source-status-${source.type}`}
            style={{ fontSize: '12px', ...parseStyle(statusColor) }}
            aria-label={`Status: ${statusText}`}
          >
            {statusText}
          </span>
        </div>
        <p
          data-testid={`source-description-${source.type}`}
          style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}
        >
          {source.description}
        </p>
        {status.state === 'found' && (
          <span
            data-testid={`source-path-${source.type}`}
            style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}
          >
            {status.path}
          </span>
        )}
      </div>

      {/* Toggle switch */}
      <input
        type="checkbox"
        role="switch"
        checked={source.enabled}
        onChange={handleChange}
        aria-label={`Enable ${source.label}`}
        data-testid={`source-toggle-${source.type}`}
      />
    </div>
  );
});

/** Parses inline style string (e.g. "color: #fff") into a style object. */
function parseStyle(style: string): React.CSSProperties {
  const [key, value] = style.split(':').map((s) => s.trim());
  if (!key || !value) return {};
  return { [key]: value };
}
