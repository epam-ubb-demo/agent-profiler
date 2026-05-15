/**
 * Unit tests for the main-process startup guards in index.ts:
 *   1. Single-instance lock   — app.quit() + zero init on the losing instance
 *   2. Uncaught-exception handler — narrowed pipe-error suppression
 *   3. Second-instance handler   — focus / restore existing window
 *
 * Strategy: mock Electron and all heavy deps, then dynamically `import()`
 * the module so its module-level side effects fire inside the test.
 * vi.resetModules() before each import ensures a fresh module evaluation.
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared mock objects (created before vi.mock hoisting via vi.hoisted) ──

const mockApp = vi.hoisted(() => ({
  requestSingleInstanceLock: vi.fn<() => boolean>(),
  quit: vi.fn(),
  // Never resolves — prevents app.whenReady() side-effects from running during tests.
  whenReady: vi.fn().mockReturnValue(new Promise<void>(() => {})),
  on: vi.fn(),
  getVersion: vi.fn().mockReturnValue('0.0.0'),
}));

const mockIpcMain = vi.hoisted(() => ({ handle: vi.fn() }));

const mockBrowserWindow = vi.hoisted(() => ({
  getAllWindows: vi.fn<() => unknown[]>().mockReturnValue([]),
  getFocusedWindow: vi.fn().mockReturnValue(null),
}));

// ── Static vi.mock declarations (hoisted to the top of the file by vitest) ─

vi.mock('electron', () => ({
  app: mockApp,
  ipcMain: mockIpcMain,
  BrowserWindow: mockBrowserWindow,
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

vi.mock('./auto-updater', () => ({
  AppUpdater: vi.fn().mockImplementation(() => ({
    setupIpcHandlers: vi.fn(),
    startPeriodicChecks: vi.fn(),
  })),
}));

vi.mock('./data-source-manager', () => ({
  DataSourceManager: vi.fn().mockImplementation(() => ({
    configureAppInsights: vi.fn(),
    getSession: vi.fn(),
    testConnection: vi.fn(),
  })),
}));

vi.mock('./pdf-export', () => ({
  registerPdfExportHandlers: vi.fn(),
  registerPdfDialogHandler: vi.fn(),
}));

vi.mock('./session-indexer', () => ({
  SessionIndexer: vi.fn().mockImplementation(() => ({
    getSessionList: vi.fn().mockReturnValue([]),
    isScanning: vi.fn().mockReturnValue(false),
    setRootDir: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

vi.mock('./settings-store', () => ({
  DEFAULT_ROOT_DIR: '/test/sessions',
  getAppInsightsSettings: vi.fn().mockReturnValue({}),
  setAppInsightsSettings: vi.fn(),
  getSessionRootDir: vi.fn().mockReturnValue(null),
  setSessionRootDir: vi.fn(),
  getSyncSettings: vi.fn().mockReturnValue({
    enabled: false,
    categories: { metadata: true, utilisation: true, compactions: true, toolResults: false, turns: true, assistantMessages: true },
    otlpEndpoint: '',
  }),
  setSyncSettings: vi.fn(),
}));

vi.mock('./azure-workspaces', () => ({
  listLogAnalyticsWorkspaces: vi.fn().mockResolvedValue({ success: true, workspaces: [] }),
}));

vi.mock('./sync-marker', () => ({
  MarkerStore: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    cleanupTemp: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./sync-service', () => ({
  SyncService: vi.fn().mockImplementation(() => ({
    getStatus: vi.fn().mockReturnValue({
      state: 'idle',
      lastSyncedAt: null,
      sessionsPending: 0,
      sessionsTotal: 0,
      lastError: null,
    }),
    syncAll: vi.fn().mockResolvedValue(undefined),
    syncSession: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@agent-profiler/adapters-application-insights', () => ({
  OtlpLogsWriter: vi.fn().mockImplementation(() => ({
    push: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@agent-profiler/core', () => ({
  ipcChannels: {
    APP_GET_VERSION: 'app:get-version',
    SESSION_LIST: 'session:list',
    SESSION_SCANNING_STATE: 'session:scanning-state',
    SESSION_OPEN: 'session:open',
    SESSION_SET_ROOT_DIR: 'session:set-root-dir',
    DIALOG_OPEN_DIRECTORY: 'dialog:open-directory',
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    SETTINGS_TEST_CONNECTION: 'settings:test-connection',
    SETTINGS_LIST_WORKSPACES: 'settings:listWorkspaces',
    SESSION_LIST_UPDATED: 'session:list-updated',
    SESSION_SCANNING_STATE_UPDATED: 'session:scanning-state-updated',
    SYNC_STATUS: 'sync:status',
    SYNC_TRIGGER: 'sync:trigger',
    SYNC_SETTINGS_GET: 'sync:settingsGet',
    SYNC_SETTINGS_SET: 'sync:settingsSet',
    SYNC_STATUS_UPDATED: 'sync:statusUpdated',
  },
  appInsightsSettingsSchema: {
    parse: vi.fn((v: unknown) => v),
    // Return success:false to skip applyAppInsightsSettings side-effects.
    safeParse: vi.fn().mockReturnValue({ success: false }),
  },
  syncSettingsSchema: {
    parse: vi.fn((v: unknown) => v),
  },
  testConnectionResultSchema: { parse: vi.fn((v: unknown) => v) },
  listWorkspacesResultSchema: { parse: vi.fn((v: unknown) => v) },
}));

// ── Test suite ─────────────────────────────────────────────────────────────

describe('main process guards (index.ts)', () => {
  // Listeners present before each test — used to identify module-added ones.
  let preTestUncaughtListeners: ((...args: unknown[]) => void)[];
  // MockInstance typed broadly — Electron's process augmentation removes 'exit'
  // from vi.spyOn's keyof constraint, so we avoid the explicit generic here.
  let processExitSpy: MockInstance;

  beforeEach(() => {
    // Snapshot existing uncaughtException listeners *before* the module adds one.
    preTestUncaughtListeners = [
      ...(process.listeners('uncaughtException') as ((...args: unknown[]) => void)[]),
    ];

    // Prevent process.exit(1) from actually terminating the vitest process.
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => {
      throw new Error('process.exit called');
    });

    vi.clearAllMocks();
    // Clear module registry so each test gets a fresh module evaluation.
    vi.resetModules();
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    // Remove only the uncaughtException listeners the module added; keep others.
    const current = process.listeners('uncaughtException') as ((...args: unknown[]) => void)[];
    for (const listener of current) {
      if (!preTestUncaughtListeners.includes(listener)) {
        process.removeListener('uncaughtException', listener as (...args: unknown[]) => void);
      }
    }
  });

  // ── 1. Single-instance guard ─────────────────────────────────────────────

  describe('single-instance guard', () => {
    it('calls app.quit() when the lock is not acquired', async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(false);
      await import('./index');
      expect(mockApp.quit).toHaveBeenCalledOnce();
    });

    it('registers no IPC handlers when the lock is not acquired', async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(false);
      await import('./index');
      expect(mockIpcMain.handle).not.toHaveBeenCalled();
    });

    it('does not call app.quit() when the lock is acquired', async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(true);
      await import('./index');
      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it('registers IPC handlers when the lock is acquired', async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(true);
      await import('./index');
      expect(mockIpcMain.handle).toHaveBeenCalled();
    });
  });

  // ── 2. Uncaught-exception handler ────────────────────────────────────────
  // Suppression requires ALL three conditions simultaneously:
  //   • NODE_ENV === 'development'
  //   • error.syscall === 'write'
  //   • error.code === 'EIO' or 'EPIPE'

  describe('uncaughtException handler', () => {
    let handler: (error: Error) => void;

    // Helper to build an ErrnoException with arbitrary fields.
    function makeError(
      message: string,
      fields: { code?: string; syscall?: string },
    ): Error {
      return Object.assign(new Error(message), fields);
    }

    beforeEach(async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(true);
      await import('./index');

      // Identify the listener added by the module (not present before import).
      const current = process.listeners('uncaughtException') as ((error: Error) => void)[];
      const added = current.filter(
        (l) => !preTestUncaughtListeners.includes(l as (...args: unknown[]) => void),
      );
      const last = added[added.length - 1];
      if (!last) throw new Error('No uncaughtException listener was registered by the module');
      handler = last;
    });

    describe('in development mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      beforeEach(() => { process.env.NODE_ENV = 'development'; });
      afterEach(() => { process.env.NODE_ENV = originalNodeEnv; });

      it('silently ignores a write EIO error', () => {
        const error = makeError('read EIO', { code: 'EIO', syscall: 'write' });
        expect(() => handler(error)).not.toThrow();
        expect(processExitSpy).not.toHaveBeenCalled();
      });

      it('silently ignores a write EPIPE error', () => {
        const error = makeError('write EPIPE broken pipe', { code: 'EPIPE', syscall: 'write' });
        expect(() => handler(error)).not.toThrow();
        expect(processExitSpy).not.toHaveBeenCalled();
      });

      it('crashes for EIO on a non-write syscall (e.g. read)', () => {
        const error = makeError('read EIO', { code: 'EIO', syscall: 'read' });
        expect(() => handler(error)).toThrow('process.exit called');
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      it('crashes for ENOENT regardless of syscall', () => {
        const error = makeError('file not found', { code: 'ENOENT', syscall: 'write' });
        expect(() => handler(error)).toThrow('process.exit called');
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });
    });

    describe('in production mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      beforeEach(() => { process.env.NODE_ENV = 'production'; });
      afterEach(() => { process.env.NODE_ENV = originalNodeEnv; });

      it('crashes for a write EIO error (pipe suppression is dev-only)', () => {
        const error = makeError('write EIO', { code: 'EIO', syscall: 'write' });
        expect(() => handler(error)).toThrow('process.exit called');
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      it('crashes for a write EPIPE error (pipe suppression is dev-only)', () => {
        const error = makeError('write EPIPE', { code: 'EPIPE', syscall: 'write' });
        expect(() => handler(error)).toThrow('process.exit called');
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });
    });

    it('crashes for errors with no code', () => {
      const error = new Error('unexpected failure');
      expect(() => handler(error)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  // ── 3. Second-instance handler ───────────────────────────────────────────

  describe('second-instance handler', () => {
    let secondInstanceFn: () => void;

    beforeEach(async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(true);
      await import('./index');

      const call = mockApp.on.mock.calls.find(([event]) => event === 'second-instance');
      if (!call) throw new Error("app.on('second-instance') was not registered");
      secondInstanceFn = call[1] as () => void;
    });

    it('focuses the existing window', () => {
      const mockWin = {
        isMinimized: vi.fn().mockReturnValue(false),
        restore: vi.fn(),
        focus: vi.fn(),
      };
      mockBrowserWindow.getAllWindows.mockReturnValue([mockWin]);
      secondInstanceFn();
      expect(mockWin.focus).toHaveBeenCalledOnce();
      expect(mockWin.restore).not.toHaveBeenCalled();
    });

    it('restores a minimized window before focusing', () => {
      const mockWin = {
        isMinimized: vi.fn().mockReturnValue(true),
        restore: vi.fn(),
        focus: vi.fn(),
      };
      mockBrowserWindow.getAllWindows.mockReturnValue([mockWin]);
      secondInstanceFn();
      expect(mockWin.restore).toHaveBeenCalledOnce();
      expect(mockWin.focus).toHaveBeenCalledOnce();
    });

    it('does nothing when no windows are open', () => {
      mockBrowserWindow.getAllWindows.mockReturnValue([]);
      expect(() => secondInstanceFn()).not.toThrow();
    });
  });
});
