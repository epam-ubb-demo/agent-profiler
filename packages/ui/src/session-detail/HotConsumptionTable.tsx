/**
 * Hottest token consumption points table — ranks the most expensive
 * turns, sub-agent calls, and compaction events by total token usage,
 * with type badges, model dots, and proportion bars.
 */

import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import type { HotConsumptionEntry, HotConsumptionResult } from './hot-consumption';
import styles from './session-detail.module.css';

export interface HotConsumptionTableProps {
  readonly result: HotConsumptionResult;
  readonly includeCompactions: boolean;
  readonly onToggleCompactions: () => void;
  readonly modelColours: Record<string, string>;
}

const TYPE_BADGE_CLASS: Record<HotConsumptionEntry['type'], string> = {
  turn: styles.typeBadgeTurn,
  'sub-agent': styles.typeBadgeSubagent,
  compaction: styles.typeBadgeCompaction,
};

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

function HotConsumptionTableInner({
  result,
  includeCompactions,
  onToggleCompactions,
  modelColours,
}: HotConsumptionTableProps) {
  const { entries, totalEntries, topNTokens } = result;

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

      {/* ---- Table ------------------------------------------------------ */}
      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Time</th>
            <th scope="col">Type</th>
            <th scope="col">Where</th>
            <th scope="col">Model</th>
            <th scope="col" className={styles.numericCell}>Tokens</th>
            <th scope="col" className={styles.numericCell}>Est. USD</th>
            <th scope="col" className={styles.barCell} />
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.rank}>
              <td>{entry.rank}</td>
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
              <td>{entry.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export const HotConsumptionTable = memo(HotConsumptionTableInner);
HotConsumptionTable.displayName = 'HotConsumptionTable';
