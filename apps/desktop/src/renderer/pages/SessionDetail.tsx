import type { Session } from '@agent-profiler/core';
import { FanoutTree, Timeline, TurnList } from '@agent-profiler/ui';
import { Button } from '@epam/uui';
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
      <div data-testid="session-detail-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#6C6F80' }}>Loading session…</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div data-testid="session-detail-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#E54322' }}>{error}</p>
        <Button fill="outline" size="30" icon={ArrowLeftIcon} caption="Back to sessions" onClick={onBack} />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div data-testid="session-detail" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Button fill="ghost" size="30" icon={ArrowLeftIcon} onClick={onBack} rawProps={{ 'aria-label': 'Back' }} />
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{session.sessionId}</h1>
        {session.parseStatus.status === 'partial' && (
          <span style={{
            borderRadius: '0.25rem',
            backgroundColor: '#FEF9C3',
            padding: '0.125rem 0.5rem',
            fontSize: '0.75rem',
            color: '#854D0E',
          }}>
            Partial parse
          </span>
        )}
      </div>

      {error && (
        <div style={{
          borderRadius: '0.25rem',
          border: '1px solid rgba(229, 67, 34, 0.5)',
          backgroundColor: 'rgba(229, 67, 34, 0.1)',
          padding: '0.5rem',
          fontSize: '0.875rem',
          color: '#E54322',
        }}>
          {error}
        </div>
      )}

      <Timeline session={session} />
      <TurnList session={session} />
      <FanoutTree session={session} />
    </div>
  );
}
