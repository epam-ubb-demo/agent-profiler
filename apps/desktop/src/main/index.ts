import { homedir } from 'node:os';
import { join } from 'node:path';

import { ipcChannels, sessionListItemSchema } from '@agent-profiler/core';
import { LocalFsDataSource } from '@agent-profiler/data-source';
import { app, BrowserWindow, ipcMain, shell } from 'electron';

/** Default directory for Copilot CLI session state. */
const DEFAULT_ROOT_DIR = join(homedir(), '.copilot', 'session-state');

/** The active data source — replaced when root dir changes. */
let dataSource = new LocalFsDataSource(DEFAULT_ROOT_DIR);

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
  const items = await dataSource.listSessions();
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
  return dataSource.getSession(sessionId);
});

ipcMain.handle(ipcChannels.SESSION_SET_ROOT_DIR, async (_event, dir: string) => {
  const newSource = new LocalFsDataSource(dir);
  const available = await newSource.isAvailable();
  if (available) {
    dataSource = newSource;
    return true;
  }
  return false;
});

app.whenReady().then(() => {
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
