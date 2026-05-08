/**
 * Table component displaying context-window compaction events.
 */

import type { Compaction } from '@agent-profiler/core';
import { memo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface CompactionsTableProps {
  readonly compactions: readonly Compaction[];
}

const FILTER_KEYS = ['model'] as const;

const DEFAULT_SORT = { key: 'timestamp' as const, direction: 'asc' as const };

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

export const CompactionsTable = memo(function CompactionsTable({ compactions }: CompactionsTableProps) {
  const { filteredData, filterText, setFilterText } = useFilterableData(compactions, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter models\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Time" sortKey="timestamp" direction={getSortDirection('timestamp')} onSort={requestSort} />
            <SortableHeader label="Model" sortKey="model" direction={getSortDirection('model')} onSort={requestSort} />
            <SortableHeader label="Input" sortKey="inputTokens" direction={getSortDirection('inputTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Output" sortKey="outputTokens" direction={getSortDirection('outputTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Cache read" sortKey="cacheRead" direction={getSortDirection('cacheRead')} onSort={requestSort} numeric />
            <SortableHeader label="Cache write" sortKey="cacheWrite" direction={getSortDirection('cacheWrite')} onSort={requestSort} numeric />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((c, idx) => (
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
    </>
  );
});
CompactionsTable.displayName = 'CompactionsTable';
