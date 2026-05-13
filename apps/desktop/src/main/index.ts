import { join } from 'node:path';

import {
  ipcChannels,
  appInsightsSettingsSchema,
  testConnectionResultSchema,
} from '@agent-profiler/core';
import type { AppInsightsSettingsIpc } from '@agent-profiler/core';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { AppUpdater } from './auto-updater';
import { DataSourceManager } from './data-source-manager';
import { registerPdfExportHandlers, registerPdfDialogHandler } from './pdf-export';
import { SessionIndexer } from './session-indexer';
import {
  DEFAULT_ROOT_DIR,
  getAppInsightsSettings,
  setAppInsightsSettings,
  getSessionRootDir,
  setSessionRootDir,
} from './settings-store';

// ─── Single-instance guard ────────────────────────────────────────────────
// Must be the very first Electron API call.  If another instance is already
// running, quit immediately — app.whenReady() will not resolve after
// app.quit(), so the window below will never be created and the IPC handlers
// registered here are harmless (no renderer will connect).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ─── Uncaught-exception guard ─────────────────────────────────────────────
// When the electron-vite dev server is killed and restarted, the old Electron
// child process can survive as an orphan with a broken stdout/stderr pipe.
// Any IPC error that triggers console.warn / console.error then throws
// EIO / EPIPE — catch and discard those silently so they don't produce a
// crash dialog.
process.on('uncaughtException', (error: Error) => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EIO' || code === 'EPIPE') {
    // Pipe error from severed stdout/stderr — ignore silently.
    return;
  }
  // All other uncaught exceptions keep the default crash behavior.
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// ─── Second-instance handler ──────────────────────────────────────────────
// When a second instance tries to launch (blocked by the lock above), bring
// the existing window to the foreground instead.
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

// ── Settings IPC handlers ───────────────────────────────────────────────

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
  },
);

ipcMain.handle(ipcChannels.SETTINGS_TEST_CONNECTION, async () => {
  const result = await manager.testConnection();
  return testConnectionResultSchema.parse(result);
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

  // ─── Auto-Updater ─────────────────────────────────────────
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
