import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronApi } from '../src/preload/api';
import { SessionDetail } from '../src/renderer/pages/SessionDetail';

import { cleanup, render, screen, waitFor } from './test-utils';

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
vi.mock('@agent-profiler/ui', () => ({
  Timeline: ({ session }: { session: unknown }) => (
    <div data-testid="timeline">Timeline: {(session as { sessionId: string }).sessionId}</div>
  ),
  TurnList: ({ session }: { session: unknown }) => (
    <div data-testid="turn-list">TurnList: {(session as { sessionId: string }).sessionId}</div>
  ),
  FanoutTree: ({ session }: { session: unknown }) => {
    const s = session as { fanoutTurns: unknown[] };
    if (s.fanoutTurns.length === 0) return null;
    return <div data-testid="fanout-tree">FanoutTree</div>;
  },
}));

const mockElectronApi = {
  getVersion: vi.fn<() => Promise<string>>().mockResolvedValue('0.0.0'),
  session: {
    list: vi.fn(),
    open: vi.fn(),
    setRootDir: vi.fn(),
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
