/**
 * SessionIndexer — dual-layer cache (memory + disk) with background scanning.
 *
 * Owns:
 * - In-memory Map index for O(1) session list retrieval
 * - Disk cache in app userData for instant startup
 * - Background batch scanning (50/batch with setImmediate yields)
 * - EventEmitter interface for push updates
 * - Filesystem watching for real-time updates (macOS/Windows only)
 *
 * All public methods follow the "never throw" contract —
 * errors are caught and safe defaults are returned.
 */

import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Session, SessionListItemIpc } from '@agent-profiler/core';
import { sessionListItemSchema } from '@agent-profiler/core';
import { app } from 'electron';

import type { DataSourceManager } from './data-source-manager';
import { extractSessionListMetrics } from './session-list-metrics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_FILE_NAME = 'session-index-cache.json';
const CACHE_VERSION = 2;
const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Disk cache format
// ---------------------------------------------------------------------------

interface DiskCache {
  version: number;
  rootDir: string;
  updatedAt: string;
  sessions: SessionListItemIpc[];
}

// ---------------------------------------------------------------------------
// SessionIndexer
// ---------------------------------------------------------------------------

export class SessionIndexer extends EventEmitter {
  private readonly manager: DataSourceManager;
  /** In-memory index keyed by composite key `"${id}:${adapter}"`. */
  private index = new Map<string, SessionListItemIpc>();
  private currentRootDir = '';
  private scanning = false;
  private stopRequested = false;
  private scanGeneration = 0;
  private scanPromise: Promise<void> | null = null;

  // Filesystem watching
  private watcher: FSWatcher | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly DEBOUNCE_MS = 500;
  private static readonly WATCHER_RESTART_MS = 1000;

  constructor(manager: DataSourceManager) {
    super();
    this.manager = manager;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Returns the composite Map key for an index entry.
   * Using `"${id}:${adapter}"` ensures local and remote versions of the same
   * session coexist in the index (they share an ID but differ by adapter).
   */
  private static indexKey(id: string, adapter: string): string {
    return `${id}:${adapter}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load disk cache (if valid for rootDir), emit the cached list immediately,
   * then kick off a background scan to refresh the index.
   */
  async start(rootDir: string): Promise<void> {
    try {
      this.currentRootDir = rootDir;
      this.stopRequested = false;

      // Always clear the in-memory index to prevent stale entries from a
      // previous root dir or a failed/empty cache load.
      this.index.clear();

      // 1. Load disk cache — populate memory and emit immediately for fast startup
      const cached = await this.loadDiskCache(rootDir);
      if (cached.length > 0) {
        for (const item of cached) {
          this.index.set(SessionIndexer.indexKey(item.id, item.adapter), item);
        }
        this.emitUpdated();
      }

      // 2. Kick off background scan — use a generation counter so a stale scan
      //    from a previous root dir exits cleanly when it detects the mismatch.
      this.scanGeneration++;
      if (this.scanPromise) {
        this.stopRequested = true;
        await this.scanPromise;
        this.stopRequested = false;
      }
      void (this.scanPromise = this.runBackgroundScan());

      // 3. Start filesystem watching for real-time updates
      this.startWatching(rootDir);
    } catch (err) {
      console.error('[SessionIndexer] start() error:', err);
    }
  }

  /**
   * Stop background scanning and flush the current index to disk cache.
   */
  async stop(): Promise<void> {
    try {
      this.stopRequested = true;
      this.stopWatching();
      await this.flushDiskCache();
    } catch (err) {
      console.error('[SessionIndexer] stop() error:', err);
    }
  }

  /**
   * Returns the current in-memory session list sorted by createdAt descending.
   * Synchronous — no I/O.
   */
  getSessionList(): SessionListItemIpc[] {
    return this.sortedList();
  }

  /**
   * Returns true while a background scan is in progress.
   * Synchronous — no I/O.
   */
  isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Trigger a fresh background scan without changing the root directory.
   *
   * Called after Application Insights settings change so the indexer picks up
   * remote sessions without requiring a restart.
   */
  async refresh(): Promise<void> {
    try {
      this.scanGeneration++;
      if (this.scanPromise) {
        this.stopRequested = true;
        await this.scanPromise;
        this.stopRequested = false;
      }
      // Reset scanning state that the old scan may not have cleared.
      // When refresh() interrupts an in-flight scan, the scan's finally block
      // skips the reset because scanGeneration no longer matches. Without this
      // line, runBackgroundScan() exits immediately on the `if (this.scanning)`
      // guard and the spinner stays stuck forever.
      this.scanning = false;
      void (this.scanPromise = this.runBackgroundScan());
    } catch (err) {
      console.error('[SessionIndexer] refresh() error:', err);
    }
  }

  /**
   * Delete the on-disk cache file and clear the in-memory index.
   *
   * Emits an empty session list immediately so the renderer reflects the
   * cleared state.  A subsequent call to `refresh()` or `start()` will
   * re-populate the index from App Insights / the filesystem.
   */
  async clearCache(): Promise<void> {
    try {
      await unlink(this.cacheFilePath).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
        // File already absent — that is fine, nothing to delete.
      });
      this.index.clear();
      this.emit('updated', []);
      console.log('[SessionIndexer] Cache cleared');
    } catch (err) {
      console.error('[SessionIndexer] clearCache() error:', err);
    }
  }

  /**
   * Change the root directory: clears the in-memory index, tells the manager
   * to use the new directory, and restarts the background scan from scratch.
   */
  async setRootDir(dir: string): Promise<boolean> {
    try {
      // Validate the new directory first — do not touch current state until confirmed valid
      const ok = await this.manager.setLocalRootDir(dir);
      if (!ok) {
        return false;
      }

      // New dir is valid — signal in-flight scan to stop, tear down old watcher
      this.stopRequested = true;
      this.stopWatching();

      this.index.clear();
      // start() resets stopRequested, sets currentRootDir, and kicks off background scan
      await this.start(dir);
      return true;
    } catch (err) {
      console.error('[SessionIndexer] setRootDir() error:', err);
      // Ensure stopRequested doesn't get stuck true on any error path
      this.stopRequested = false;
      return false;
    }
  }

  // ── Filesystem watching ────────────────────────────────────────────────────

  private startWatching(rootDir: string): void {
    if (process.platform === 'linux') {
      console.log(
        '[SessionIndexer] Filesystem watching not supported on Linux — using manual refresh only',
      );
      return;
    }
    // Close any existing watcher before creating a new one
    this.stopWatching();
    try {
      this.watcher = watch(rootDir, { recursive: true }, (eventType, filename) => {
        this.handleFsEvent(eventType, filename);
      });
      this.watcher.on('error', (err: Error) => {
        console.error('[SessionIndexer] Watcher error:', err);
        this.restartWatcher();
      });
    } catch (err) {
      console.error('[SessionIndexer] startWatching() error:', err);
    }
  }

  private stopWatching(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (err) {
        console.error('[SessionIndexer] stopWatching() close error:', err);
      }
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private handleFsEvent(eventType: string, filename: string | null): void {
    if (!filename) return;
    const parts = filename.split(/[\\/]/);
    const sessionId = parts[0];
    if (!sessionId) return;

    if (eventType === 'rename') {
      this.debounce(`rename:${sessionId}`, () => {
        void this.handleRenameEvent(sessionId);
      });
    } else if (eventType === 'change') {
      this.debounce(`change:${sessionId}`, () => {
        void this.handleChangeEvent(sessionId);
      });
    }
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, SessionIndexer.DEBOUNCE_MS);
    this.debounceTimers.set(key, timer);
  }

  private async handleRenameEvent(sessionId: string): Promise<void> {
    try {
      const myGeneration = this.scanGeneration;

      // Invalidate cached parse so any subsequent getSession() re-reads from disk
      this.manager.invalidateSession(sessionId);

      const items = await this.manager.listSessions();
      if (this.scanGeneration !== myGeneration || this.stopRequested) return;

      const sessionItem = items.find((item) => item.id === sessionId);

      if (!sessionItem) {
        // Session folder was removed — only remove the local (copilot-cli) entry;
        // the fs watcher only observes local files.
        this.index.delete(SessionIndexer.indexKey(sessionId, 'copilot-cli'));
      } else if (!this.index.has(SessionIndexer.indexKey(sessionId, 'copilot-cli'))) {
        // New session folder appeared — index it
        try {
          let metrics: SessionListItemIpc['metrics'] = null;
          const session = await this.manager.getSession(sessionId);
          if (this.scanGeneration !== myGeneration || this.stopRequested) return;
          if (session) {
            metrics = extractSessionListMetrics(session as Session);
          }
          const ipcItem = sessionListItemSchema.parse({
            id: sessionItem.id,
            name: sessionItem.name,
            path: sessionItem.path,
            createdAt: sessionItem.createdAt.toISOString(),
            adapter: sessionItem.adapter,
            metrics,
          });
          this.index.set(SessionIndexer.indexKey(ipcItem.id, ipcItem.adapter), ipcItem);
        } catch (itemErr) {
          console.warn(
            `[SessionIndexer] handleRenameEvent: failed to index session "${sessionId}":`,
            itemErr,
          );
        }
      }

      this.emitUpdated();
      await this.flushDiskCache();
    } catch (err) {
      console.error('[SessionIndexer] handleRenameEvent() error:', err);
    }
  }

  private async handleChangeEvent(sessionId: string): Promise<void> {
    try {
      const myGeneration = this.scanGeneration;

      // Invalidate cached parse so we re-read the updated files from disk
      this.manager.invalidateSession(sessionId);

      const session = await this.manager.getSession(sessionId);
      if (this.scanGeneration !== myGeneration || this.stopRequested) return;

      if (!session) {
        // Session file was removed — only remove the local (copilot-cli) entry.
        this.index.delete(SessionIndexer.indexKey(sessionId, 'copilot-cli'));
      } else {
        const existing = this.index.get(SessionIndexer.indexKey(sessionId, 'copilot-cli'));
        if (existing) {
          // Session is already indexed — update its metrics in place
          try {
            const metrics = extractSessionListMetrics(session as Session);
            const ipcItem = sessionListItemSchema.parse({
              id: existing.id,
              name: existing.name,
              path: existing.path,
              createdAt: existing.createdAt,
              adapter: existing.adapter,
              metrics,
            });
            this.index.set(SessionIndexer.indexKey(ipcItem.id, ipcItem.adapter), ipcItem);
          } catch (itemErr) {
            console.warn(
              `[SessionIndexer] handleChangeEvent: failed to re-index session "${sessionId}":`,
              itemErr,
            );
          }
        } else {
          // Session not yet in the index (change arrived before background scan) —
          // fetch its metadata from listSessions() and create a full entry.
          try {
            const items = await this.manager.listSessions();
            if (this.scanGeneration !== myGeneration || this.stopRequested) return;
            const sessionItem = items.find((item) => item.id === sessionId);
            if (sessionItem) {
              const metrics = extractSessionListMetrics(session as Session);
              const ipcItem = sessionListItemSchema.parse({
                id: sessionItem.id,
                name: sessionItem.name,
                path: sessionItem.path,
                createdAt: sessionItem.createdAt.toISOString(),
                adapter: sessionItem.adapter,
                metrics,
              });
              this.index.set(SessionIndexer.indexKey(ipcItem.id, ipcItem.adapter), ipcItem);
            }
            // If not found in listSessions(), skip — background scan will catch it
          } catch (itemErr) {
            console.warn(
              `[SessionIndexer] handleChangeEvent: failed to index new session "${sessionId}":`,
              itemErr,
            );
          }
        }
      }

      this.emitUpdated();
      await this.flushDiskCache();
    } catch (err) {
      console.error('[SessionIndexer] handleChangeEvent() error:', err);
    }
  }

  private restartWatcher(): void {
    this.stopWatching();
    const rootDir = this.currentRootDir;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopRequested || this.currentRootDir !== rootDir) return;
      this.startWatching(rootDir);
    }, SessionIndexer.WATCHER_RESTART_MS);
  }

  // ── Background scan ────────────────────────────────────────────────────────

  private async runBackgroundScan(): Promise<void> {
    // Guard against concurrent scans
    if (this.scanning) return;
    this.scanning = true;
    this.emit('scanningState', true);

    // Capture the generation at scan start; exit early if a newer scan begins.
    const myGeneration = this.scanGeneration;

    try {
      const items = await this.manager.listSessions();
      if (this.stopRequested || this.scanGeneration !== myGeneration) return;

      // Process in batches, yielding to the event loop between each batch
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (this.stopRequested || this.scanGeneration !== myGeneration) break;

        const batch = items.slice(i, i + BATCH_SIZE);

        // Yield to the event loop before processing each batch
        await new Promise<void>((resolve) => {
          setImmediate(() => {
            void (async () => {
              try {
                for (const item of batch) {
                  if (this.stopRequested || this.scanGeneration !== myGeneration) break;
                  try {
                    let metrics: SessionListItemIpc['metrics'] = null;
                    const session = await this.manager.getSession(item.id);
                    if (session) {
                      metrics = extractSessionListMetrics(session as Session);
                    }
                    const ipcItem = sessionListItemSchema.parse({
                      id: item.id,
                      name: item.name,
                      path: item.path,
                      createdAt: item.createdAt.toISOString(),
                      adapter: item.adapter,
                      metrics,
                    });
                    this.index.set(SessionIndexer.indexKey(ipcItem.id, ipcItem.adapter), ipcItem);
                  } catch (itemErr) {
                    console.warn(
                      `[SessionIndexer] Failed to index session "${item.id}":`,
                      itemErr,
                    );
                  }
                }
                // Emit after every batch so the UI refreshes incrementally
                this.emitUpdated();
              } catch (batchErr) {
                console.error('[SessionIndexer] Batch processing error:', batchErr);
              } finally {
                resolve();
              }
            })();
          });
        });
      }

      // Final emit + cache flush after the full scan completes
      if (!this.stopRequested && this.scanGeneration === myGeneration) {
        this.emitUpdated();
        await this.flushDiskCache();
      }
    } catch (err) {
      console.error('[SessionIndexer] runBackgroundScan() error:', err);
    } finally {
      if (this.scanGeneration === myGeneration) {
        this.scanning = false;
        this.scanPromise = null;
        this.emit('scanningState', false);
      }
    }
  }

  // ── Disk cache ─────────────────────────────────────────────────────────────

  private get cacheFilePath(): string {
    return join(app.getPath('userData'), CACHE_FILE_NAME);
  }

  /**
   * Read and validate the disk cache.
   * Returns an empty array if the cache is missing, corrupt, or belongs to a
   * different rootDir (cache invalidation on directory change).
   */
  private async loadDiskCache(rootDir: string): Promise<SessionListItemIpc[]> {
    try {
      const raw = await readFile(this.cacheFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as DiskCache).version !== CACHE_VERSION ||
        (parsed as DiskCache).rootDir !== rootDir
      ) {
        return [];
      }

      const cache = parsed as DiskCache;
      const validated: SessionListItemIpc[] = [];
      for (const item of cache.sessions) {
        try {
          validated.push(sessionListItemSchema.parse(item));
        } catch {
          // Skip individual invalid entries — partial cache is still useful
        }
      }
      return validated;
    } catch {
      // Cache file missing or JSON parse error — start fresh
      return [];
    }
  }

  /** Persist the current in-memory index to disk. */
  private async flushDiskCache(): Promise<void> {
    try {
      const cache: DiskCache = {
        version: CACHE_VERSION,
        rootDir: this.currentRootDir,
        updatedAt: new Date().toISOString(),
        sessions: this.sortedList(),
      };
      await writeFile(this.cacheFilePath, JSON.stringify(cache), 'utf-8');
    } catch (err) {
      console.error('[SessionIndexer] flushDiskCache() error:', err);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Returns index values sorted by createdAt descending (newest first). */
  private sortedList(): SessionListItemIpc[] {
    return [...this.index.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /** Emit the `'updated'` event with the current sorted list. */
  private emitUpdated(): void {
    this.emit('updated', this.sortedList());
  }
}
