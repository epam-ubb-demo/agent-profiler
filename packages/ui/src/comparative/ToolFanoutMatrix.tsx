/**
 * Tool fan-out matrix — displays tool usage stats with success rate bars.
 */

import type { ToolUsageSummary } from '@agent-profiler/core';
import { Badge, Text } from '@epam/uui';
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
          <tr style={{ background: 'var(--uui-surface-main)' }}>
            <th scope="col" className="px-4 py-2 text-left"><Text size="24" fontWeight="600" color="secondary">Tool</Text></th>
            <th scope="col" className="px-4 py-2 text-left"><Text size="24" fontWeight="600" color="secondary">Calls</Text></th>
            <th scope="col" className="px-4 py-2 text-left"><Text size="24" fontWeight="600" color="secondary">Duration</Text></th>
            <th scope="col" className="px-4 py-2 text-left"><Text size="24" fontWeight="600" color="secondary">Success Rate</Text></th>
            <th scope="col" className="px-4 py-2 text-left"><Text size="24" fontWeight="600" color="secondary">Models</Text></th>
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px solid var(--uui-neutral-40)' }}>
          {sorted.map((row) => {
            const rate = computeSuccessRate(row);
            return (
              <tr key={row.toolName} style={{ borderBottom: '1px solid var(--uui-neutral-40)' }}>
                <td className="px-4 py-2"><Text size="24" cx="font-mono">{row.toolName}</Text></td>
                <td className="px-4 py-2"><Text size="24">{row.callCount}</Text></td>
                <td className="px-4 py-2"><Text size="24">{formatDuration(row.totalDurationMs)}</Text></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'var(--uui-neutral-30)' }} role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${rate}%`, background: 'var(--uui-success-50)' }}
                      />
                    </div>
                    <Text size="24">{rate}%</Text>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {row.models.map((m) => (
                    <Badge key={m} color="info" fill="outline" size="18" caption={m} cx="mr-1" />
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
