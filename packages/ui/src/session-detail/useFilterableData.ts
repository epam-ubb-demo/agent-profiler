/**
 * Generic hook for text-based filtering of data arrays.
 *
 * Matches if ANY of the specified keys contains the filter text (substring match).
 * Case-insensitive by default. Optional debounce (default 150ms).
 */

import { useEffect, useMemo, useState } from 'react';

export interface UseFilterableDataOptions {
  caseSensitive?: boolean;
  debounceMs?: number;
}

export interface UseFilterableDataResult<T> {
  filteredData: readonly T[];
  filterText: string;
  setFilterText: (text: string) => void;
}

/** Retrieve a top-level property value by key, coerced to string. */
function getStringValue<T>(item: T, key: keyof T | string): string {
  const value = (item as Record<string, unknown>)[key as string];
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  return String(value);
}

export function useFilterableData<T>(
  data: readonly T[],
  filterKeys: readonly (keyof T | string)[],
  options?: UseFilterableDataOptions,
): UseFilterableDataResult<T> {
  const caseSensitive = options?.caseSensitive ?? false;
  const debounceMs = options?.debounceMs ?? 150;

  const [filterText, setFilterText] = useState('');
  const [debouncedText, setDebouncedText] = useState('');

  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedText(filterText);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedText(filterText);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [filterText, debounceMs]);

  const filteredData = useMemo(() => {
    if (debouncedText === '') return data;

    const needle = caseSensitive ? debouncedText : debouncedText.toLowerCase();

    return data.filter((item) =>
      filterKeys.some((key) => {
        const raw = getStringValue(item, key);
        const haystack = caseSensitive ? raw : raw.toLowerCase();
        return haystack.includes(needle);
      }),
    );
  }, [data, debouncedText, filterKeys, caseSensitive]);

  return { filteredData, filterText, setFilterText };
}
