/**
 * Simple table component showing event type counts for a session.
 */

import { memo } from 'react';

import type { EventTypeRow } from './event-type-stats';
import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface EventTypesTableProps {
  readonly rows: readonly EventTypeRow[];
}

const FILTER_KEYS = ['type'] as const;

const DEFAULT_SORT = { key: 'count' as const, direction: 'desc' as const };

export const EventTypesTable = memo(function EventTypesTable({ rows }: EventTypesTableProps) {
  const { filteredData, filterText, setFilterText } = useFilterableData(rows, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter types\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Type" sortKey="type" direction={getSortDirection('type')} onSort={requestSort} />
            <SortableHeader label="Count" sortKey="count" direction={getSortDirection('count')} onSort={requestSort} numeric />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => (
            <tr key={row.type}>
              <td>{row.type}</td>
              <td className={styles.numericCell}>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
});
EventTypesTable.displayName = 'EventTypesTable';
