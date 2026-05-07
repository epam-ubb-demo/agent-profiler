import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdater, type UpdateConfig, updaterChannels } from '../auto-updater';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOn = vi.fn();
const mockSetFeedURL = vi.fn();
const mockCheckForUpdates = vi.fn();
const mockDownloadUpdate = vi.fn();
const mockQuitAndInstall = vi.fn();

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: (...args: unknown[]) => mockOn(...args),
    setFeedURL: (...args: unknown[]) => mockSetFeedURL(...args),
    checkForUpdates: (...args: unknown[]) => mockCheckForUpdates(...args),
    downloadUpdate: (...args: unknown[]) => mockDownloadUpdate(...args),
    quitAndInstall: (...args: unknown[]) => mockQuitAndInstall(...args),
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
  },
}));

const mockIpcMainHandle = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockBrowserWindowGetAllWindows = vi.fn((): any[] => []);

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
  },
  ipcMain: {
    handle: (...args: unknown[]) => mockIpcMainHandle(...args),
  },
  BrowserWindow: {
    getAllWindows: () => mockBrowserWindowGetAllWindows(),
  },
}));

// ─── Test config ──────────────────────────────────────────────────────────────

const defaultConfig: UpdateConfig = {
  provider: 'github',
  owner: 'epam-ubb-demo',
  repo: 'agent-profiler',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AppUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialisation', () => {
    it('configures autoUpdater with default values', () => {
      new AppUpdater(defaultConfig);

      expect(mockSetFeedURL).toHaveBeenCalledWith({
        provider: 'github',
        owner: 'epam-ubb-demo',
        repo: 'agent-profiler',
      });
    });

    it('configures autoUpdater with custom values', () => {
      new AppUpdater({
        ...defaultConfig,
        autoDownload: true,
        allowPrerelease: true,
      });

      expect(mockSetFeedURL).toHaveBeenCalledWith({
        provider: 'github',
        owner: 'epam-ubb-demo',
        repo: 'agent-profiler',
      });
    });

    it('registers all lifecycle events', () => {
      new AppUpdater(defaultConfig);

      const registeredEvents = mockOn.mock.calls.map((call) => call[0]);
      expect(registeredEvents).toContain('checking-for-update');
      expect(registeredEvents).toContain('update-available');
      expect(registeredEvents).toContain('update-not-available');
      expect(registeredEvents).toContain('download-progress');
      expect(registeredEvents).toContain('update-downloaded');
      expect(registeredEvents).toContain('error');
    });

    it('applies default config when optional values are omitted', () => {
      const updater = new AppUpdater(defaultConfig);

      expect(updater).toBeDefined();
    });
  });

  describe('IPC handler registration', () => {
    it('registers all expected IPC channels', () => {
      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const registeredChannels = mockIpcMainHandle.mock.calls.map((call) => call[0]);
      expect(registeredChannels).toContain(updaterChannels.CHECK);
      expect(registeredChannels).toContain(updaterChannels.DOWNLOAD);
      expect(registeredChannels).toContain(updaterChannels.INSTALL);
      expect(registeredChannels).toContain(updaterChannels.GET_STATUS);
      expect(registeredChannels).toContain(updaterChannels.SKIP_VERSION);
    });

    it('updater:check handler triggers checkForUpdates', async () => {
      mockCheckForUpdates.mockResolvedValue({
        updateInfo: { version: '1.0.1' },
      });

      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const checkCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.CHECK,
      );
      expect(checkCall).toBeDefined();

      const handler = checkCall![1];
      const result = await handler();
      expect(result).toEqual({ version: '1.0.1' });
    });

    it('updater:install handler calls quitAndInstall', () => {
      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const installCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.INSTALL,
      );
      const handler = installCall![1];
      handler();

      expect(mockQuitAndInstall).toHaveBeenCalledWith(false, true);
    });

    it('updater:get-status returns current state', async () => {
      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const statusCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.GET_STATUS,
      );
      const handler = statusCall![1];
      const state = await handler();

      expect(state).toMatchObject({
        status: 'idle',
        info: null,
        progress: null,
        error: null,
        skippedVersion: null,
      });
    });
  });

  describe('event forwarding', () => {
    it('broadcasts state change to all windows on update-available', () => {
      const mockSend = vi.fn();
      mockBrowserWindowGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } },
      ]);

      new AppUpdater(defaultConfig);

      const updateAvailableCall = mockOn.mock.calls.find(
        (call) => call[0] === 'update-available',
      );
      const callback = updateAvailableCall![1];
      callback({ version: '2.0.0', releaseDate: '2025-01-01' });

      expect(mockSend).toHaveBeenCalledWith(
        updaterChannels.STATUS_CHANGED,
        expect.objectContaining({
          status: 'available',
          info: { version: '2.0.0', releaseDate: '2025-01-01' },
        }),
      );
    });

    it('broadcasts download progress to all windows', () => {
      const mockSend = vi.fn();
      mockBrowserWindowGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } },
      ]);

      new AppUpdater(defaultConfig);

      const progressCall = mockOn.mock.calls.find(
        (call) => call[0] === 'download-progress',
      );
      const callback = progressCall![1];
      callback({ percent: 50, bytesPerSecond: 1024, transferred: 500, total: 1000 });

      expect(mockSend).toHaveBeenCalledWith(
        updaterChannels.STATUS_CHANGED,
        expect.objectContaining({
          status: 'downloading',
          progress: { percent: 50, bytesPerSecond: 1024, transferred: 500, total: 1000 },
        }),
      );
    });

    it('does not send to destroyed windows', () => {
      const mockSend = vi.fn();
      mockBrowserWindowGetAllWindows.mockReturnValue([
        { isDestroyed: () => true, webContents: { send: mockSend } },
      ]);

      new AppUpdater(defaultConfig);

      const updateAvailableCall = mockOn.mock.calls.find(
        (call) => call[0] === 'update-available',
      );
      updateAvailableCall![1]({ version: '2.0.0' });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('version skip logic', () => {
    it('skips update when version is in skipped list', async () => {
      mockCheckForUpdates.mockResolvedValue({
        updateInfo: { version: '2.0.0' },
      });

      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const skipCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.SKIP_VERSION,
      );
      skipCall![1]({}, '2.0.0');

      const result = await updater.checkForUpdates();
      expect(result).toBeNull();
    });

    it('does not skip when a different version is available', async () => {
      mockCheckForUpdates.mockResolvedValue({
        updateInfo: { version: '3.0.0' },
      });

      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const skipCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.SKIP_VERSION,
      );
      skipCall![1]({}, '2.0.0');

      const result = await updater.checkForUpdates();
      expect(result).toEqual({ version: '3.0.0' });
    });

    it('suppresses update-available event for skipped version', () => {
      const mockSend = vi.fn();
      mockBrowserWindowGetAllWindows.mockReturnValue([
        { isDestroyed: () => false, webContents: { send: mockSend } },
      ]);

      const updater = new AppUpdater(defaultConfig);
      updater.setupIpcHandlers();

      const skipCall = mockIpcMainHandle.mock.calls.find(
        (call) => call[0] === updaterChannels.SKIP_VERSION,
      );
      skipCall![1]({}, '2.0.0');

      mockSend.mockClear();

      const updateAvailableCall = mockOn.mock.calls.find(
        (call) => call[0] === 'update-available',
      );
      updateAvailableCall![1]({ version: '2.0.0' });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('configuration validation', () => {
    it('uses github as provider', () => {
      new AppUpdater(defaultConfig);

      expect(mockSetFeedURL).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'github' }),
      );
    });

    it('passes owner and repo to setFeedURL', () => {
      new AppUpdater({ provider: 'github', owner: 'test-org', repo: 'test-repo' });

      expect(mockSetFeedURL).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test-org', repo: 'test-repo' }),
      );
    });
  });

  describe('lifecycle', () => {
    it('dispose clears the check interval', () => {
      vi.useFakeTimers();
      const updater = new AppUpdater(defaultConfig);

      updater.startPeriodicChecks();
      updater.dispose();

      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      vi.useRealTimers();
    });
  });
});
