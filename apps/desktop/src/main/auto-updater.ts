import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, type UpdateCheckResult, type UpdateInfo } from 'electron-updater';

/**
 * Configuration for the auto-update provider.
 */
export interface UpdateConfig {
  /** GitHub owner/repo for releases */
  readonly provider: 'github';
  readonly owner: string;
  readonly repo: string;
  /** Whether to auto-download updates (default: false) */
  readonly autoDownload?: boolean;
  /** Whether to auto-install on quit (default: true) */
  readonly autoInstallOnAppQuit?: boolean;
  /** Pre-release channel (default: false) */
  readonly allowPrerelease?: boolean;
  /** Check interval in milliseconds (default: 4 hours) */
  readonly checkInterval?: number;
}

/**
 * Current state of the update lifecycle.
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null;
  error: string | null;
  skippedVersion: string | null;
}

/** IPC channel constants for the updater */
export const updaterChannels = {
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  INSTALL: 'updater:install',
  GET_STATUS: 'updater:get-status',
  SKIP_VERSION: 'updater:skip-version',
  STATUS_CHANGED: 'updater:status-changed',
} as const;

/** Default check interval: 4 hours */
const DEFAULT_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

/**
 * Manages auto-update lifecycle with electron-updater.
 *
 * Disabled in development (unpackaged) mode to avoid errors
 * when no release artifacts are available.
 */
export class AppUpdater {
  private state: UpdateState = {
    status: 'idle',
    info: null,
    progress: null,
    error: null,
    skippedVersion: null,
  };
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: Required<UpdateConfig>;

  constructor(config: UpdateConfig) {
    this.config = {
      provider: config.provider,
      owner: config.owner,
      repo: config.repo,
      autoDownload: config.autoDownload ?? false,
      autoInstallOnAppQuit: config.autoInstallOnAppQuit ?? true,
      allowPrerelease: config.allowPrerelease ?? false,
      checkInterval: config.checkInterval ?? DEFAULT_CHECK_INTERVAL,
    };

    this.configureAutoUpdater();
    this.registerEvents();
  }

  /**
   * Whether the updater is enabled (only in packaged builds).
   */
  get isEnabled(): boolean {
    return app.isPackaged;
  }

  /**
   * Check for updates. Returns the update info if available, null otherwise.
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!this.isEnabled) {
      return null;
    }

    try {
      const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates();
      if (!result) return null;

      const { updateInfo } = result;

      // Skip if user has opted to skip this version
      if (this.state.skippedVersion === updateInfo.version) {
        return null;
      }

      return updateInfo;
    } catch {
      return null;
    }
  }

  /**
   * Download the available update.
   */
  async downloadUpdate(): Promise<void> {
    if (!this.isEnabled) return;
    await autoUpdater.downloadUpdate();
  }

  /**
   * Quit the application and install the downloaded update.
   */
  installAndRestart(): void {
    if (!this.isEnabled) return;
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Register IPC handlers so the renderer can communicate with the updater.
   */
  setupIpcHandlers(): void {
    ipcMain.handle(updaterChannels.CHECK, async () => {
      return this.checkForUpdates();
    });

    ipcMain.handle(updaterChannels.DOWNLOAD, async () => {
      await this.downloadUpdate();
    });

    ipcMain.handle(updaterChannels.INSTALL, () => {
      this.installAndRestart();
    });

    ipcMain.handle(updaterChannels.GET_STATUS, () => {
      return { ...this.state };
    });

    ipcMain.handle(updaterChannels.SKIP_VERSION, (_event, version: string) => {
      this.state.skippedVersion = version;
      this.setState({ status: 'idle', info: null });
    });
  }

  /**
   * Start periodic update checks.
   */
  startPeriodicChecks(): void {
    if (!this.isEnabled) return;

    // Initial check after a short delay (give the app time to start)
    setTimeout(() => this.checkForUpdates(), 10_000);

    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);
  }

  /**
   * Stop periodic update checks and clean up.
   */
  dispose(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────

  private configureAutoUpdater(): void {
    autoUpdater.setFeedURL({
      provider: this.config.provider,
      owner: this.config.owner,
      repo: this.config.repo,
    });

    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnAppQuit;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;
  }

  private registerEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.setState({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      if (this.state.skippedVersion === info.version) {
        return;
      }
      this.setState({ status: 'available', info });
    });

    autoUpdater.on('update-not-available', () => {
      this.setState({ status: 'not-available', info: null });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        status: 'downloading',
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setState({ status: 'downloaded', info, progress: null });
    });

    autoUpdater.on('error', (error: Error) => {
      this.setState({ status: 'error', error: error.message, progress: null });
    });
  }

  private setState(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial };
    this.broadcastState();
  }

  private broadcastState(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(updaterChannels.STATUS_CHANGED, { ...this.state });
      }
    }
  }
}
