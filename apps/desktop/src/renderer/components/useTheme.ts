import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'agent-profiler-theme';
const LIGHT_CLASS = 'uui-theme-loveship';
const DARK_CLASS = 'uui-theme-loveship_dark';

export type Theme = 'light' | 'dark';

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage may be unavailable in some environments
  }
  return 'light';
}

function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.remove(LIGHT_CLASS);
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
    root.classList.add(LIGHT_CLASS);
  }
}

/**
 * Manages the dark/light theme preference for the EPAM UUI Loveship theme.
 *
 * Persists the choice to localStorage and applies the appropriate CSS class
 * (`uui-theme-loveship` or `uui-theme-loveship_dark`) to `<html>`.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  // Apply the theme class on mount and whenever theme changes
  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore write failures
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme } as const;
}
