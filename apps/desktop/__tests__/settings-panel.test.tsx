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
    onListUpdated: vi.fn<ElectronApi['session']['onListUpdated']>().mockReturnValue(() => {}),
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
  const trigger = screen.getByRole('button', { name: /settings/i });
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

    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
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
      expect(screen.getByText(/5 sessions found/i)).toBeInTheDocument();
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
});
