/**
 * Sortable table header component.
 *
 * Replaces plain `<th>` elements with a clickable header that
 * displays a sort indicator and exposes accessibility attributes.
 */


import { memo } from 'react';

import styles from './session-detail.module.css';
import type { SortDirection } from './useSortableData';

export interface SortableHeaderProps {
  readonly label: string;
  readonly sortKey: string;
  readonly direction: SortDirection;
  readonly onSort: (key: string) => void;
  readonly className?: string;
  readonly numeric?: boolean;
}

function ariaSort(direction: SortDirection): 'ascending' | 'descending' | 'none' {
  if (direction === 'asc') return 'ascending';
  if (direction === 'desc') return 'descending';
  return 'none';
}

function sortIndicator(direction: SortDirection): string {
  if (direction === 'asc') return '▲';
  if (direction === 'desc') return '▼';
  return '⇅';
}

function SortableHeaderInner({
  label,
  sortKey,
  direction,
  onSort,
  className,
  numeric,
}: SortableHeaderProps) {
  const thClassName = [
    styles.sortableHeader,
    numeric ? styles.numericCell : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <th scope="col" className={thClassName} aria-sort={ariaSort(direction)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: numeric ? 'flex-end' : undefined,
          width: '100%',
        }}
      >
        {label}
        <span
          className={`${styles.sortIndicator}${direction != null ? ` ${styles.sortIndicatorActive}` : ''}`}
          aria-hidden="true"
        >
          {sortIndicator(direction)}
        </span>
      </button>
    </th>
  );
}

export const SortableHeader = memo(SortableHeaderInner);
