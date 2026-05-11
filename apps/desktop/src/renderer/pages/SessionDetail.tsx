import type { Session } from '@agent-profiler/core';
import { ErrorBoundary, SessionDetailView } from '@agent-profiler/ui';
import { Button, FlexRow, Panel, Spinner, Text } from '@epam/uui';
import { useCallback, useEffect, useState } from 'react';

import styles from './SessionError.module.css';

import { ArrowLeftIcon } from '@/components/icons';


interface SessionErrorFallbackProps {
  readonly error: Error;
  readonly reset: () => void;
  readonly onBack: () => void;
  readonly sessionId: string;
}

function SessionErrorFallback({ error, onBack, sessionId }: SessionErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <FlexRow
      justifyContent="center"
      padding="24"
      rawProps={{ 'data-testid': 'session-detail-render-error' }}
    >
      <Panel shadow cx={styles['session-error-panel']}>
        <div className={styles['session-error-content']}>
          {/* Prominent error icon */}
          <div className={styles['session-error-icon-container']}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>

          {/* Headline */}
          <Text size="30" fontWeight="600" cx={styles['session-error-title']}>
            Rendering error
          </Text>

          {/* Description */}
          <Text size="18" color="secondary" cx={styles['session-error-desc']}>
            A rendering error occurred while displaying this session.
          </Text>

          {/* Actions */}
          <FlexRow spacing="12" justifyContent="center" cx={styles['session-error-actions']}>
            <Button
              fill="solid"
              size="36"
              color="primary"
              icon={ArrowLeftIcon}
              caption="Back to sessions"
              onClick={onBack}
            />
            <Button
              fill="outline"
              size="36"
              caption={showDetails ? 'Hide details' : 'Show details'}
              onClick={() => setShowDetails(!showDetails)}
              rawProps={{ 'aria-expanded': showDetails }}
            />
          </FlexRow>

          {/* Expandable error details */}
          {showDetails && (
            <div className={styles['session-error-details']} role="region" aria-label="Error details">
              <div>
                <Text size="14" color="secondary">Session</Text>{' '}
                <code style={{ fontFamily: 'var(--uui-font-mono, monospace)', fontSize: '13px' }}>
                  {sessionId}
                </code>
              </div>
              <div>
                <Text size="14" color="secondary">Path</Text>{' '}
                <code style={{ fontFamily: 'var(--uui-font-mono, monospace)', fontSize: '13px' }}>
                  ~/.copilot/session-state/{sessionId}
                </code>
              </div>
              <Text size="14" fontWeight="600">
                {error.message}
              </Text>
              <pre className={styles['session-error-stack']}>
                {error.stack ?? 'No stack trace available.'}
              </pre>
            </div>
          )}
        </div>
      </Panel>
    </FlexRow>
  );
}

export interface SessionDetailProps {
  /** The session ID to display. */
  readonly sessionId: string;
  /** Called when the user navigates back. */
  readonly onBack: () => void;
  /** Called when the user drills into a sub-agent's child session. */
  readonly onSessionNavigate?: (sessionId: string) => void;
}

export function SessionDetail({ sessionId, onBack, onSessionNavigate }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await window.electronApi.session.open(sessionId)) as Session | null;
      if (!data) {
        setError('Session not found');
      } else if (data.parseStatus.status === 'failed') {
        setSession(data);
        setError(data.parseStatus.error ?? 'Failed to parse session');
      } else {
        setSession(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (loading) {
    return (
      <FlexRow justifyContent="center" padding="24" rawProps={{ 'data-testid': 'session-detail-loading' }}>
        <Spinner />
      </FlexRow>
    );
  }

  if (error && !session) {
    return (
      <FlexRow justifyContent="center" padding="24" rawProps={{ 'data-testid': 'session-detail-error' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <Text size="24" color="critical">{error}</Text>
          <Button fill="outline" size="30" icon={ArrowLeftIcon} caption="Back to sessions" onClick={onBack} />
        </div>
      </FlexRow>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <ErrorBoundary
      onReset={onBack}
      fallbackRender={({ error, reset }) => <SessionErrorFallback error={error} reset={reset} onBack={onBack} sessionId={sessionId} />}
    >
      <SessionDetailView session={session} onBack={onBack} onSessionNavigate={onSessionNavigate} />
    </ErrorBoundary>
  );
}
