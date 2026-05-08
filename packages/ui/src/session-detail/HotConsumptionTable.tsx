/**
 * Hottest token consumption points table — ranks the most expensive
 * turns, sub-agent calls, and compaction events by total token usage,
 * with type badges, model dots, and proportion bars.
 */

import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import type { HotConsumptionEntry, HotConsumptionResult } from './hot-consumption';
import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface HotConsumptionTableProps {
  readonly result: HotConsumptionResult;
  readonly includeCompactions: boolean;
  readonly onToggleCompactions: () => void;
  readonly modelColours: Record<string, string>;
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: (sessionId: string) => void;
}

const TYPE_BADGE_CLASS: Record<HotConsumptionEntry['type'], string> = {
  turn: styles.typeBadgeTurn,
  'sub-agent': styles.typeBadgeSubagent,
  compaction: styles.typeBadgeCompaction,
};

const FILTER_KEYS = ['type', 'model', 'where', 'detail'] as const;

const DEFAULT_SORT = { key: 'rank' as const, direction: 'asc' as const };

/** Extract HH:MM:SS from an ISO-8601 timestamp. */
function formatTime(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const HotConsumptionTable = memo(function HotConsumptionTable({
  result,
  includeCompactions,
  onToggleCompactions,
  modelColours,
  onSessionNavigate,
}: HotConsumptionTableProps) {
  const { entries, totalEntries, topNTokens } = result;

  const { filteredData, filterText, setFilterText } = useFilterableData(entries, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      {/* ---- Compaction toggle ------------------------------------------ */}
      <label>
        <input
          type="checkbox"
          checked={includeCompactions}
          onChange={onToggleCompactions}
        />{' '}
        Include compaction events in the ranking
      </label>

      {/* ---- Summary ---------------------------------------------------- */}
      <p className={styles.sectionDescription}>
        Top {entries.length} of {totalEntries} hotspots account for{' '}
        {formatTokenCount(topNTokens)} tokens
      </p>

      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter hotspots\u2026" />

      {/* ---- Table ------------------------------------------------------ */}
      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="#" sortKey="rank" direction={getSortDirection('rank')} onSort={requestSort} numeric />
            <th scope="col">Time</th>
            <SortableHeader label="Type" sortKey="type" direction={getSortDirection('type')} onSort={requestSort} />
            <th scope="col">Where</th>
            <th scope="col">Model</th>
            <SortableHeader label="Tokens" sortKey="tokens" direction={getSortDirection('tokens')} onSort={requestSort} numeric />
            <SortableHeader label="Est. USD" sortKey="estimatedUsd" direction={getSortDirection('estimatedUsd')} onSort={requestSort} numeric />
            <th scope="col" className={styles.barCell} />
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((entry) => (
            <tr key={entry.rank}>
              <td className={styles.numericCell}>{entry.rank}</td>
              <td>{formatTime(entry.time)}</td>
              <td>
                <span className={TYPE_BADGE_CLASS[entry.type]}>
                  {entry.type}
                </span>
              </td>
              <td>{entry.where}</td>
              <td>
                {entry.model !== null ? (
                  <>
                    <span
                      className={styles.modelDot}
                      style={{
                        background:
                          modelColours[entry.model] ??
                          'var(--uui-neutral-50)',
                      }}
                    />
                    {entry.model}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className={styles.numericCell}>
                {formatTokenCount(entry.tokens)}
              </td>
              <td className={styles.numericCell}>
                {formatCost(entry.estimatedUsd)}
              </td>
              <td className={styles.barCell}>
                <span
                  className={styles.proportionBar}
                  style={{
                    width: `${Math.round(entry.proportion * 100)}%`,
                  }}
                />
              </td>
              <td>
                {entry.detail}
                {entry.childSessionRef && onSessionNavigate && (
                  <button
                    type="button"
                    className={styles.drillDownButton}
                    onClick={() => onSessionNavigate(entry.childSessionRef!)}
                    title={`Open child session ${entry.childSessionRef}`}
                  >
                    Open session ↗
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
});
HotConsumptionTable.displayName = 'HotConsumptionTable';
