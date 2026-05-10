import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronApi } from '../src/preload/api';
import { SessionBrowser } from '../src/renderer/pages/SessionBrowser';

// Mock the electronApi on window
const mockElectronApi: ElectronApi = {
  getVersion: vi.fn<() => Promise<string>>().mockResolvedValue('0.0.0'),
  session: {
    list: vi.fn(),
    open: vi.fn(),
    setRootDir: vi.fn(),
  },
  dialog: {
    openDirectory: vi.fn(),
  },
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    testConnection: vi.fn(),
  },
} as unknown as ElectronApi;

beforeEach(() => {
  Object.defineProperty(window, 'electronApi', { value: mockElectronApi, writable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionBrowser', () => {
  it('renders session list when sessions are available', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      {
        id: 'session-1',
        name: 'session-1',
        path: '/home/user/.copilot/session-state/session-1',
        createdAt: '2024-12-01T10:00:00.000Z',
        adapter: 'copilot-cli',
      },
      {
        id: 'session-2',
        name: 'session-2',
        path: '/home/user/.copilot/session-state/session-2',
        createdAt: '2024-12-02T10:00:00.000Z',
        adapter: 'copilot-cli',
      },
    ]);

    const onSelect = vi.fn();
    render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('session-browser')).toBeDefined();
    });

    expect(screen.getByTestId('session-list')).toBeDefined();
  });

  it('shows empty state when no sessions found', async () => {
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([]);

    const onSelect = vi.fn();
    render(<SessionBrowser onSelectSession={onSelect} />);

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
    render(<SessionBrowser onSelectSession={onSelect} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined();
    });

    const openBtn = screen.getByRole('button', { name: /Open a folder/i });

    // After clicking, mock returns a session now
    vi.mocked(mockElectronApi.session.list).mockResolvedValue([
      {
        id: 'new-session',
        name: 'new-session',
        path: '/new/path/new-session',
        createdAt: '2024-12-03T10:00:00.000Z',
        adapter: 'copilot-cli',
      },
    ]);

    openBtn.click();

    await waitFor(() => {
      expect(mockElectronApi.dialog.openDirectory).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockElectronApi.session.setRootDir).toHaveBeenCalledWith('/new/path');
    });
  });
});
