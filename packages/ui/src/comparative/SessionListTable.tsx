/**
 * Session list table — one row per session with sortable columns.
 */

import type { SessionSummaryRow } from '@agent-profiler/core';
import { Badge, Text } from '@epam/uui';
import { memo, useCallback, useMemo, useState } from 'react';

import styles from './comparative-tables.module.css';
import { formatCost, formatWallTime } from './format';

export interface SessionListTableProps {
  readonly sessions: readonly SessionSummaryRow[];
  readonly onSessionClick?: ((sessionId: string) => void) | undefined;
}

type SortKey = 'label' | 'parseStatus' | 'wallTimeMs' | 'turnCount' | 'toolCallCount' | 'models' | 'totalCost';
type SortDir = 'asc' | 'desc';

const STATUS_BADGE_COLOR: Record<string, 'success' | 'warning' | 'critical'> = {
  ok: 'success',
  partial: 'warning',
  failed: 'critical',
};

const STATUS_ICON: Record<string, string> = {
  ok: '✓',
  partial: '⚠',
  failed: '✗',
};

function compareRows(a: SessionSummaryRow, b: SessionSummaryRow, key: SortKey): number {
  switch (key) {
    case 'label':
      return a.label.localeCompare(b.label);
    case 'parseStatus':
      return a.parseStatus.localeCompare(b.parseStatus);
    case 'wallTimeMs':
      return a.wallTimeMs - b.wallTimeMs;
    case 'turnCount':
      return a.turnCount - b.turnCount;
    case 'toolCallCount':
      return a.toolCallCount - b.toolCallCount;
    case 'models':
      return a.models.length - b.models.length;
    case 'totalCost': {
      const ca = a.totalCost ?? -1;
      const cb = b.totalCost ?? -1;
      return ca - cb;
    }
  }
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'label', label: 'Label' },
  { key: 'parseStatus', label: 'Status' },
  { key: 'wallTimeMs', label: 'Wall Time' },
  { key: 'turnCount', label: 'Turns' },
  { key: 'toolCallCount', label: 'Tool Calls' },
  { key: 'models', label: 'Models' },
  { key: 'totalCost', label: 'Cost' },
];

function SessionListTableInner({ sessions, onSessionClick }: SessionListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('label');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleHeaderClick = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    const rows = [...sessions];
    rows.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [sessions, sortKey, sortDir]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.styledTable} role="grid">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`${styles.sortButton}${col.key === 'label' ? ` ${styles.stickyColHeader}` : ''}`}
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => handleHeaderClick(col.key)}
              >
                {col.label}
                {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.sessionId}
              className={styles.clickableRow}
              role="button"
              tabIndex={0}
              onClick={() => onSessionClick?.(row.sessionId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSessionClick?.(row.sessionId);
                }
              }}
            >
              <td className={styles.stickyCol}>
                <Text size="18">{row.label}</Text>
              </td>
              <td>
                <Badge
                  color={STATUS_BADGE_COLOR[row.parseStatus] ?? 'info'}
                  fill="solid"
                  size="18"
                  caption={STATUS_ICON[row.parseStatus] ?? '?'}
                />
              </td>
              <td><Text size="18">{formatWallTime(row.wallTimeMs)}</Text></td>
              <td><Text size="18">{row.turnCount}</Text></td>
              <td><Text size="18">{row.toolCallCount}</Text></td>
              <td>
                {row.models.map((m) => (
                  <span key={m} className={styles.modelBadge}>
                    {m}
                  </span>
                ))}
              </td>
              <td><Text size="18">{formatCost(row.totalCost)}</Text></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SessionListTable = memo(SessionListTableInner);
SessionListTable.displayName = 'SessionListTable';
