import { join } from 'node:path';

import { LogsIngestionWriter } from '@agent-profiler/adapters-application-insights';
import {
  ipcChannels,
  appInsightsSettingsSchema,
  syncSettingsSchema,
  testConnectionResultSchema,
  listWorkspacesResultSchema,
} from '@agent-profiler/core';
import type { AppInsightsSettingsIpc } from '@agent-profiler/core';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { AppUpdater } from './auto-updater';
import { listLogAnalyticsWorkspaces } from './azure-workspaces';
import { DataSourceManager } from './data-source-manager';
import { registerPdfExportHandlers, registerPdfDialogHandler } from './pdf-export';
import { SessionIndexer } from './session-indexer';
import {
  DEFAULT_ROOT_DIR,
  getAppInsightsSettings,
  setAppInsightsSettings,
  getSessionRootDir,
  setSessionRootDir,
  getSyncSettings,
  setSyncSettings,
} from './settings-store';
import { MarkerStore } from './sync-marker';
import { SyncService } from './sync-service';

// ─── Single-instance guard ────────────────────────────────────────────────
// Must be the very first Electron API call.  If another instance is already
// running, quit immediately and do nothing else — the losing instance should
// perform zero initialisation.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ─── Uncaught-exception guard ─────────────────────────────────────────────
// Registered unconditionally so the process.exit(1) fallback is always in
// place.  Suppression of pipe errors is intentionally narrow:
//   • syscall must be 'write'  — avoids masking real I/O read failures
//   • development mode only    — orphaned processes are a dev-mode phenomenon
//     (electron-vite dev server killed while child Electron survives)
process.on('uncaughtException', (error: Error) => {
  const nodeError = error as NodeJS.ErrnoException;
  const isDev = process.env.NODE_ENV === 'development';
  const isWritePipeError =
    isDev &&
    nodeError.syscall === 'write' &&
    (nodeError.code === 'EIO' || nodeError.code === 'EPIPE');
  if (isWritePipeError) {
    // Severed stdout/stderr write pipe from an orphaned dev process — ignore.
    return;
  }
  // All other uncaught exceptions keep the default crash behavior.
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// ─── Lock-owning instance: full initialisation ────────────────────────────
// Everything below only runs when this process holds the single-instance lock.
// The losing instance has already called app.quit() above and does no work.
if (gotLock) {
  // Focus the existing window when a second instance tries to launch.
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // Data-source manager
  // ---------------------------------------------------------------------------

  const manager = new DataSourceManager(getSessionRootDir() || DEFAULT_ROOT_DIR);
  const indexer = new SessionIndexer(manager);
  let isQuitting = false;

  // ── SyncService setup ─────────────────────────────────────────────────────

  /**
   * Returns a configured LogsIngestionWriter only when all required fields are
   * non-empty. Avoids constructing an SDK client with blank endpoint strings at
   * startup (which may throw or waste credential-provider initialisation).
   */
  function buildWriterIfConfigured(
    settings: ReturnType<typeof getSyncSettings>,
  ): LogsIngestionWriter | null {
    if (settings.dceEndpoint && settings.dcrImmutableId && settings.dcrStreamName) {
      return new LogsIngestionWriter({
        dceEndpoint: settings.dceEndpoint,
        dcrImmutableId: settings.dcrImmutableId,
        dcrStreamName: settings.dcrStreamName,
      });
    }
    return null;
  }

  const markerStore = new MarkerStore();
  const initialSyncSettings = getSyncSettings();
  const syncService = new SyncService({
    markerStore,
    logsIngestionWriter: buildWriterIfConfigured(initialSyncSettings),
    dataSourceManager: manager,
    sessionIndexer: indexer,
    settingsStore: { getSyncSettings },
    mainWindow: null,
  });

  /** Resolve a time range from the persisted preset. */
  function resolveTimeRange(
    settings: AppInsightsSettingsIpc,
  ): { startTime: Date; endTime: Date } | undefined {
    const now = new Date();
    switch (settings.timeRangePreset) {
      case '24h':
        return { startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), endTime: now };
      case '7d':
        return { startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), endTime: now };
      case '30d':
        return { startTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), endTime: now };
      case 'custom': {
        if (settings.customStartDate && settings.customEndDate) {
          return {
            startTime: new Date(settings.customStartDate + 'T00:00:00.000Z'),
            endTime: new Date(settings.customEndDate + 'T23:59:59.999Z'),
          };
        }
        return undefined;
      }
    }
  }

  /** Apply persisted App Insights settings to the manager. */
  function applyAppInsightsSettings(settings: AppInsightsSettingsIpc): void {
    const timeRange = resolveTimeRange(settings);
    manager.configureAppInsights({
      workspaceId: settings.workspaceId,
      ...(timeRange ? { timeRange } : {}),
    });
  }

  function createWindow(): BrowserWindow {
    const mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.on('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return mainWindow;
  }

  // IPC Handlers
  ipcMain.handle(ipcChannels.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(ipcChannels.SESSION_LIST, () => {
    return indexer.getSessionList();
  });

  ipcMain.handle(ipcChannels.SESSION_SCANNING_STATE, () => {
    return indexer.isScanning();
  });

  ipcMain.handle(ipcChannels.SESSION_OPEN, async (_event, sessionId: string) => {
    // Always invalidate the cache so the detail view shows the latest data
    manager.invalidateSession(sessionId);
    return manager.getSession(sessionId);
  });

  ipcMain.handle(ipcChannels.SESSION_SET_ROOT_DIR, async (_event, dir: string) => {
    const ok = await indexer.setRootDir(dir);
    if (ok) {
      setSessionRootDir(dir);
    }
    return ok;
  });

  ipcMain.handle(ipcChannels.DIALOG_OPEN_DIRECTORY, async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(focusedWindow ?? BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory'],
      title: 'Select session logs folder',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  // ── Settings IPC handlers ─────────────────────────────────────────────

  ipcMain.handle(ipcChannels.SETTINGS_GET, () => {
    try {
      const raw = getAppInsightsSettings();
      return appInsightsSettingsSchema.parse(raw);
    } catch {
      return { workspaceId: '', timeRangePreset: '7d' as const };
    }
  });

  ipcMain.handle(
    ipcChannels.SETTINGS_SET,
    async (_event, raw: unknown) => {
      const settings = appInsightsSettingsSchema.parse(raw);
      setAppInsightsSettings(settings);
      applyAppInsightsSettings(settings);
      // Re-scan so remote sessions appear in the session list immediately.
      void indexer.refresh();
    },
  );

  ipcMain.handle(ipcChannels.SETTINGS_TEST_CONNECTION, async () => {
    const result = await manager.testConnection();
    return testConnectionResultSchema.parse(result);
  });

  ipcMain.handle(ipcChannels.SETTINGS_LIST_WORKSPACES, async () => {
    const result = await listLogAnalyticsWorkspaces();
    return listWorkspacesResultSchema.parse(result);
  });

  // ── Sync IPC handlers ─────────────────────────────────────────────────────

  ipcMain.handle(ipcChannels.SYNC_STATUS, () => {
    return syncService.getStatus();
  });

  // The preload API exposes `trigger: () => Promise<void>` with no arguments,
  // so a per-session branch here would be unreachable. Just run syncAll().
  ipcMain.handle(ipcChannels.SYNC_TRIGGER, async () => {
    await syncService.syncAll();
  });

  ipcMain.handle(ipcChannels.SYNC_SETTINGS_GET, () => {
    return getSyncSettings();
  });

  ipcMain.handle(ipcChannels.SYNC_SETTINGS_SET, (_event, raw: unknown) => {
    const settings = syncSettingsSchema.parse(raw);
    setSyncSettings(settings);
    syncService.updateWriter(buildWriterIfConfigured(settings));
  });

  ipcMain.handle(ipcChannels.SYNC_SETTINGS_GET, () => {
    return getSyncSettings();
  });

  ipcMain.handle(ipcChannels.SYNC_SETTINGS_SET, (_event, raw: unknown) => {
    const settings = syncSettingsSchema.parse(raw);
    setSyncSettings(settings);
  });

  app.whenReady().then(async () => {
    // Register PDF export handlers
    registerPdfExportHandlers();
    registerPdfDialogHandler();

    // Restore persisted App Insights settings (validate to guard against corruption)
    const rawSettings = getAppInsightsSettings();
    const parsed = appInsightsSettingsSchema.safeParse(rawSettings);
    if (parsed.success) {
      if (parsed.data.workspaceId) {
        applyAppInsightsSettings(parsed.data);
        console.log('[agent-profiler] Application Insights configured from saved settings');
      }
    } else {
      console.warn('[agent-profiler] Persisted settings are invalid, using defaults:', parsed.error.message);
    }

    // Start SessionIndexer — loads disk cache for instant startup, then scans in background
    const rootDir = getSessionRootDir() || DEFAULT_ROOT_DIR;
    await indexer.start(rootDir);
    console.log('[agent-profiler] SessionIndexer started');

    // ─── Auto-Updater ───────────────────────────────────────────────────
    const updater = new AppUpdater({
      provider: 'github',
      owner: 'epam-ubb-demo',
      repo: 'agent-profiler',
    });
    updater.setupIpcHandlers();
    updater.startPeriodicChecks();

    createWindow();

    // Push session list updates to all renderer windows
    indexer.on('updated', () => {
      const sessions = indexer.getSessionList();
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(ipcChannels.SESSION_LIST_UPDATED, sessions);
        }
      }
    });

    // Push scanning state changes to all renderer windows
    indexer.on('scanningState', (isScanning: boolean) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(ipcChannels.SESSION_SCANNING_STATE_UPDATED, isScanning);
        }
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (!isQuitting) {
      isQuitting = true;
      event.preventDefault();
      indexer.stop().finally(() => app.quit());
    }
  });
}
