import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/renderer/components/AppShell';

import { cleanup, render, screen } from './test-utils';

// Mock useTheme so we can control theme state without side effects
const mockToggleTheme = vi.fn();
vi.mock('../src/renderer/components/useTheme', () => ({
  useTheme: () => ({ theme: 'light' as const, toggleTheme: mockToggleTheme }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('renders children', async () => {
    await render(
      <AppShell>
        <div data-testid="child-content">Hello</div>
      </AppShell>,
    );

    expect(screen.getByTestId('child-content')).toBeDefined();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('renders EPAM logo image and app title', async () => {
    await render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByAltText('EPAM')).toBeDefined();
    expect(screen.getByText('Agent Profiler')).toBeDefined();
  });

  it('renders theme toggle button', async () => {
    await render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    // When theme is 'light', the button should offer switching to dark
    const toggle = screen.getByLabelText(/Switch to dark theme/i);
    expect(toggle).toBeDefined();
  });

  it('calls toggleTheme when theme button is clicked', async () => {
    await render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const toggle = screen.getByLabelText(/Switch to dark theme/i);
    toggle.click();

    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });
});
