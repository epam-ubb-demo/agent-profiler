/**
 * Table component displaying context-window compaction events.
 */

import type { Compaction } from '@agent-profiler/core';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';

export interface CompactionsTableProps {
  readonly compactions: readonly Compaction[];
}

/** Format an ISO timestamp to a time-only string, or return an em-dash. */
function formatTime(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function CompactionsTableInner({ compactions }: CompactionsTableProps) {
  return (
    <table className={styles.dataTable} role="grid">
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Model</th>
          <th scope="col" className={styles.numericCell}>Input</th>
          <th scope="col" className={styles.numericCell}>Output</th>
          <th scope="col" className={styles.numericCell}>Cache read</th>
          <th scope="col" className={styles.numericCell}>Cache write</th>
        </tr>
      </thead>
      <tbody>
        {compactions.map((c, idx) => (
          <tr key={c.turnId ?? idx}>
            <td>{formatTime(c.timestamp)}</td>
            <td>{c.model ?? '—'}</td>
            <td className={styles.numericCell}>{formatTokenCount(c.inputTokens)}</td>
            <td className={styles.numericCell}>{formatTokenCount(c.outputTokens)}</td>
            <td className={styles.numericCell}>{formatTokenCount(c.cacheRead)}</td>
            <td className={styles.numericCell}>{formatTokenCount(c.cacheWrite)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const CompactionsTable = memo(CompactionsTableInner);
CompactionsTable.displayName = 'CompactionsTable';
