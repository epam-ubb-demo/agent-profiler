/**
 * Table component listing sub-agent invocations with key metrics.
 */

import type { SubagentInvocation } from '@agent-profiler/core';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';

export interface SubagentTableProps {
  readonly subagents: readonly SubagentInvocation[];
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

function SubagentTableInner({ subagents }: SubagentTableProps) {
  return (
    <table className={styles.dataTable} role="grid">
      <thead>
        <tr>
          <th scope="col">Agent</th>
          <th scope="col">Type</th>
          <th scope="col">Time</th>
          <th scope="col" className={styles.numericCell}>Tokens</th>
          <th scope="col" className={styles.numericCell}>Messages</th>
          <th scope="col" className={styles.numericCell}>Tool calls</th>
        </tr>
      </thead>
      <tbody>
        {subagents.map((sub, idx) => (
          <tr key={sub.eventId ?? idx}>
            <td>
              <code className={styles.codeCell}>{sub.agentName}</code>
            </td>
            <td>{sub.agentType}</td>
            <td>{formatTime(sub.timestamp)}</td>
            <td className={styles.numericCell}>{formatTokenCount(sub.totalTokens)}</td>
            <td className={styles.numericCell}>{sub.messageCount}</td>
            <td className={styles.numericCell}>{sub.toolCallCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const SubagentTable = memo(SubagentTableInner);
SubagentTable.displayName = 'SubagentTable';
