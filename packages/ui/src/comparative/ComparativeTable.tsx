/**
 * ComparativeTable — main container for multi-session comparative view.
 *
 * Renders session list, model breakdown, tool matrix, and cost summary.
 * Optionally opens a session detail modal when a row is clicked and
 * a sessionLoader is provided.
 */

import type { BenchRunAggregation, Session } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useCallback, useState } from 'react';

import { CostSummary } from './CostSummary';
import { ModelBreakdownTable } from './ModelBreakdownTable';
import { SessionDetailModal } from './SessionDetailModal';
import { SessionListTable } from './SessionListTable';
import { ToolFanoutMatrix } from './ToolFanoutMatrix';

export interface ComparativeTableProps {
  readonly aggregation: BenchRunAggregation;
  readonly onSessionClick?: (sessionId: string) => void;
  /** When provided, enables the embedded session detail modal on row click. */
  readonly sessionLoader?: (sessionId: string) => Promise<Session | null>;
}

function ComparativeTableInner({ aggregation, onSessionClick, sessionLoader }: ComparativeTableProps) {
  const [modalSessionId, setModalSessionId] = useState<string | null>(null);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      onSessionClick?.(sessionId);
      if (sessionLoader) {
        setModalSessionId(sessionId);
      }
    },
    [onSessionClick, sessionLoader],
  );

  const handleModalClose = useCallback(() => {
    setModalSessionId(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <CostSummary aggregation={aggregation} />

      <section>
        <h3 style={{ marginBottom: '8px' }}><Text size="18" fontWeight="600" color="secondary">Sessions</Text></h3>
        <SessionListTable sessions={aggregation.sessions} onSessionClick={handleSessionClick} />
      </section>

      <section>
        <h3 style={{ marginBottom: '8px' }}><Text size="18" fontWeight="600" color="secondary">Model Breakdown</Text></h3>
        <ModelBreakdownTable modelUsage={aggregation.modelUsage} />
      </section>

      <section>
        <h3 style={{ marginBottom: '8px' }}><Text size="18" fontWeight="600" color="secondary">Tool Usage</Text></h3>
        <ToolFanoutMatrix toolUsage={aggregation.toolUsage} />
      </section>

      {modalSessionId && sessionLoader && (
        <SessionDetailModal
          sessionId={modalSessionId}
          sessionLoader={sessionLoader}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

export const ComparativeTable = memo(ComparativeTableInner);
ComparativeTable.displayName = 'ComparativeTable';
