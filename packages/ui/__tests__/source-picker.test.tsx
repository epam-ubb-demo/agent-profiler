/**
 * Tests for the Source Picker UI components.
 */

import { describe, expect, it, afterEach, vi } from 'vitest';

import { SourceCard } from '../src/settings/SourceCard';
import { SourcePickerPanel } from '../src/settings/SourcePickerPanel';
import type { DiscoverFn, DiscoveryStatus, SourceConfig, SourceType } from '../src/settings/types';

import { render, screen, fireEvent, cleanup, act, waitFor } from './test-utils';

// Mock localStorage for jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

afterEach(() => {
  cleanup();
  localStorageMock.clear();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    type: 'copilot-cli',
    label: 'Copilot CLI',
    description: 'Sessions from ~/.copilot/session-state/',
    enabled: true,
    ...overrides,
  };
}

function createDiscoverMock(
  results: Partial<Record<SourceType, { count: number; path: string }>>,
): DiscoverFn {
  return async (type: SourceType) => {
    const result = results[type];
    if (result) return result;
    throw new Error('path not found');
  };
}

function createDelayedDiscover(delay: number): DiscoverFn {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return { count: 10, path: '/test/path' };
  };
}

// ─── SourceCard Tests ───────────────────────────────────────────────────────

describe('SourceCard', () => {
  it('displays correct label and description', () => {
    const source = makeSource({
      label: 'Copilot CLI',
      description: 'Sessions from ~/.copilot/session-state/',
    });
    const status: DiscoveryStatus = { state: 'idle' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    expect(screen.getByTestId('source-label-copilot-cli')).toHaveTextContent('Copilot CLI');
    expect(screen.getByTestId('source-description-copilot-cli')).toHaveTextContent(
      'Sessions from ~/.copilot/session-state/',
    );
  });

  it('renders toggle switch with correct checked state', () => {
    const source = makeSource({ enabled: true });
    const status: DiscoveryStatus = { state: 'idle' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const toggle = screen.getByTestId('source-toggle-copilot-cli') as HTMLInputElement;
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute('role', 'switch');
  });

  it('calls onToggle when switch is toggled', () => {
    const source = makeSource({ enabled: false });
    const status: DiscoveryStatus = { state: 'idle' };
    const onToggle = vi.fn();

    render(<SourceCard source={source} status={status} onToggle={onToggle} />);

    fireEvent.click(screen.getByTestId('source-toggle-copilot-cli'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows status badge with correct state colours — found (green)', () => {
    const source = makeSource();
    const status: DiscoveryStatus = { state: 'found', count: 42, path: '~/.copilot/session-state/' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const badge = screen.getByTestId('source-status-copilot-cli');
    expect(badge).toHaveTextContent('42 sessions found');
    // UUI Badge uses CSS classes for colour, not inline styles
    expect(badge).toBeInTheDocument();
  });

  it('shows status badge — scanning (yellow)', () => {
    const source = makeSource();
    const status: DiscoveryStatus = { state: 'scanning' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const badge = screen.getByTestId('source-status-copilot-cli');
    expect(badge).toHaveTextContent('Scanning...');
    expect(badge).toBeInTheDocument();
  });

  it('shows status badge — error (red)', () => {
    const source = makeSource();
    const status: DiscoveryStatus = { state: 'error', message: 'path not found' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const badge = screen.getByTestId('source-status-copilot-cli');
    expect(badge).toHaveTextContent('Error: path not found');
    expect(badge).toBeInTheDocument();
  });

  it('shows status badge — idle (grey)', () => {
    const source = makeSource();
    const status: DiscoveryStatus = { state: 'idle' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const badge = screen.getByTestId('source-status-copilot-cli');
    expect(badge).toHaveTextContent('Idle');
    expect(badge).toBeInTheDocument();
  });

  it('shows discovered path when status is found', () => {
    const source = makeSource();
    const status: DiscoveryStatus = { state: 'found', count: 5, path: '~/.copilot/session-state/' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    expect(screen.getByTestId('source-path-copilot-cli')).toHaveTextContent(
      '~/.copilot/session-state/',
    );
  });

  it('has proper aria-label on toggle', () => {
    const source = makeSource({ label: 'VS Code Chat', type: 'vscode-chat' });
    const status: DiscoveryStatus = { state: 'idle' };

    render(<SourceCard source={source} status={status} onToggle={() => {}} />);

    const toggle = screen.getByTestId('source-toggle-vscode-chat');
    expect(toggle).toHaveAttribute('aria-label', 'Enable VS Code Chat');
  });
});

// ─── SourcePickerPanel Tests ────────────────────────────────────────────────

describe('SourcePickerPanel', () => {
  it('renders all 4 sources', () => {
    const discover = createDiscoverMock({});

    render(<SourcePickerPanel discover={discover} />);

    expect(screen.getByTestId('source-card-copilot-cli')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-vscode-chat')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-vscode-coding-agent')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-ctb')).toBeInTheDocument();
  });

  it('toggle switch calls onSourcesChanged', async () => {
    const discover = createDiscoverMock({
      'copilot-cli': { count: 5, path: '/p' },
      'vscode-chat': { count: 3, path: '/p2' },
      'vscode-coding-agent': { count: 1, path: '/p3' },
    });
    const onSourcesChanged = vi.fn();

    render(<SourcePickerPanel discover={discover} onSourcesChanged={onSourcesChanged} />);

    // Initially: copilot-cli, vscode-chat, vscode-coding-agent enabled; ctb disabled
    // Toggle ctb on
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-toggle-ctb'));
    });

    // onSourcesChanged should have been called with ctb now included
    const lastCall = onSourcesChanged.mock.calls[onSourcesChanged.mock.calls.length - 1]!;
    expect(lastCall[0]).toContain('ctb');
  });

  it('shows "Scanning..." during discovery', async () => {
    const discover = createDelayedDiscover(500);

    render(<SourcePickerPanel discover={discover} />);

    // Should show scanning for enabled sources
    await waitFor(() => {
      expect(screen.getByTestId('source-status-copilot-cli')).toHaveTextContent('Scanning...');
    });
  });

  it('shows session count after successful discovery', async () => {
    const discover = createDiscoverMock({
      'copilot-cli': { count: 42, path: '~/.copilot/session-state/' },
      'vscode-chat': { count: 10, path: '/workspace' },
      'vscode-coding-agent': { count: 7, path: '/workspace' },
    });

    render(<SourcePickerPanel discover={discover} />);

    await waitFor(() => {
      expect(screen.getByTestId('source-status-copilot-cli')).toHaveTextContent('42 sessions found');
    });
  });

  it('shows error state for failed discovery', async () => {
    const discover: DiscoverFn = async (type) => {
      if (type === 'copilot-cli') throw new Error('path not found');
      return { count: 5, path: '/p' };
    };

    render(<SourcePickerPanel discover={discover} />);

    await waitFor(() => {
      expect(screen.getByTestId('source-status-copilot-cli')).toHaveTextContent('Error: path not found');
    });
  });

  it('disabled sources do not trigger discovery', async () => {
    const discover = vi.fn().mockResolvedValue({ count: 1, path: '/p' });

    const sources: SourceConfig[] = [
      { type: 'copilot-cli', label: 'Copilot CLI', description: 'desc', enabled: false },
      { type: 'vscode-chat', label: 'VS Code Chat', description: 'desc', enabled: false },
      { type: 'vscode-coding-agent', label: 'Coding Agent', description: 'desc', enabled: false },
      { type: 'ctb', label: 'CTB', description: 'desc', enabled: false },
    ];

    render(<SourcePickerPanel discover={discover} initialSources={sources} />);

    // Wait a tick to ensure nothing was called
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(discover).not.toHaveBeenCalled();
  });

  it('re-enabling a source triggers re-scan', async () => {
    const discover = vi.fn().mockResolvedValue({ count: 3, path: '/p' });

    const sources: SourceConfig[] = [
      { type: 'copilot-cli', label: 'Copilot CLI', description: 'desc', enabled: false },
      { type: 'vscode-chat', label: 'VS Code Chat', description: 'desc', enabled: false },
      { type: 'vscode-coding-agent', label: 'Coding Agent', description: 'desc', enabled: false },
      { type: 'ctb', label: 'CTB', description: 'desc', enabled: false },
    ];

    render(<SourcePickerPanel discover={discover} initialSources={sources} />);

    // Enable copilot-cli
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-toggle-copilot-cli'));
    });

    await waitFor(() => {
      expect(discover).toHaveBeenCalledWith('copilot-cli');
    });
  });

  it('all sources can be toggled independently', async () => {
    const discover = vi.fn().mockResolvedValue({ count: 1, path: '/p' });
    const onSourcesChanged = vi.fn();

    const sources: SourceConfig[] = [
      { type: 'copilot-cli', label: 'Copilot CLI', description: 'desc', enabled: true },
      { type: 'vscode-chat', label: 'VS Code Chat', description: 'desc', enabled: true },
      { type: 'vscode-coding-agent', label: 'Coding Agent', description: 'desc', enabled: true },
      { type: 'ctb', label: 'CTB', description: 'desc', enabled: true },
    ];

    render(
      <SourcePickerPanel discover={discover} onSourcesChanged={onSourcesChanged} initialSources={sources} />,
    );

    // Toggle off just vscode-chat
    await act(async () => {
      fireEvent.click(screen.getByTestId('source-toggle-vscode-chat'));
    });

    const lastCall = onSourcesChanged.mock.calls[onSourcesChanged.mock.calls.length - 1]!;
    expect(lastCall[0]).toContain('copilot-cli');
    expect(lastCall[0]).not.toContain('vscode-chat');
    expect(lastCall[0]).toContain('vscode-coding-agent');
    expect(lastCall[0]).toContain('ctb');
  });

  it('persists preferences to localStorage', async () => {
    const discover = vi.fn().mockResolvedValue({ count: 1, path: '/p' });
    const key = 'test-storage-key';

    render(<SourcePickerPanel discover={discover} storageKey={key} />);

    await waitFor(() => {
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toContain('copilot-cli');
    });
  });
});
