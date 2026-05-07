import type { Session } from '@agent-profiler/core';
import { FanoutTree, Timeline, TurnList } from '@agent-profiler/ui';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

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
      <div data-testid="session-detail-loading" className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div data-testid="session-detail-error" className="flex flex-col items-center gap-4 p-12">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sessions
        </Button>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div data-testid="session-detail" className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">{session.sessionId}</h1>
        {session.parseStatus.status === 'partial' && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
            Partial parse
          </span>
        )}
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Timeline session={session} />
      <TurnList session={session} />
      <FanoutTree session={session} />
    </div>
  );
}
