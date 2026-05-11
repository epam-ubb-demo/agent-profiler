/**
 * Tool fan-out matrix — displays tool usage stats with success rate bars.
 */

import type { ToolUsageSummary } from '@agent-profiler/core';
import { Badge, Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import styles from './comparative-tables.module.css';
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
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.styledTable} role="grid">
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">Calls</th>
            <th scope="col">Duration</th>
            <th scope="col">Success Rate</th>
            <th scope="col">Models</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const rate = computeSuccessRate(row);
            return (
              <tr key={row.toolName}>
                <td><Text size="18" rawProps={{ style: { fontFamily: 'monospace' } }}>{row.toolName}</Text></td>
                <td><Text size="18">{row.callCount}</Text></td>
                <td><Text size="18">{formatDuration(row.totalDurationMs)}</Text></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{ width: '64px', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--uui-neutral-30)' }}
                      role="progressbar"
                      aria-valuenow={rate}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={styles.proportionBar}
                        style={{ width: `${rate}%`, background: 'var(--uui-success-50)' }}
                      />
                    </div>
                    <Text size="18">{rate}%</Text>
                  </div>
                </td>
                <td>
                  {row.models.map((m) => (
                    <Badge key={m} color="info" fill="outline" size="18" caption={m} rawProps={{ style: { marginRight: '4px' } }} />
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
