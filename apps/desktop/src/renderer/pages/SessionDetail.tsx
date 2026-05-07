import type { Session } from '@agent-profiler/core';
import { SessionDetailView } from '@agent-profiler/ui';
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

  return <SessionDetailView session={session} onBack={onBack} onSessionNavigate={onSessionNavigate} />;
}
