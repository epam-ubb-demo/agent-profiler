/**
 * Cost summary card — displays aggregate cost/session metrics.
 */

import type { BenchRunAggregation } from '@agent-profiler/core';
import { Panel, Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatCost, formatWallTime } from './format';

export interface CostSummaryProps {
  readonly aggregation: BenchRunAggregation;
}

function CostSummaryInner({ aggregation }: CostSummaryProps) {
  const avgCost = useMemo(() => {
    if (aggregation.totalCost === null || aggregation.sessionCount === 0) return null;
    return aggregation.totalCost / aggregation.sessionCount;
  }, [aggregation.totalCost, aggregation.sessionCount]);

  return (
    <Panel shadow>
      <div style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}><Text size="24" fontWeight="600" color="primary">Cost Summary</Text></h3>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
          <div>
            <dt><Text size="18" fontSize="12" color="secondary">Total Cost</Text></dt>
            <dd data-testid="total-cost">
              <Text size="36" fontWeight="700" color="primary">{formatCost(aggregation.totalCost)}</Text>
            </dd>
          </div>
          <div>
            <dt><Text size="18" fontSize="12" color="secondary">Sessions</Text></dt>
            <dd data-testid="session-count">
              <Text size="36" fontWeight="700" color="primary">{aggregation.sessionCount}</Text>
            </dd>
          </div>
          <div>
            <dt><Text size="18" fontSize="12" color="secondary">Variants</Text></dt>
            <dd data-testid="variant-count">
              <Text size="36" fontWeight="700" color="primary">{aggregation.variantCount}</Text>
            </dd>
          </div>
          <div>
            <dt><Text size="18" fontSize="12" color="secondary">Total Wall Time</Text></dt>
            <dd data-testid="total-wall-time">
              <Text size="36" fontWeight="700" color="primary">{formatWallTime(aggregation.totalWallTimeMs)}</Text>
            </dd>
          </div>
          <div>
            <dt><Text size="18" fontSize="12" color="secondary">Avg Cost / Session</Text></dt>
            <dd data-testid="avg-cost">
              <Text size="36" fontWeight="700" color="primary">{formatCost(avgCost)}</Text>
            </dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}

export const CostSummary = memo(CostSummaryInner);
CostSummary.displayName = 'CostSummary';
