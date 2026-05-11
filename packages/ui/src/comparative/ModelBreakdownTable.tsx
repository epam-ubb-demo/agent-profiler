/**
 * Model breakdown table — shows per-model token/cost summary.
 */

import type { ModelUsageRollup } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import styles from './comparative-tables.module.css';
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
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.styledTable} role="grid">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Sessions</th>
            <th scope="col">Input Tokens</th>
            <th scope="col">Output Tokens</th>
            <th scope="col">Cache Read</th>
            <th scope="col">Cache Write</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.model}>
              <td>
                <span className={styles.modelBadge}>{row.model}</span>
              </td>
              <td><Text size="18">{row.sessionCount}</Text></td>
              <td><Text size="18">{formatTokenCount(row.totalInputTokens)}</Text></td>
              <td><Text size="18">{formatTokenCount(row.totalOutputTokens)}</Text></td>
              <td><Text size="18">{formatTokenCount(row.totalCacheReadTokens)}</Text></td>
              <td><Text size="18">{formatTokenCount(row.totalCacheWriteTokens)}</Text></td>
              <td><Text size="18">{formatCost(row.totalCost)}</Text></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalRow} data-testid="model-totals-row">
            <td><Text size="18" fontWeight="600">Total</Text></td>
            <td><Text size="18" fontWeight="600">{totals.sessions}</Text></td>
            <td><Text size="18" fontWeight="600">{formatTokenCount(totals.inputTokens)}</Text></td>
            <td><Text size="18" fontWeight="600">{formatTokenCount(totals.outputTokens)}</Text></td>
            <td><Text size="18" fontWeight="600">{formatTokenCount(totals.cacheRead)}</Text></td>
            <td><Text size="18" fontWeight="600">{formatTokenCount(totals.cacheWrite)}</Text></td>
            <td><Text size="18" fontWeight="600">{formatCost(totals.cost)}</Text></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const ModelBreakdownTable = memo(ModelBreakdownTableInner);
ModelBreakdownTable.displayName = 'ModelBreakdownTable';
