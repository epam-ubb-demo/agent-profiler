/**
 * Session header — displays session ID, metadata chips, and a
 * conditional stale-data warning banner.
 */

import { Badge, Button, Text } from '@epam/uui';
import { memo } from 'react';

import styles from './session-detail.module.css';

/** Props accepted by {@link SessionHeader}. */
export interface SessionHeaderProps {
  readonly sessionId: string;
  readonly repo: string;
  readonly branch: string;
  readonly copilotVersion: string;
  readonly selectedModel: string;
  readonly reasoningEffort: string;
  readonly parseStatus: 'ok' | 'partial' | 'failed';
  readonly isLive?: boolean;
  readonly onBack?: () => void;
}

function SessionHeaderInner({
  sessionId,
  repo,
  branch,
  copilotVersion,
  selectedModel,
  reasoningEffort,
  parseStatus,
  isLive,
  onBack,
}: SessionHeaderProps) {
  return (
    <>
      {/* ---- Header row ------------------------------------------------- */}
      <div className={styles.headerRow}>
        {onBack && (
          <Button
            caption="←"
            fill="ghost"
            color="secondary"
            size="36"
            onClick={onBack}
          />
        )}

        <Text size="36" fontWeight="600">
          Copilot session · <code className={styles.metadataCode}>{sessionId}</code>
        </Text>

        {parseStatus === 'partial' && (
          <Badge color="warning" fill="solid" size="18" caption="Partial" />
        )}
        {parseStatus === 'failed' && (
          <Badge color="critical" fill="solid" size="18" caption="Failed" />
        )}
        {isLive && (
          <Badge
            color="info"
            fill="outline"
            size="18"
            caption="Live"
            cx={styles.liveBadge}
            rawProps={{
              'data-testid': 'live-badge',
              'aria-label': 'Session is live',
            }}
          />
        )}
      </div>

      {/* ---- Metadata row ----------------------------------------------- */}
      <div className={styles.metadataRow}>
        <Text size="18" color="secondary">Repo</Text>
        <code className={styles.metadataCode}>{repo}</code>
        <span className={styles.metadataSeparator}>·</span>

        <Text size="18" color="secondary">branch</Text>
        <code className={styles.metadataCode}>{branch}</code>
        <span className={styles.metadataSeparator}>·</span>

        <Text size="18" color="secondary">Copilot {copilotVersion}</Text>
        <span className={styles.metadataSeparator}>·</span>

        <Text size="18" color="secondary">selected model</Text>
        <code className={styles.metadataCode}>{selectedModel}</code>
        <Text size="18" color="secondary">
          ({reasoningEffort} effort)
        </Text>
      </div>

    </>
  );
}

/** Session header with ID, metadata row, and optional stale-data warning. */
export const SessionHeader = memo(SessionHeaderInner);
SessionHeader.displayName = 'SessionHeader';
