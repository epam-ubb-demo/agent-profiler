import type * as AgentProfilerUi from '@agent-profiler/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronApi } from '../src/preload/api';
import { SessionDetail } from '../src/renderer/pages/SessionDetail';

import { cleanup, fireEvent, render, screen, waitFor } from './test-utils';

// Minimal mock session data
function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session-id',
    copilotVersion: '1.0.0',
    selectedModel: 'gpt-4',
    reasoningEffort: 'high',
    repository: 'owner/repo',
    branch: 'main',
    cwd: '/home/user/repo',
    startTs: '2024-12-01T10:00:00.000Z',
    endTs: '2024-12-01T10:30:00.000Z',
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
}

// Mock @agent-profiler/ui components
vi.mock('@agent-profiler/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentProfilerUi>();
  return {
    ...actual,
    SessionDetailView: ({ session, onBack }: { session: { sessionId: string; parseStatus: { status: string; error: string | null } }; onBack: () => void }) => (
      <div data-testid="session-detail">
        <button aria-label="Back" onClick={onBack}>Back</button>
        <div data-testid="timeline">Timeline: {session.sessionId}</div>
        <div data-testid="turn-list">TurnList: {session.sessionId}</div>
        {session.parseStatus.status === 'failed' && <div>{session.parseStatus.error}</div>}
      </div>
    ),
  };
});

const mockElectronApi = {
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
  pdf: {
    selectOutputPath: vi.fn(),
    exportCurrentView: vi.fn(),
    exportSession: vi.fn(),
  },
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    testConnection: vi.fn(),
    listWorkspaces: vi.fn(),
  },
  sync: {
    getSettings: vi.fn<ElectronApi['sync']['getSettings']>().mockResolvedValue({ enabled: false, categories: { metadata: true, utilisation: true, compactions: true, toolResults: false }, otlpEndpoint: '' }),
    setSettings: vi.fn<ElectronApi['sync']['setSettings']>().mockResolvedValue(undefined),
    getStatus: vi.fn<ElectronApi['sync']['getStatus']>().mockResolvedValue({ state: 'idle', lastSyncedAt: null, sessionsPending: 0, sessionsTotal: 0, lastError: null }),
    trigger: vi.fn<ElectronApi['sync']['trigger']>().mockResolvedValue(undefined),
    onStatusUpdated: vi.fn<ElectronApi['sync']['onStatusUpdated']>().mockReturnValue(() => {}),
  },
} satisfies ElectronApi;

beforeEach(() => {
  Object.defineProperty(window, 'electronApi', { value: mockElectronApi, writable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionDetail', () => {
  it('shows loading state initially', async () => {
    vi.mocked(mockElectronApi.session.open).mockImplementation(() => new Promise(() => {}));
    await render(<SessionDetail sessionId="test-id" onBack={vi.fn()} />);
    expect(screen.getByTestId('session-detail-loading')).toBeDefined();
  });

  it('renders timeline and turn list when session loads', async () => {
    vi.mocked(mockElectronApi.session.open).mockResolvedValue(createMockSession());

    await render(<SessionDetail sessionId="test-session-id" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-detail')).toBeDefined();
    });

    expect(screen.getByTestId('timeline')).toBeDefined();
    expect(screen.getByTestId('turn-list')).toBeDefined();
  });

  it('shows error state when session not found', async () => {
    vi.mocked(mockElectronApi.session.open).mockResolvedValue(null);

    await render(<SessionDetail sessionId="missing-id" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-detail-error')).toBeDefined();
    });

    expect(screen.getByText('Session not found')).toBeDefined();
  });

  it('shows error for failed parse status but still renders session', async () => {
    vi.mocked(mockElectronApi.session.open).mockResolvedValue(
      createMockSession({
        parseStatus: { status: 'failed', error: 'Corrupt events.jsonl' },
      }),
    );

    await render(<SessionDetail sessionId="test-id" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-detail')).toBeDefined();
    });

    expect(screen.getByText('Corrupt events.jsonl')).toBeDefined();
  });

  it('calls onBack when back button is clicked', async () => {
    vi.mocked(mockElectronApi.session.open).mockResolvedValue(createMockSession());
    const onBack = vi.fn();

    await render(<SessionDetail sessionId="test-id" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-detail')).toBeDefined();
    });

    screen.getByLabelText('Back').click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('SessionErrorFallback', () => {
  it('displays session ID and path in error details when show details is clicked', async () => {
    // Make the mock SessionDetailView throw to trigger the ErrorBoundary fallback
    vi.doMock('@agent-profiler/ui', async (importOriginal) => {
      const actual = await importOriginal<typeof AgentProfilerUi>();
      return {
        ...actual,
        SessionDetailView: () => { throw new Error('Test render crash'); },
      };
    });

    // Re-import to pick up the throwing mock
    vi.resetModules();
    const { SessionDetail: SessionDetailFresh } = await import('../src/renderer/pages/SessionDetail');

    // Suppress React error boundary console noise
    const originalConsoleError = console.error;
    console.error = vi.fn();

    try {
      vi.mocked(mockElectronApi.session.open).mockResolvedValue(createMockSession({ sessionId: 'abc-123-def' }));

      await render(<SessionDetailFresh sessionId="abc-123-def" onBack={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('session-detail-render-error')).toBeDefined();
      });

      // Click "Show details"
      const showDetailsBtn = screen.getByRole('button', { name: /show details/i });
      fireEvent.click(showDetailsBtn);

      // Verify session ID is displayed
      expect(screen.getByText('abc-123-def')).toBeDefined();
      // Verify session path is displayed
      expect(screen.getByText('~/.copilot/session-state/abc-123-def')).toBeDefined();
      // Verify labels are present
      expect(screen.getByText('Session')).toBeDefined();
      expect(screen.getByText('Path')).toBeDefined();
    } finally {
      console.error = originalConsoleError;
    }
  });
});