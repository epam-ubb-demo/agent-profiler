/**
 * Tests for useSortableData hook.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSortableData } from '../src/session-detail/useSortableData';

interface TestRow {
  name: string;
  value: number;
  optional?: string | null;
}

const DATA: readonly TestRow[] = [
  { name: 'banana', value: 2, optional: 'y' },
  { name: 'apple', value: 1, optional: null },
  { name: 'cherry', value: 3, optional: 'x' },
];

describe('useSortableData', () => {
  it('returns unsorted data by default', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    expect(result.current.sortedData).toEqual(DATA);
    expect(result.current.sortConfig.direction).toBeNull();
  });

  it('sorts ascending on first click', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    act(() => result.current.requestSort('name'));
    expect(result.current.sortedData.map((r) => r.name)).toEqual(['apple', 'banana', 'cherry']);
    expect(result.current.getSortDirection('name')).toBe('asc');
  });

  it('sorts descending on second click', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name'));
    expect(result.current.sortedData.map((r) => r.name)).toEqual(['cherry', 'banana', 'apple']);
    expect(result.current.getSortDirection('name')).toBe('desc');
  });

  it('resets to unsorted on third click', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name'));
    expect(result.current.sortedData).toEqual(DATA);
    expect(result.current.getSortDirection('name')).toBeNull();
  });

  it('sorts numbers correctly', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    act(() => result.current.requestSort('value'));
    expect(result.current.sortedData.map((r) => r.value)).toEqual([1, 2, 3]);
  });

  it('pushes null/undefined values to end regardless of direction', () => {
    const dataWithNulls: readonly TestRow[] = [
      { name: 'a', value: 1, optional: null },
      { name: 'b', value: 2, optional: 'z' },
      { name: 'c', value: 3, optional: 'a' },
    ];
    const { result } = renderHook(() => useSortableData(dataWithNulls));

    act(() => result.current.requestSort('optional'));
    const ascResult = result.current.sortedData.map((r) => r.optional);
    expect(ascResult[ascResult.length - 1]).toBeNull();

    act(() => result.current.requestSort('optional'));
    const descResult = result.current.sortedData.map((r) => r.optional);
    expect(descResult[descResult.length - 1]).toBeNull();
  });

  it('resets direction when switching to a different column', () => {
    const { result } = renderHook(() => useSortableData(DATA));
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name')); // desc
    act(() => result.current.requestSort('value')); // new column → asc
    expect(result.current.getSortDirection('value')).toBe('asc');
    expect(result.current.getSortDirection('name')).toBeNull();
  });

  it('respects defaultSort config', () => {
    const { result } = renderHook(() =>
      useSortableData(DATA, { key: 'value', direction: 'desc' }),
    );
    expect(result.current.sortedData.map((r) => r.value)).toEqual([3, 2, 1]);
  });
});
