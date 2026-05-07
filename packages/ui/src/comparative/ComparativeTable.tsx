/**
 * ComparativeTable — main container for multi-session comparative view.
 *
 * Renders session list, model breakdown, tool matrix, and cost summary.
 */

import type { BenchRunAggregation } from '@agent-profiler/core';
import { memo } from 'react';

import { CostSummary } from './CostSummary';
import { ModelBreakdownTable } from './ModelBreakdownTable';
import { SessionListTable } from './SessionListTable';
import { ToolFanoutMatrix } from './ToolFanoutMatrix';

export interface ComparativeTableProps {
  readonly aggregation: BenchRunAggregation;
  readonly onSessionClick?: (sessionId: string) => void;
}

function ComparativeTableInner({ aggregation, onSessionClick }: ComparativeTableProps) {
  return (
    <div className="space-y-6">
      <CostSummary aggregation={aggregation} />

      <section>
        <h3 className="text-sm font-medium text-slate-600 mb-2">Sessions</h3>
        <SessionListTable sessions={aggregation.sessions} onSessionClick={onSessionClick} />
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-600 mb-2">Model Breakdown</h3>
        <ModelBreakdownTable modelUsage={aggregation.modelUsage} />
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-600 mb-2">Tool Usage</h3>
        <ToolFanoutMatrix toolUsage={aggregation.toolUsage} />
      </section>
    </div>
  );
}

export const ComparativeTable = memo(ComparativeTableInner);
ComparativeTable.displayName = 'ComparativeTable';
