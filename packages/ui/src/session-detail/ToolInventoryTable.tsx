/**
 * ToolInventoryTable — expandable table grouping observed tool calls by
 * category (derived from tool name patterns).
 *
 * Category rows are collapsible; clicking expands to show individual tools
 * within that category with their call count, success rate, and average
 * duration.
 */

import { memo, useCallback, useState } from 'react';

import { formatDuration, formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import type { ToolCategoryRow, ToolInventoryResult } from './tool-inventory';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ToolInventoryTableProps {
  readonly result: ToolInventoryResult;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FILTER_KEYS = ['category'] as const;

const DEFAULT_SORT = { key: 'totalCalls' as const, direction: 'desc' as const };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSuccessRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatAvgDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return formatDuration(ms);
}

/* ------------------------------------------------------------------ */
/*  Category row + detail                                              */
/* ------------------------------------------------------------------ */

interface CategoryRowsProps {
  readonly row: ToolCategoryRow;
  readonly isOpen: boolean;
  readonly onToggle: (category: string) => void;
}

function CategoryRows({ row, isOpen, onToggle }: CategoryRowsProps) {
  const handleToggle = useCallback(() => {
    onToggle(row.category);
  }, [onToggle, row.category]);

  return (
    <>
      {/* Category summary row */}
      <tr
        className={styles.fanoutInteractionRow}
        onClick={handleToggle}
        style={{ cursor: 'pointer' }}
      >
        <td style={{ width: 32 }}>
          <button
            type="button"
            className={styles.fanoutCaret + (isOpen ? ` ${styles.fanoutCaretOpen}` : '')}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${row.category}`}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            tabIndex={0}
          >
            ▸
          </button>
        </td>
        <td>
          <strong>{row.category}</strong>
        </td>
        <td className={styles.numericCell}><strong>{row.toolCount}</strong></td>
        <td className={styles.numericCell}><strong>{row.totalCalls}</strong></td>
        <td className={styles.numericCell}>{formatSuccessRate(row.successRate)}</td>
        <td className={styles.numericCell}>{formatAvgDuration(row.avgDurationMs)}</td>
      </tr>

      {/* Expanded tool rows */}
      {isOpen && row.tools.map((tool) => (
        <tr key={tool.toolName} className={styles.fanoutTurnRow}>
          <td />
          <td>
            <code className={styles.codeCell}>{tool.toolName}</code>
          </td>
          <td />
          <td className={styles.numericCell}>{tool.callCount}</td>
          <td className={styles.numericCell}>
            {formatSuccessRate(
              (tool.successCount + tool.failureCount) > 0
                ? tool.successCount / (tool.successCount + tool.failureCount)
                : null,
            )}
          </td>
          <td className={styles.numericCell}>{formatAvgDuration(tool.avgDurationMs)}</td>
        </tr>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const ToolInventoryTable = memo(function ToolInventoryTable({ result }: ToolInventoryTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const { filteredData, filterText, setFilterText } = useFilterableData(result.categories, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      {/* Summary caption */}
      {result.toolDefinitionsTokens !== null && result.toolDefinitionsTokens > 0 && (
        <p className={styles.sectionDescription}>
          Tool definitions in context: <strong>{formatTokenCount(result.toolDefinitionsTokens)} tokens</strong>.
          Rows below are based on tools actually called in this session.
        </p>
      )}

      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter categories\u2026" />

      <table className={styles.dataTable} role="grid" data-testid="tool-inventory">
        <thead>
          <tr>
            <th scope="col" style={{ width: 32 }} />
            <SortableHeader label="Category / Tool" sortKey="category" direction={getSortDirection('category')} onSort={requestSort} />
            <SortableHeader label="Tools" sortKey="toolCount" direction={getSortDirection('toolCount')} onSort={requestSort} numeric />
            <SortableHeader label="Calls" sortKey="totalCalls" direction={getSortDirection('totalCalls')} onSort={requestSort} numeric />
            <SortableHeader label="Success" sortKey="successRate" direction={getSortDirection('successRate')} onSort={requestSort} numeric />
            <SortableHeader label="Avg duration" sortKey="avgDurationMs" direction={getSortDirection('avgDurationMs')} onSort={requestSort} numeric />
          </tr>
        </thead>

        <tbody>
          {sortedData.map((cat) => (
            <CategoryRows
              key={cat.category}
              row={cat}
              isOpen={expanded.has(cat.category)}
              onToggle={toggleCategory}
            />
          ))}
        </tbody>

        <tfoot>
          <tr className={styles.totalsRow}>
            <td />
            <td>Total</td>
            <td className={styles.numericCell}>{result.totalTools}</td>
            <td className={styles.numericCell}>{result.totalCalls}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </>
  );
});
ToolInventoryTable.displayName = 'ToolInventoryTable';
