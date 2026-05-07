/**
 * SessionDetailContent — renders session detail content inside the modal.
 *
 * Displays Timeline, TurnList, FanoutTree (if present), and a metadata summary.
 */

import type { Session } from '@agent-profiler/core';
import { memo } from 'react';

import { FanoutTree } from '../fanout/FanoutTree';
import { TurnList } from '../panels/TurnList';
import { Timeline } from '../timeline/Timeline';

import { formatWallTime } from './format';

export interface SessionDetailContentProps {
  readonly session: Session;
}

export const SessionDetailContent = memo(function SessionDetailContent({
  session,
}: SessionDetailContentProps) {
  const wallTimeMs =
    session.startTs && session.endTs
      ? new Date(session.endTs).getTime() - new Date(session.startTs).getTime()
      : null;

  return (
    <div className="flex flex-col gap-6" data-testid="session-detail-content">
      {/* Metadata summary */}
      <div className="flex flex-wrap gap-4 rounded bg-slate-50 p-3 text-sm text-slate-700">
        {session.selectedModel && (
          <span>
            <span className="font-medium">Model:</span> {session.selectedModel}
          </span>
        )}
        {wallTimeMs != null && (
          <span>
            <span className="font-medium">Wall Time:</span> {formatWallTime(wallTimeMs)}
          </span>
        )}
        {session.shutdown && (
          <span>
            <span className="font-medium">Requests:</span> {session.shutdown.totalPremiumRequests}
          </span>
        )}
        <span>
          <span className="font-medium">Turns:</span> {session.turns.length}
        </span>
      </div>

      {/* Timeline */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Timeline</h3>
        <Timeline session={session} />
      </section>

      {/* Turn list */}
      <section style={{ height: '400px' }}>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Turns</h3>
        <TurnList session={session} />
      </section>

      {/* Fan-out tree (only if data exists) */}
      {session.fanoutTurns.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-600">Fan-out</h3>
          <FanoutTree session={session} />
        </section>
      )}
    </div>
  );
});
