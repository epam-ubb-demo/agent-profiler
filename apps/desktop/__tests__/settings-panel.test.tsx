import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ElectronApi } from '../src/preload/api';
import { SettingsPanel } from '../src/renderer/components/SettingsPanel';

import { cleanup, fireEvent, render, screen, waitFor } from './test-utils';
// ─── Mock electronApi ─────────────────────────────────────────────────────────

const mockElectronApi: ElectronApi = {
  getVersion: vi.fn<() => Promise<string>>().mockResolvedValue('1.0.0'),
  session: {
    list: vi.fn(),
    open: vi.fn(),
    setRootDir: vi.fn(),
    clearCache: vi.fn<ElectronApi['session']['clearCache']>().mockResolvedValue(undefined),
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
    get: vi.fn().mockResolvedValue({ workspaceId: 'test-ws', timeRangePreset: '7d' }),
    set: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn<() => Promise<{ success: boolean; sessionCount?: number; error?: string }>>().mockResolvedValue({ success: true, sessionCount: 5 }),
    listWorkspaces: vi.fn().mockResolvedValue({ success: true, workspaces: [] }),
  },
  sync: {
    getSettings: vi.fn<ElectronApi['sync']['getSettings']>().mockResolvedValue({ enabled: false, categories: { metadata: true, utilisation: true, compactions: true, toolResults: false, turns: true, assistantMessages: true }, otlpEndpoint: '' }),
    setSettings: vi.fn<ElectronApi['sync']['setSettings']>().mockResolvedValue(undefined),
    getStatus: vi.fn<ElectronApi['sync']['getStatus']>().mockResolvedValue({ state: 'idle', lastSyncedAt: null, sessionsPending: 0, sessionsTotal: 0, lastError: null }),
    trigger: vi.fn<ElectronApi['sync']['trigger']>().mockResolvedValue(undefined),
    clearMarkers: vi.fn<ElectronApi['sync']['clearMarkers']>().mockResolvedValue(undefined),
    onStatusUpdated: vi.fn<ElectronApi['sync']['onStatusUpdated']>().mockReturnValue(() => {}),
  },
};

beforeEach(() => {
  Object.defineProperty(window, 'electronApi', { value: mockElectronApi, writable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Opens the settings dialog and waits for settings to load. */
async function openSettingsDialog() {
  const trigger = screen.getByRole('button', { name: /^settings$/i });
  fireEvent.click(trigger);

  // Wait for the dialog to open and settings to load
  await waitFor(() => {
    expect(screen.getByText('Application Insights Settings')).toBeInTheDocument();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsPanel', () => {
  it('renders settings trigger button', async () => {
    await render(<SettingsPanel />);

    expect(screen.getByRole('button', { name: /^settings$/i })).toBeInTheDocument();
  });

  it('opens dialog when settings button is clicked', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    expect(screen.getByLabelText('Workspace ID')).toBeInTheDocument();
  });

  it('loads saved settings on open', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      const input = screen.getByLabelText('Workspace ID') as HTMLInputElement;
      expect(input.value).toBe('test-ws');
    });

    expect(mockElectronApi.settings.get).toHaveBeenCalled();
  });

  it('shows green status with session count on successful test connection', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    // Wait for workspace ID to be populated (settings loaded)
    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const testBtn = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });

  it('shows red status with error on failed test connection', async () => {
    vi.mocked(mockElectronApi.settings.testConnection).mockResolvedValue({
      success: false,
      error: 'Invalid workspace ID',
    });

    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const testBtn = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Invalid workspace ID')).toBeInTheDocument();
    });
  });

  it('calls settings.set with correct settings on save', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockElectronApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'test-ws', timeRangePreset: '7d' }),
      );
    });
  });

  it('triggers onSettingsSaved callback after save', async () => {
    const onSaved = vi.fn();
    await render(<SettingsPanel onSettingsSaved={onSaved} />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('Sync Now saves settings before triggering sync', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const syncBtn = screen.getByRole('button', { name: /sync now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockElectronApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'test-ws' }),
      );
      expect(mockElectronApi.sync.setSettings).toHaveBeenCalled();
      expect(mockElectronApi.sync.trigger).toHaveBeenCalled();
    });

    // settings.set must be called before trigger
    const setOrder = vi.mocked(mockElectronApi.settings.set).mock.invocationCallOrder[0]!;
    const triggerOrder = vi.mocked(mockElectronApi.sync.trigger).mock.invocationCallOrder[0]!;
    expect(setOrder).toBeLessThan(triggerOrder);
  });

  it('Sync Now calls onSettingsSaved after saving', async () => {
    const onSaved = vi.fn();
    await render(<SettingsPanel onSettingsSaved={onSaved} />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const syncBtn = screen.getByRole('button', { name: /sync now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('Sync Now does not close the dialog', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const syncBtn = screen.getByRole('button', { name: /sync now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockElectronApi.sync.trigger).toHaveBeenCalled();
    });

    // Dialog must remain open
    expect(screen.getByText('Application Insights Settings')).toBeInTheDocument();
  });

  it('Re-sync All button is visible in the settings dialog', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    expect(screen.getByRole('button', { name: /re-sync all/i })).toBeInTheDocument();
  });

  it('Re-sync All saves settings, clears markers then triggers sync', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const resyncBtn = screen.getByRole('button', { name: /re-sync all/i });
    fireEvent.click(resyncBtn);

    await waitFor(() => {
      expect(mockElectronApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'test-ws' }),
      );
      expect(mockElectronApi.sync.setSettings).toHaveBeenCalled();
      expect(mockElectronApi.sync.clearMarkers).toHaveBeenCalled();
      expect(mockElectronApi.sync.trigger).toHaveBeenCalled();
    });

    // clearMarkers must be called before trigger
    const clearOrder = vi.mocked(mockElectronApi.sync.clearMarkers).mock.invocationCallOrder[0]!;
    const triggerOrder = vi.mocked(mockElectronApi.sync.trigger).mock.invocationCallOrder[0]!;
    expect(clearOrder).toBeLessThan(triggerOrder);
  });

  it('Re-sync All calls onSettingsSaved after saving', async () => {
    const onSaved = vi.fn();
    await render(<SettingsPanel onSettingsSaved={onSaved} />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const resyncBtn = screen.getByRole('button', { name: /re-sync all/i });
    fireEvent.click(resyncBtn);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('Re-sync All does not close the dialog', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const resyncBtn = screen.getByRole('button', { name: /re-sync all/i });
    fireEvent.click(resyncBtn);

    await waitFor(() => {
      expect(mockElectronApi.sync.trigger).toHaveBeenCalled();
    });

    // Dialog must remain open
    expect(screen.getByText('Application Insights Settings')).toBeInTheDocument();
  });

  it('Re-sync All shows error when clearMarkers fails', async () => {
    vi.mocked(mockElectronApi.sync.clearMarkers).mockRejectedValueOnce(new Error('Clear failed'));

    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const resyncBtn = screen.getByRole('button', { name: /re-sync all/i });
    fireEvent.click(resyncBtn);

    await waitFor(() => {
      expect(screen.getByText('Clear failed')).toBeInTheDocument();
    });

    // trigger must NOT have been called after clearMarkers failed
    expect(mockElectronApi.sync.trigger).not.toHaveBeenCalled();
  });

  it('Clear local cache button is visible in the settings dialog', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    expect(screen.getByRole('button', { name: /clear local cache/i })).toBeInTheDocument();
  });

  it('Clear local cache calls session.clearCache on click', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    const clearBtn = screen.getByRole('button', { name: /clear local cache/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(mockElectronApi.session.clearCache).toHaveBeenCalled();
    });
  });

  it('Clear local cache button is disabled while clearing', async () => {
    // Delay the clearCache resolution so we can observe the disabled state
    let resolveClearCache: () => void = () => {};
    vi.mocked(mockElectronApi.session.clearCache).mockImplementation(
      () => new Promise<undefined>((resolve) => {
        resolveClearCache = () => resolve(undefined);
      })
    );

    await render(<SettingsPanel />);

    await openSettingsDialog();

    const clearBtn = screen.getByRole('button', { name: /clear local cache/i });
    fireEvent.click(clearBtn);

    // Button should be disabled while operation is in flight
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clearing/i })).toBeInTheDocument();
    });

    // Resolve the promise to complete the operation
    resolveClearCache();

    // Wait for the button to be re-enabled (back to "Clear local cache" text)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear local cache/i })).toBeInTheDocument();
    });
  });

  it('Clear local cache shows error when clearCache fails', async () => {
    vi.mocked(mockElectronApi.session.clearCache).mockRejectedValueOnce(new Error('Cache deletion failed'));

    await render(<SettingsPanel />);

    await openSettingsDialog();

    const clearBtn = screen.getByRole('button', { name: /clear local cache/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('Cache deletion failed')).toBeInTheDocument();
    });
  });

  it('Clear local cache does not close the dialog', async () => {
    await render(<SettingsPanel />);

    await openSettingsDialog();

    await waitFor(() => {
      expect((screen.getByLabelText('Workspace ID') as HTMLInputElement).value).toBe('test-ws');
    });

    const clearBtn = screen.getByRole('button', { name: /clear local cache/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(mockElectronApi.session.clearCache).toHaveBeenCalled();
    });

    // Dialog must remain open
    expect(screen.getByText('Application Insights Settings')).toBeInTheDocument();
  });
});
