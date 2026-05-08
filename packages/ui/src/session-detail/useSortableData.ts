/**
 * Generic hook for sorting arrays of data.
 *
 * Clicking the same column cycles: asc → desc → null (reset).
 * Null/undefined values sort to end regardless of direction.
 */

import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
  key: keyof T | string;
  direction: SortDirection;
}

export interface UseSortableDataResult<T> {
  sortedData: readonly T[];
  sortConfig: SortConfig<T>;
  requestSort: (key: keyof T | string) => void;
  getSortDirection: (key: keyof T | string) => SortDirection;
}

/** Advance direction through the cycle: null → asc → desc → null */
function nextDirection(current: SortDirection): SortDirection {
  if (current === 'asc') return 'desc';
  if (current === 'desc') return null;
  return 'asc';
}

/** Retrieve a top-level property value by key. */
function getValue<T>(item: T, key: keyof T | string): unknown {
  return (item as Record<string, unknown>)[key as string];
}

/**
 * Compare two values for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Null/undefined values are pushed to the end regardless of direction.
 */
function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  const aIsNullish = a == null;
  const bIsNullish = b == null;

  if (aIsNullish && bIsNullish) return 0;
  if (aIsNullish) return 1;
  if (bIsNullish) return -1;

  let result: number;

  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  }

  return direction === 'desc' ? -result : result;
}

const DEFAULT_SORT_CONFIG: SortConfig<unknown> = { key: '', direction: null };

export function useSortableData<T>(
  data: readonly T[],
  defaultSort?: SortConfig<T>,
): UseSortableDataResult<T> {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(
    defaultSort ?? (DEFAULT_SORT_CONFIG as SortConfig<T>),
  );

  const requestSort = useCallback((key: keyof T | string) => {
    setSortConfig((prev) => {
      const newDirection = prev.key === key ? nextDirection(prev.direction) : 'asc';
      return newDirection === null ? { key: '' as keyof T | string, direction: null } : { key, direction: newDirection };
    });
  }, []);

  const getSortDirection = useCallback(
    (key: keyof T | string): SortDirection => {
      return sortConfig.key === key ? sortConfig.direction : null;
    },
    [sortConfig],
  );

  const sortedData = useMemo(() => {
    if (sortConfig.direction === null || sortConfig.key === '') {
      return data;
    }

    const { key, direction } = sortConfig;
    return [...data].sort((a, b) => {
      const aVal = getValue(a, key);
      const bVal = getValue(b, key);
      return compareValues(aVal, bVal, direction);
    });
  }, [data, sortConfig]);

  return { sortedData, sortConfig, requestSort, getSortDirection };
}
