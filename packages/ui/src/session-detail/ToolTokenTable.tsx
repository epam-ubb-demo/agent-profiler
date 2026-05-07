
import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import type { ToolStatsResult } from './tool-stats';

/** Props for {@link ToolTokenTable}. */
export interface ToolTokenTableProps {
  readonly result: ToolStatsResult;
  readonly modelColours: Record<string, string>;
}

/**
 * Renders a table showing token consumption attributed to each tool call,
 * with per-model colour dots and a proportion bar.
 */
function ToolTokenTableInner({ result, modelColours }: ToolTokenTableProps) {
  const { tokenStats, tokenTotals } = result;

  return (
    <>
      <p className={styles.sectionDescription}>
        Token attribution distributes each turn&rsquo;s output tokens evenly
        across the tool calls within that turn.
      </p>

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Models</th>
            <th className={styles.numericCell}>Calls</th>
            <th className={styles.numericCell}>Total tokens</th>
            <th className={styles.numericCell}>Avg tokens/call</th>
            <th className={styles.numericCell}>Total USD</th>
            <th className={styles.numericCell}>Avg USD/call</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {tokenStats.map((row) => (
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
}

export const ToolTokenTable = memo(ToolTokenTableInner);
ToolTokenTable.displayName = 'ToolTokenTable';
