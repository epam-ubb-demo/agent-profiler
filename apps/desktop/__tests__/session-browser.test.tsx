import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronApi, SessionListItemIpc, SessionListMetricsIpc } from '../src/preload/api';
import { SessionBrowser } from '../src/renderer/pages/SessionBrowser';

import { act, cleanup, fireEvent, render, screen, waitFor } from './test-utils';

// Mock the CSS module so that class name lookups return the key name (string)
vi.mock('../src/renderer/pages/SessionBrowser.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => String(prop) }),
}));

// Stub CombinedAnalyticsChart to avoid SVG rendering complexity in SessionBrowser tests
vi.mock('../src/renderer/components/CombinedAnalyticsChart', () => ({
  CombinedAnalyticsChart: () => <div data-testid="combined-analytics-chart-stub" />,
}));

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<SessionListMetricsIpc> = {}): SessionListMetricsIpc {
  return {
    totalInputTokens: 5000,
    totalOutputTokens: 3000,
    totalCacheReadTokens: 1000,
    totalCacheWriteTokens: 500,
    totalCostUsd: 0.15,
    costConfidence: 'known' as const,
    wallTimeMs: 120_000,
    repository: 'owner/repo',
    modelUsage: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionListItemIpc> = {}): SessionListItemIpc {
  return {
    id: `session-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-session',
    path: '/home/user/.copilot/session-state/test-session',
    createdAt: new Date().toISOString(),
    adapter: 'copilot-cli' as const,
    metrics: makeMetrics(),
    ...overrides,
  };
}

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockElectronApi: ElectronApi = {
  getVersion: vi.fn<() => Promise<string>>().mockResolvedValue('0.0.0'),
  session: {
    list: vi.fn(),
    open: vi.fn(),
    setRootDir: vi.fn(),
    onListUpdated: vi.fn<ElectronApi['session']['onListUpdated']>().mockReturnValue(() => {}),
    getScanningState: vi.fn<ElectronApi['session']['getScanningState']>().mockResolvedValue(false),
    onScanningStateChanged: vi.fn<ElectronApi['session']['onScanningStateChanged']>().mockReturnValue(() => {}),
  },
  dialog: {
    openDirectory: vi.fn(),
  },
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    testConnection: vi.fn(),
  },
  pdf: {
    selectOutputPath: vi.fn(),
    exportCurrentView: vi.fn(),
    exportSession: vi.fn(),
  },
} as unknown as ElectronApi;

beforeEach(() => {
  Object.defineProperty(window, 'electronApi', { value: mockElectronApi, writable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionBrowser', () => {
  it('renders session grid when sessions are available', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', name: 'session-1', createdAt: '2024-12-01T10:00:00.000Z' }),
      makeSession({ id: 'session-2', name: 'session-2', createdAt: '2024-12-02T10:00:00.000Z' }),
    ]);

    const onSelect = vi.fn();
    await render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    expect(screen.getByTestId('session-list')).toBeDefined();
  });

  it('shows empty state when no sessions found', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);

    const onSelect = vi.fn();
    await render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined();
    });

    expect(screen.getByText('No sessions found')).toBeDefined();
  });

  it('open folder button triggers dialog and reloads sessions', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.dialog.openDirectory).mockResolvedValue('/new/path');
    vi.mocked(mockElectronApi.session.setRootDir).mockResolvedValue(true);

    const onSelect = vi.fn();
    await render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined();
    });

    const openBtn = screen.getByRole('button', { name: /Open a folder/i });

    // After clicking, mock returns a session
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'new-session', name: 'new-session', path: '/new/path/new-session', createdAt: '2024-12-03T10:00:00.000Z' }),
    ]);

    openBtn.click();

    await waitFor(() => {
      expect(mockElectronApi.dialog.openDirectory).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockElectronApi.session.setRootDir).toHaveBeenCalledWith('/new/path');
    });
  });

  it('search filter filters sessions by name', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'alpha', name: 'alpha-session' }),
      makeSession({ id: 'beta', name: 'beta-session' }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    // UUI TextInput renders the actual <input> with the placeholder
    const input = screen.getByPlaceholderText('Search by name, ID, path, or repo…');
    fireEvent.change(input, { target: { value: 'alpha' } });

    await waitFor(() => {
      const cards = screen.getAllByTestId('session-card');
      expect(cards).toHaveLength(1);
    });
  });

  it('shows empty filter state when no sessions match search', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ name: 'real-session' }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    const input = screen.getByPlaceholderText('Search by name, ID, path, or repo…');
    fireEvent.change(input, { target: { value: 'xyzzy-no-match' } });

    await waitFor(() => {
      expect(screen.getByTestId('empty-filter-state')).toBeDefined();
    });
  });

  it('card click calls onSelectSession with the session id', async () => {
    const session = makeSession({ id: 'clickable-session' });
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([session]);

    const onSelect = vi.fn();
    await render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-card')).toBeDefined();
    });

    const card = screen.getByTestId('session-card');
    card.click();

    expect(onSelect).toHaveBeenCalledWith('clickable-session');
  });

  it('shows session count badge', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession(),
      makeSession(),
      makeSession(),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-count-badge')).toBeDefined();
    });

    const badge = screen.getByTestId('session-count-badge');
    expect(badge.textContent).toContain('3');
  });

  it('groups sessions by day with day headings', async () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 's1', createdAt: today }),
      makeSession({ id: 's2', createdAt: yesterday }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      const headings = screen.getAllByTestId('day-heading');
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });

    const headings = screen.getAllByTestId('day-heading');
    const headingTexts = headings.map((h) => h.textContent ?? '');
    // textContent now includes day summary metrics after the label; check for substring
    expect(headingTexts.some((t) => t.startsWith('Today'))).toBe(true);
    expect(headingTexts.some((t) => t.startsWith('Yesterday'))).toBe(true);
  });

  it('summary bar shows aggregate metrics for filtered sessions', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ metrics: makeMetrics({ totalCostUsd: 0.10, wallTimeMs: 60_000 }) }),
      makeSession({ metrics: makeMetrics({ totalCostUsd: 0.20, wallTimeMs: 120_000 }) }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-bar')).toBeDefined();
    });

    const bar = screen.getByTestId('summary-bar');
    // Total cost = $0.30
    expect(bar.textContent).toContain('$0.30');
    // 2 sessions
    expect(bar.textContent).toContain('2 sessions');
  });

  it('displays token metrics on session cards', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ metrics: makeMetrics({ totalInputTokens: 5000, totalOutputTokens: 3000 }) }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('token-input-pill')).toBeDefined();
    });

    expect(screen.getByTestId('token-input-pill').textContent).toContain('5.0K');
    expect(screen.getByTestId('token-output-pill').textContent).toContain('3.0K');
  });

  it('handles null metrics gracefully without crashing', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ metrics: null }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-card')).toBeDefined();
    });

    // No metric pills rendered when metrics are null
    expect(screen.queryByTestId('metrics-row')).toBeNull();
    expect(screen.queryByTestId('cost-pill')).toBeNull();
  });

  it('shows repository name on session cards', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ metrics: makeMetrics({ repository: 'acme/my-project' }) }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-repository')).toBeDefined();
    });

    expect(screen.getByTestId('session-repository').textContent).toBe('acme/my-project');
  });

  // ── Scanning state indicator tests ─────────────────────────────────────────

  it('shows scanning spinner when scanning=true and sessions=[]', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(true);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser-scanning')).toBeDefined();
    });

    expect(screen.getByText('Scanning sessions…')).toBeDefined();
  });

  it('shows empty state when scanning=false and sessions=[]', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined();
    });

    expect(screen.getByText('No sessions found')).toBeDefined();
  });

  it('calls getScanningState on mount', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(mockElectronApi.session.getScanningState).toHaveBeenCalled();
    });
  });

  it('subscribes to scanning state changes on mount', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(mockElectronApi.session.onScanningStateChanged).toHaveBeenCalled();
    });
  });

  it('updates scanning state when onScanningStateChanged fires', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    let scanningCallback: ((scanning: boolean) => void) | null = null;
    vi.mocked(mockElectronApi.session.onScanningStateChanged).mockImplementation(
      (callback) => {
        scanningCallback = callback;
        return () => {};
      },
    );

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined();
    });

    // Simulate scanning state change – callback is captured by mockImplementation above
    act(() => {
      scanningCallback!(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-browser-scanning')).toBeDefined();
    });

    expect(screen.getByText('Scanning sessions…')).toBeDefined();
  });

  it('shows sessions when sessions become available during scan', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(true);

    let listUpdateCallback: ((sessions: SessionListItemIpc[]) => void) | null = null;
    vi.mocked(mockElectronApi.session.onListUpdated).mockImplementation(
      (callback) => {
        listUpdateCallback = callback;
        return () => {};
      },
    );

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser-scanning')).toBeDefined();
    });

    // Simulate sessions being added – callback is captured by mockImplementation above
    act(() => {
      listUpdateCallback!([
        makeSession({ id: 'session-1', name: 'session-1' }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-list')).toBeDefined();
    });

    expect(screen.queryByTestId('session-browser-scanning')).toBeNull();
  });

  it('returns unsubscribe function from scanning state effect', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    const unsubscribe = vi.fn();
    vi.mocked(mockElectronApi.session.onScanningStateChanged).mockReturnValue(
      unsubscribe,
    );

    const { unmount } = await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(mockElectronApi.session.onScanningStateChanged).toHaveBeenCalled();
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  // ── Background refresh spinner tests ───────────────────────────────────────

  it('shows background refresh spinner when scanning=true and sessions are loaded', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', name: 'session-1' }),
    ]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(true);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    // The header-level background refresh spinner should be visible
    expect(screen.getByTestId('session-browser-refreshing')).toBeDefined();
    // The full-page scanning indicator must NOT appear alongside the session list
    expect(screen.queryByTestId('session-browser-scanning')).toBeNull();
  });

  it('does not show background refresh spinner when scanning=false', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', name: 'session-1' }),
    ]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    expect(screen.queryByTestId('session-browser-refreshing')).toBeNull();
  });

  it('calls onListUpdated unsubscribe on unmount', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);
    vi.mocked(mockElectronApi.session.getScanningState).mockResolvedValue(false);

    const unsubscribe = vi.fn();
    vi.mocked(mockElectronApi.session.onListUpdated).mockReturnValue(unsubscribe);

    const { unmount } = await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(mockElectronApi.session.onListUpdated).toHaveBeenCalled();
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  // ── Analytics panel tests ──────────────────────────────────────────────────

  it('analytics toggle is in the summary bar header', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', createdAt: '2024-12-01T10:00:00.000Z' }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-toggle')).toBeDefined();
    });
  });

  it('analytics panel is collapsed by default and shows toggle', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', createdAt: '2024-12-01T10:00:00.000Z' }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-toggle')).toBeDefined();
    });

    const toggle = screen.getByTestId('analytics-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Chart should not be visible when collapsed
    expect(screen.queryByTestId('combined-analytics-chart-stub')).toBeNull();
  });

  it('analytics panel expands when toggle is clicked', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', createdAt: '2024-12-01T10:00:00.000Z', metrics: makeMetrics({ totalCostUsd: 0.25 }) }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-toggle')).toBeDefined();
    });

    const toggle = screen.getByTestId('analytics-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    expect(screen.getByTestId('combined-analytics-chart-stub')).toBeDefined();
  });

  it('summary bar shows day count', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 's1', createdAt: '2024-12-01T10:00:00.000Z' }),
      makeSession({ id: 's2', createdAt: '2024-12-01T12:00:00.000Z' }),
      makeSession({ id: 's3', createdAt: '2024-12-02T10:00:00.000Z' }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-bar')).toBeDefined();
    });

    const bar = screen.getByTestId('summary-bar');
    expect(bar.textContent).toContain('2 days');
  });

  it('collapses analytics panel when toggle is clicked again', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      makeSession({ id: 'session-1', createdAt: '2024-12-01T10:00:00.000Z', metrics: makeMetrics({ totalCostUsd: 0.10 }) }),
    ]);

    await render(<SessionBrowser onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('analytics-toggle')).toBeDefined();
    });

    const toggle = screen.getByTestId('analytics-toggle');

    // Expand
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    // Collapse
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    expect(screen.queryByTestId('combined-analytics-chart-stub')).toBeNull();
  });
});
