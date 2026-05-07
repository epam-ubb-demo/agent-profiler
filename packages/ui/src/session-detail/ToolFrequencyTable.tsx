/**
 * Table component displaying per-tool call frequency with a proportion bar.
 */

import { memo } from 'react';

import styles from './session-detail.module.css';
import type { ToolFrequencyRow } from './tool-stats';

export interface ToolFrequencyTableProps {
  readonly rows: readonly ToolFrequencyRow[];
}

function ToolFrequencyTableInner({ rows }: ToolFrequencyTableProps) {
  return (
    <table className={styles.dataTable} role="grid">
      <thead>
        <tr>
          <th scope="col">Tool</th>
          <th scope="col" className={styles.numericCell}>Calls</th>
          <th scope="col" className={styles.barCell} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
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
  );
}

export const ToolFrequencyTable = memo(ToolFrequencyTableInner);
ToolFrequencyTable.displayName = 'ToolFrequencyTable';
