/**
 * Session list table — one row per session with sortable columns.
 */

import type { SessionSummaryRow } from '@agent-profiler/core';
import { memo, useCallback, useMemo, useState } from 'react';

import { formatCost, formatWallTime } from './format';

export interface SessionListTableProps {
  readonly sessions: readonly SessionSummaryRow[];
  readonly onSessionClick?: ((sessionId: string) => void) | undefined;
}

type SortKey = 'label' | 'parseStatus' | 'wallTimeMs' | 'turnCount' | 'toolCallCount' | 'models' | 'totalCost';
type SortDir = 'asc' | 'desc';

const STATUS_ICON: Record<string, string> = {
  ok: '✓',
  partial: '⚠',
  error: '✗',
};

function getStatusIcon(parseStatus: string): string {
  return STATUS_ICON[parseStatus] ?? '?';
}

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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" role="grid">
        <thead>
          <tr className="bg-slate-50 divide-y divide-slate-200">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-2 text-left text-sm font-medium text-slate-600 cursor-pointer select-none${
                  col.key === 'label' ? ' sticky left-0 bg-slate-50 z-10' : ''
                }`}
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => handleHeaderClick(col.key)}
              >
                {col.label}
                {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sorted.map((row) => (
            <tr
              key={row.sessionId}
              className="hover:bg-slate-50 cursor-pointer"
              onClick={() => onSessionClick?.(row.sessionId)}
            >
              <td className="px-4 py-2 text-sm sticky left-0 bg-white z-10">{row.label}</td>
              <td className="px-4 py-2 text-sm">{getStatusIcon(row.parseStatus)}</td>
              <td className="px-4 py-2 text-sm">{formatWallTime(row.wallTimeMs)}</td>
              <td className="px-4 py-2 text-sm">{row.turnCount}</td>
              <td className="px-4 py-2 text-sm">{row.toolCallCount}</td>
              <td className="px-4 py-2 text-sm">
                {row.models.map((m) => (
                  <span key={m} className="inline-block mr-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800">
                    {m}
                  </span>
                ))}
              </td>
              <td className="px-4 py-2 text-sm">{formatCost(row.totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SessionListTable = memo(SessionListTableInner);
SessionListTable.displayName = 'SessionListTable';
