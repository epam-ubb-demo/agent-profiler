/**
 * SessionDetailContent — renders session detail content inside the modal.
 *
 * Displays Timeline, TurnList, FanoutTree (if present), and a metadata summary.
 */

import type { Session } from '@agent-profiler/core';
import { FlexRow, FlexCell, Panel, Text } from '@epam/uui';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} data-testid="session-detail-content">
      {/* Metadata summary */}
      <Panel background="surface-main">
        <FlexRow padding="12" columnGap="18" rawProps={{ style: { flexWrap: 'wrap' } }}>
          {session.selectedModel && (
            <FlexCell width="auto">
              <Text size="24" color="secondary">
                <Text size="24" fontWeight="600" cx="inline">Model:</Text> {session.selectedModel}
              </Text>
            </FlexCell>
          )}
          {wallTimeMs != null && (
            <FlexCell width="auto">
              <Text size="24" color="secondary">
                <Text size="24" fontWeight="600" cx="inline">Wall Time:</Text> {formatWallTime(wallTimeMs)}
              </Text>
            </FlexCell>
          )}
          {session.shutdown && (
            <FlexCell width="auto">
              <Text size="24" color="secondary">
                <Text size="24" fontWeight="600" cx="inline">Requests:</Text> {session.shutdown.totalPremiumRequests}
              </Text>
            </FlexCell>
          )}
          <FlexCell width="auto">
            <Text size="24" color="secondary">
              <Text size="24" fontWeight="600" cx="inline">Turns:</Text> {session.turns.length}
            </Text>
          </FlexCell>
        </FlexRow>
      </Panel>

      {/* Timeline */}
      <section>
        <Text size="24" fontWeight="600" color="secondary" rawProps={{ style: { marginBottom: '0.5rem' } }}>Timeline</Text>
        <Timeline session={session} />
      </section>

      {/* Turn list */}
      <section style={{ height: '400px' }}>
        <Text size="24" fontWeight="600" color="secondary" rawProps={{ style: { marginBottom: '0.5rem' } }}>Turns</Text>
        <TurnList session={session} />
      </section>

      {/* Fan-out tree (only if data exists) */}
      {session.fanoutTurns.length > 0 && (
        <section>
          <Text size="24" fontWeight="600" color="secondary" rawProps={{ style: { marginBottom: '0.5rem' } }}>Fan-out</Text>
          <FanoutTree session={session} />
        </section>
      )}
    </div>
  );
});
