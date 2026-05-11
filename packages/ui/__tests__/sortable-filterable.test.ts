/**
 * Tests for useFilterableData hook.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFilterableData } from '../src/session-detail/useFilterableData';

interface TestRow {
  name: string;
  value: number;
  tag: string | null;
}

const DATA: readonly TestRow[] = [
  { name: 'Alpha Service', value: 100, tag: 'api' },
  { name: 'Beta Component', value: 200, tag: null },
  { name: 'Gamma API', value: 300, tag: 'core' },
];

describe('useFilterableData', () => {
  it('returns all data when filter text is empty', () => {
    const { result } = renderHook(() => useFilterableData(DATA, ['name'], { debounceMs: 0 }));
    expect(result.current.filteredData).toEqual(DATA);
  });

  it('filters by substring match (case-insensitive by default)', () => {
    const { result } = renderHook(() => useFilterableData(DATA, ['name'], { debounceMs: 0 }));
    act(() => result.current.setFilterText('alpha'));
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.filteredData[0]!.name).toBe('Alpha Service');
  });

  it('filters across multiple keys', () => {
    const { result } = renderHook(() =>
      useFilterableData(DATA, ['name', 'tag'], { debounceMs: 0 }),
    );
    act(() => result.current.setFilterText('api'));
    // Matches "Gamma API" (name) and "Alpha Service" (tag: 'api')
    expect(result.current.filteredData).toHaveLength(2);
  });

  it('handles null values in filter keys', () => {
    const { result } = renderHook(() => useFilterableData(DATA, ['tag'], { debounceMs: 0 }));
    act(() => result.current.setFilterText('core'));
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.filteredData[0]!.name).toBe('Gamma API');
  });

  it('converts numeric values to string for matching', () => {
    const { result } = renderHook(() => useFilterableData(DATA, ['value'], { debounceMs: 0 }));
    act(() => result.current.setFilterText('200'));
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.filteredData[0]!.name).toBe('Beta Component');
  });

  it('supports case-sensitive filtering', () => {
    const { result } = renderHook(() =>
      useFilterableData(DATA, ['name'], { caseSensitive: true, debounceMs: 0 }),
    );
    act(() => result.current.setFilterText('alpha'));
    expect(result.current.filteredData).toHaveLength(0);
    act(() => result.current.setFilterText('Alpha'));
    expect(result.current.filteredData).toHaveLength(1);
  });

  it('debounces filter text changes', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFilterableData(DATA, ['name'], { debounceMs: 150 }));

    act(() => result.current.setFilterText('alpha'));
    // Before debounce fires, data should still be unfiltered
    expect(result.current.filteredData).toEqual(DATA);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.filteredData).toHaveLength(1);

    vi.useRealTimers();
  });
});
