import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LiveWatcherOptions {
  /** Debounce window in milliseconds. Default 500. */
  readonly debounceMs?: number | undefined;
}

/**
 * Watches a root directory for filesystem changes and invokes `onChange`
 * with per-session debouncing.
 *
 * Uses `fs.watch` with `{ recursive: true }`. Only the first-level
 * subdirectory (i.e. the session directory) is reported to the callback.
 */
export class LiveWatcher {
  private watcher: fs.FSWatcher | undefined;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly rootDir: string,
    private readonly onChange: (sessionPath: string) => void,
    private readonly options?: LiveWatcherOptions,
  ) {}

  /** Start watching. Idempotent — calling twice is a no-op. */
  start(): void {
    if (this.watcher !== undefined) return;
    this.stopped = false;
    this.startInternal();
  }

  /** Stop watching. Idempotent. */
  stop(): void {
    this.stopped = true;
    if (this.restartTimer !== undefined) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.watcher !== undefined) {
      this.watcher.close();
      this.watcher = undefined;
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** Whether the watcher is currently active. */
  get watching(): boolean {
    return this.watcher !== undefined;
  }

  private startInternal(): void {
    try {
      const w = fs.watch(this.rootDir, { recursive: true });
      this.watcher = w;

      w.on('change', (_eventType: string, filename: string | Buffer | null) => {
        if (filename === null) return;
        const filenameStr = Buffer.isBuffer(filename) ? filename.toString() : filename;
        const normalized = path.normalize(filenameStr);
        const parts = normalized.split(path.sep);
        const sessionDir = parts[0];
        if (sessionDir === undefined || sessionDir === '') return;
        const sessionPath = path.join(this.rootDir, sessionDir);
        this.debounce(sessionPath);
      });

      w.on('error', (err: Error) => {
        console.error('[LiveWatcher] watcher error:', err);
        this.watcher = undefined;
        // Attempt restart after a brief delay. Capture the handle so stop()
        // can cancel it and prevent a restart after intentional shutdown.
        this.restartTimer = setTimeout(() => {
          this.restartTimer = undefined;
          if (!this.stopped) {
            this.startInternal();
          }
        }, 1000);
      });
    } catch (err) {
      console.error('[LiveWatcher] failed to start:', err);
    }
  }

  private debounce(sessionPath: string): void {
    const debounceMs = this.options?.debounceMs ?? 500;
    const existing = this.timers.get(sessionPath);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(sessionPath);
      this.onChange(sessionPath);
    }, debounceMs);
    this.timers.set(sessionPath, timer);
  }
}
