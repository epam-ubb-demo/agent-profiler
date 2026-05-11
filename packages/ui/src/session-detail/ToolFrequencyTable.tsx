/**
 * Table component displaying per-tool call frequency with a proportion bar.
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import type { ToolFrequencyRow } from './tool-stats';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface ToolFrequencyTableProps {
  readonly rows: readonly ToolFrequencyRow[];
}

const FILTER_KEYS = ['tool'] as const;

const DEFAULT_SORT = { key: 'callCount' as const, direction: 'desc' as const };

export const ToolFrequencyTable = memo(function ToolFrequencyTable({ rows }: ToolFrequencyTableProps) {
  const { filteredData, filterText, setFilterText } = useFilterableData(rows, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter tools\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Tool" sortKey="tool" direction={getSortDirection('tool')} onSort={requestSort} />
            <SortableHeader label="Calls" sortKey="callCount" direction={getSortDirection('callCount')} onSort={requestSort} numeric />
            <th scope="col" className={styles.barCell} />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => (
            <tr key={row.tool}>
              <td>
                <code className={styles.codeCell}>{row.tool}</code>
              </td>
              <td className={styles.numericCell}>{row.callCount}</td>
              <td className={styles.barCell}>
                <span
                  className={styles.proportionBar}
                  style={{ width: `${Math.round(row.proportion * 100)}%` }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
});
ToolFrequencyTable.displayName = 'ToolFrequencyTable';
