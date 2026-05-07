/**
 * Tool fan-out matrix — displays tool usage stats with success rate bars.
 */

import type { ToolUsageSummary } from '@agent-profiler/core';
import { memo, useMemo } from 'react';

import { formatDuration } from './format';

export interface ToolFanoutMatrixProps {
  readonly toolUsage: readonly ToolUsageSummary[];
}

function computeSuccessRate(row: ToolUsageSummary): number {
  const total = row.successCount + row.failureCount;
  if (total === 0) return 100;
  return Math.round((row.successCount / total) * 100);
}

function ToolFanoutMatrixInner({ toolUsage }: ToolFanoutMatrixProps) {
  const sorted = useMemo(
    () => [...toolUsage].sort((a, b) => b.callCount - a.callCount),
    [toolUsage],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" role="grid">
        <thead>
          <tr className="bg-slate-50">
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Tool</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Calls</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Duration</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Success Rate</th>
            <th scope="col" className="px-4 py-2 text-left text-sm font-medium text-slate-600">Models</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sorted.map((row) => {
            const rate = computeSuccessRate(row);
            return (
              <tr key={row.toolName} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-sm font-mono">{row.toolName}</td>
                <td className="px-4 py-2 text-sm">{row.callCount}</td>
                <td className="px-4 py-2 text-sm">{formatDuration(row.totalDurationMs)}</td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span>{rate}%</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm">
                  {row.models.map((m) => (
                    <span key={m} className="inline-block mr-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800">
                      {m}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const ToolFanoutMatrix = memo(ToolFanoutMatrixInner);
ToolFanoutMatrix.displayName = 'ToolFanoutMatrix';
