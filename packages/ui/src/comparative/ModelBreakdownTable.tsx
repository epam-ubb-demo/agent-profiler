/**
 * Model breakdown table — shows per-model token/cost summary.
 */

import type { ModelUsageRollup } from '@agent-profiler/core';
import { memo, useMemo } from 'react';

import { formatCost, formatTokenCount } from './format';

export interface ModelBreakdownTableProps {
  readonly modelUsage: readonly ModelUsageRollup[];
}

function ModelBreakdownTableInner({ modelUsage }: ModelBreakdownTableProps) {
  const sorted = useMemo(
    () => [...modelUsage].sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0)),
    [modelUsage],
  );

  const totals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let cost: number | null = null;
    let sessions = 0;

    for (const m of modelUsage) {
      inputTokens += m.totalInputTokens;
      outputTokens += m.totalOutputTokens;
      cacheRead += m.totalCacheReadTokens;
      cacheWrite += m.totalCacheWriteTokens;
      if (m.totalCost !== null) {
        cost = (cost ?? 0) + m.totalCost;
      }
      sessions += m.sessionCount;
    }

    return { inputTokens, outputTokens, cacheRead, cacheWrite, cost, sessions };
  }, [modelUsage]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" role="grid">
        <thead>
          <tr className="bg-slate-50">
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Model</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Sessions</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Input Tokens</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Output Tokens</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Cache Read</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Cache Write</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sorted.map((row) => (
            <tr key={row.model} className="hover:bg-slate-50">
              <td className="px-4 py-2 text-sm">
                <span className="inline-block mr-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800">
                  {row.model}
                </span>
              </td>
              <td className="px-4 py-2 text-sm">{row.sessionCount}</td>
              <td className="px-4 py-2 text-sm">{formatTokenCount(row.totalInputTokens)}</td>
              <td className="px-4 py-2 text-sm">{formatTokenCount(row.totalOutputTokens)}</td>
              <td className="px-4 py-2 text-sm">{formatTokenCount(row.totalCacheReadTokens)}</td>
              <td className="px-4 py-2 text-sm">{formatTokenCount(row.totalCacheWriteTokens)}</td>
              <td className="px-4 py-2 text-sm">{formatCost(row.totalCost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-medium" data-testid="model-totals-row">
            <td className="px-4 py-2 text-sm">Total</td>
            <td className="px-4 py-2 text-sm">{totals.sessions}</td>
            <td className="px-4 py-2 text-sm">{formatTokenCount(totals.inputTokens)}</td>
            <td className="px-4 py-2 text-sm">{formatTokenCount(totals.outputTokens)}</td>
            <td className="px-4 py-2 text-sm">{formatTokenCount(totals.cacheRead)}</td>
            <td className="px-4 py-2 text-sm">{formatTokenCount(totals.cacheWrite)}</td>
            <td className="px-4 py-2 text-sm">{formatCost(totals.cost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const ModelBreakdownTable = memo(ModelBreakdownTableInner);
ModelBreakdownTable.displayName = 'ModelBreakdownTable';
