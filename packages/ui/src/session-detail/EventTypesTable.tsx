/**
 * Simple table component showing event type counts for a session.
 */

import { memo } from 'react';

import type { EventTypeRow } from './event-type-stats';
import styles from './session-detail.module.css';

export interface EventTypesTableProps {
  readonly rows: readonly EventTypeRow[];
}

function EventTypesTableInner({ rows }: EventTypesTableProps) {
  return (
    <table className={styles.dataTable} role="grid">
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col" className={styles.numericCell}>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.type}>
            <td>{row.type}</td>
            <td className={styles.numericCell}>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const EventTypesTable = memo(EventTypesTableInner);
EventTypesTable.displayName = 'EventTypesTable';
