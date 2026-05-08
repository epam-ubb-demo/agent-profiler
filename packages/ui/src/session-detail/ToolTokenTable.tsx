
import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import type { ToolStatsResult } from './tool-stats';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

/** Props for {@link ToolTokenTable}. */
export interface ToolTokenTableProps {
  readonly result: ToolStatsResult;
  readonly modelColours: Record<string, string>;
}

const FILTER_KEYS = ['tool'] as const;

const DEFAULT_SORT = { key: 'totalTokens' as const, direction: 'desc' as const };

/**
 * Renders a table showing token consumption attributed to each tool call,
 * with per-model colour dots and a proportion bar.
 */
export const ToolTokenTable = memo(function ToolTokenTable({ result, modelColours }: ToolTokenTableProps) {
  const { tokenStats, tokenTotals } = result;

  const { filteredData, filterText, setFilterText } = useFilterableData(tokenStats, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <p className={styles.sectionDescription}>
        Token attribution distributes each turn&rsquo;s output tokens evenly
        across the tool calls within that turn.
      </p>

      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter tools\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Tool" sortKey="tool" direction={getSortDirection('tool')} onSort={requestSort} />
            <th>Models</th>
            <SortableHeader label="Calls" sortKey="callCount" direction={getSortDirection('callCount')} onSort={requestSort} numeric />
            <SortableHeader label="Total tokens" sortKey="totalTokens" direction={getSortDirection('totalTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Avg tokens/call" sortKey="avgTokensPerCall" direction={getSortDirection('avgTokensPerCall')} onSort={requestSort} numeric />
            <SortableHeader label="Total USD" sortKey="totalUsd" direction={getSortDirection('totalUsd')} onSort={requestSort} numeric />
            <SortableHeader label="Avg USD/call" sortKey="avgUsdPerCall" direction={getSortDirection('avgUsdPerCall')} onSort={requestSort} numeric />
            <th />
          </tr>
        </thead>

        <tbody>
          {sortedData.map((row) => (
            <tr key={row.tool}>
              <td>
                <code className={styles.codeCell}>{row.tool}</code>
              </td>
              <td>
                {row.models.map((m) => (
                  <span
                    key={m}
                    className={styles.modelDot}
                    style={{
                      background:
                        modelColours[m] ?? 'var(--uui-neutral-50)',
                    }}
                    title={m}
                  />
                ))}
              </td>
              <td className={styles.numericCell}>{row.callCount}</td>
              <td className={styles.numericCell}>
                {formatTokenCount(row.totalTokens)}
              </td>
              <td className={styles.numericCell}>
                {formatTokenCount(row.avgTokensPerCall)}
              </td>
              <td className={styles.numericCell}>
                {formatCost(row.totalUsd)}
              </td>
              <td className={styles.numericCell}>
                {formatCost(row.avgUsdPerCall)}
              </td>
              <td className={styles.barCell}>
                <span
                  className={styles.proportionBar}
                  style={{
                    width: `${Math.round(row.proportion * 100)}%`,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className={styles.totalsRow}>
            <td>Total</td>
            <td>&mdash;</td>
            <td className={styles.numericCell}>{tokenTotals.callCount}</td>
            <td className={styles.numericCell}>
              {formatTokenCount(tokenTotals.totalTokens)}
            </td>
            <td className={styles.numericCell}>&mdash;</td>
            <td className={styles.numericCell}>
              {formatCost(tokenTotals.totalUsd)}
            </td>
            <td className={styles.numericCell}>&mdash;</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </>
  );
});
ToolTokenTable.displayName = 'ToolTokenTable';
