/**
 * Cost summary card — displays aggregate cost/session metrics.
 */

import type { BenchRunAggregation } from '@agent-profiler/core';
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
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Cost Summary</h3>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-xs text-slate-500">Total Cost</dt>
          <dd className="text-2xl font-bold text-slate-900" data-testid="total-cost">
            {formatCost(aggregation.totalCost)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Sessions</dt>
          <dd className="text-2xl font-bold text-slate-900" data-testid="session-count">
            {aggregation.sessionCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Variants</dt>
          <dd className="text-2xl font-bold text-slate-900" data-testid="variant-count">
            {aggregation.variantCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Total Wall Time</dt>
          <dd className="text-2xl font-bold text-slate-900" data-testid="total-wall-time">
            {formatWallTime(aggregation.totalWallTimeMs)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Avg Cost / Session</dt>
          <dd className="text-2xl font-bold text-slate-900" data-testid="avg-cost">
            {formatCost(avgCost)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export const CostSummary = memo(CostSummaryInner);
CostSummary.displayName = 'CostSummary';
