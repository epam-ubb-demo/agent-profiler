/**
 * Unit tests for the main-process startup guards in index.ts:
 *   1. Single-instance lock   — app.quit() when lock not acquired
 *   2. Uncaught-exception handler — EIO/EPIPE silenced, others → process.exit(1)
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
    SESSION_LIST_UPDATED: 'session:list-updated',
    SESSION_SCANNING_STATE_UPDATED: 'session:scanning-state-updated',
  },
  appInsightsSettingsSchema: {
    parse: vi.fn((v: unknown) => v),
    // Return success:false to skip applyAppInsightsSettings side-effects.
    safeParse: vi.fn().mockReturnValue({ success: false }),
  },
  testConnectionResultSchema: { parse: vi.fn((v: unknown) => v) },
}));

// ── Test suite ─────────────────────────────────────────────────────────────

describe('main process guards (index.ts)', () => {
  // Listeners present before each test — used to identify module-added ones.
  let preTestUncaughtListeners: ((...args: unknown[]) => void)[];
  // MockInstance<never, …> — Electron augments NodeJS.Process and removes 'exit'
  // from the constraint vi.spyOn<T, K> checks, so we type the spy broadly here.
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

    it('does not call app.quit() when the lock is acquired', async () => {
      mockApp.requestSingleInstanceLock.mockReturnValue(true);
      await import('./index');
      expect(mockApp.quit).not.toHaveBeenCalled();
    });
  });

  // ── 2. Uncaught-exception handler ────────────────────────────────────────

  describe('uncaughtException handler', () => {
    let handler: (error: Error) => void;

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

    it('silently ignores EIO errors', () => {
      const error = Object.assign(new Error('read EIO'), { code: 'EIO' });
      expect(() => handler(error)).not.toThrow();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('silently ignores EPIPE errors', () => {
      const error = Object.assign(new Error('write EPIPE broken pipe'), { code: 'EPIPE' });
      expect(() => handler(error)).not.toThrow();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('calls process.exit(1) for non-pipe errors', () => {
      const error = Object.assign(new Error('file not found'), { code: 'ENOENT' });
      expect(() => handler(error)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('calls process.exit(1) for errors with no code', () => {
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
