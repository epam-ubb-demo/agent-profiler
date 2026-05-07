import type { Session } from '@agent-profiler/core';
import { FanoutTree, Timeline, TurnList } from '@agent-profiler/ui';
import { Badge, Button, FlexRow, Panel, Spinner, Text } from '@epam/uui';
import { useCallback, useEffect, useState } from 'react';

import { ArrowLeftIcon } from '@/components/icons';

export interface SessionDetailProps {
  /** The session ID to display. */
  readonly sessionId: string;
  /** Called when the user navigates back. */
  readonly onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
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
    <div data-testid="session-detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
      <FlexRow spacing="6" alignItems="center">
        <Button fill="ghost" size="30" icon={ArrowLeftIcon} onClick={onBack} rawProps={{ 'aria-label': 'Back' }} />
        <Text size="42" fontWeight="600">{session.sessionId}</Text>
        {session.parseStatus.status === 'partial' && (
          <Badge color="warning" fill="outline" caption="Partial parse" size="18" />
        )}
      </FlexRow>

      {error && (
        <Panel cx="session-detail-error-panel">
          <FlexRow padding="12">
            <Text size="24" color="critical">{error}</Text>
          </FlexRow>
        </Panel>
      )}

      <Timeline session={session} />
      <TurnList session={session} />
      <FanoutTree session={session} />
    </div>
  );
}
