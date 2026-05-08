import type { Session } from '@agent-profiler/core';
import { ErrorBoundary, SessionDetailView } from '@agent-profiler/ui';
import { Button, FlexRow, Spinner, Text } from '@epam/uui';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeftIcon } from '@/components/icons';

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
      fallbackRender={({ error }) => (
        <FlexRow justifyContent="center" padding="24" rawProps={{ 'data-testid': 'session-detail-render-error' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Text size="24" color="critical">A rendering error occurred while displaying this session.</Text>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button fill="outline" size="30" icon={ArrowLeftIcon} caption="Back to sessions" onClick={onBack} />
            </div>
            <details style={{ width: '100%', maxWidth: 600, marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Show error details</summary>
              <div style={{ marginTop: 8, textAlign: 'left' }}>
                <code style={{ display: 'block', marginBottom: 8 }}>{error.message}</code>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    maxHeight: 300,
                    overflow: 'auto',
                    background: 'var(--uui-surface-higher, #f5f5f5)',
                    padding: 12,
                    borderRadius: 4,
                  }}
                >
                  {error.stack ?? 'No stack trace available.'}
                </pre>
              </div>
            </details>
          </div>
        </FlexRow>
      )}
    >
      <SessionDetailView session={session} onBack={onBack} onSessionNavigate={onSessionNavigate} />
    </ErrorBoundary>
  );
}
