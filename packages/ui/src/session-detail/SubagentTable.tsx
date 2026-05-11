/**
 * Table component listing sub-agent invocations with key metrics.
 */

import type { SubagentInvocation } from '@agent-profiler/core';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface SubagentTableProps {
  readonly subagents: readonly SubagentInvocation[];
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: (sessionId: string) => void;
}

const FILTER_KEYS = ['agentName', 'agentType'] as const;

const DEFAULT_SORT = { key: 'totalTokens' as const, direction: 'desc' as const };

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

export const SubagentTable = memo(function SubagentTable({ subagents, onSessionNavigate }: SubagentTableProps) {
  const { filteredData, filterText, setFilterText } = useFilterableData(subagents, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter agents\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Agent" sortKey="agentName" direction={getSortDirection('agentName')} onSort={requestSort} />
            <SortableHeader label="Type" sortKey="agentType" direction={getSortDirection('agentType')} onSort={requestSort} />
            <SortableHeader label="Time" sortKey="timestamp" direction={getSortDirection('timestamp')} onSort={requestSort} />
            <SortableHeader label="Tokens" sortKey="totalTokens" direction={getSortDirection('totalTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Messages" sortKey="messageCount" direction={getSortDirection('messageCount')} onSort={requestSort} numeric />
            <SortableHeader label="Tool calls" sortKey="toolCallCount" direction={getSortDirection('toolCallCount')} onSort={requestSort} numeric />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((sub, idx) => (
            <tr key={sub.eventId ?? idx}>
              <td>
                {sub.childSessionRef && onSessionNavigate ? (
                  <button
                    type="button"
                    className={styles.drillDownLink}
                    onClick={() => onSessionNavigate(sub.childSessionRef!)}
                    title={`Open session ${sub.childSessionRef}`}
                  >
                    <code className={styles.codeCell}>{sub.agentName}</code>
                    <span className={styles.drillDownArrow}> ↗</span>
                  </button>
                ) : (
                  <code className={styles.codeCell}>{sub.agentName}</code>
                )}
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
    </>
  );
});
SubagentTable.displayName = 'SubagentTable';
