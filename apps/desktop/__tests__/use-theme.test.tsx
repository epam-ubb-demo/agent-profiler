import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTheme } from '../src/renderer/components/useTheme';

const STORAGE_KEY = 'agent-profiler-theme';

// Provide a working localStorage for tests (jsdom may not provide one with full API)
const storageMap = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
  get length() { return storageMap.size; },
  key: (index: number) => [...storageMap.keys()][index] ?? null,
};

beforeEach(() => {
  storageMap.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
  document.documentElement.className = '';
});

afterEach(() => {
  storageMap.clear();
  document.documentElement.className = '';
});

describe('useTheme', () => {
  it('returns light theme by default', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('toggles from light to dark', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
  });

  it('toggles back from dark to light', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme(); // → dark
    });
    act(() => {
      result.current.toggleTheme(); // → light
    });

    expect(result.current.theme).toBe('light');
  });

  it('persists theme to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('reads initial value from localStorage', () => {
    localStorageMock.setItem(STORAGE_KEY, 'dark');

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('applies uui-theme-loveship class for light theme', () => {
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('uui-theme-loveship')).toBe(true);
  });

  it('applies uui-theme-loveship_dark class for dark theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(document.documentElement.classList.contains('uui-theme-loveship_dark')).toBe(true);
    expect(document.documentElement.classList.contains('uui-theme-loveship')).toBe(false);
  });
});
