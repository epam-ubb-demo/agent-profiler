import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  ipcChannels,
  sessionListItemSchema,
  appInsightsSettingsSchema,
  testConnectionResultSchema,
} from '@agent-profiler/core';
import type { AppInsightsSettingsIpc } from '@agent-profiler/core';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { DataSourceManager } from './data-source-manager';
import {
  getAppInsightsSettings,
  setAppInsightsSettings,
  getSessionRootDir,
  setSessionRootDir,
} from './settings-store';
import { registerPdfExportHandlers, registerPdfDialogHandler } from './pdf-export';
import { AppUpdater } from './auto-updater';

/** Default directory for Copilot CLI session state. */
const DEFAULT_ROOT_DIR = join(homedir(), '.copilot', 'session-state');

// ---------------------------------------------------------------------------
// Data-source manager
// ---------------------------------------------------------------------------

const manager = new DataSourceManager(getSessionRootDir() || DEFAULT_ROOT_DIR);

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

ipcMain.handle(ipcChannels.SESSION_LIST, async () => {
  const items = await manager.listSessions();
  // Serialize for IPC transport (Dates → ISO strings, validate with Zod)
  return items.map((item) =>
    sessionListItemSchema.parse({
      id: item.id,
      name: item.name,
      path: item.path,
      createdAt: item.createdAt.toISOString(),
      adapter: item.adapter,
    }),
  );
});

ipcMain.handle(ipcChannels.SESSION_OPEN, async (_event, sessionId: string) => {
  return manager.getSession(sessionId);
});

ipcMain.handle(ipcChannels.SESSION_SET_ROOT_DIR, async (_event, dir: string) => {
  const ok = await manager.setLocalRootDir(dir);
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

  // Restore persisted App Insights settings
  const savedSettings = getAppInsightsSettings();
  if (savedSettings.workspaceId) {
    applyAppInsightsSettings(savedSettings);
    console.log('[agent-profiler] Application Insights configured from saved settings');
  }

  // Auto-discover sessions at configured location on startup
  const available = await manager.isLocalAvailable();
  if (available) {
    const sessions = await manager.listSessions();
    console.log(
      `[agent-profiler] Auto-discovered ${sessions.length} session(s)`,
    );
  } else {
    console.log(
      `[agent-profiler] Default session directory not found: ${getSessionRootDir() || DEFAULT_ROOT_DIR}`,
    );
  }

  // ─── Auto-Updater ─────────────────────────────────────────
  const updater = new AppUpdater({
    provider: 'github',
    owner: 'epam-ubb-demo',
    repo: 'agent-profiler',
  });
  updater.setupIpcHandlers();
  updater.startPeriodicChecks();

  createWindow();

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
