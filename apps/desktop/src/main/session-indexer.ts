/**
 * SessionIndexer — dual-layer cache (memory + disk) with background scanning.
 *
 * Owns:
 * - In-memory Map index for O(1) session list retrieval
 * - Disk cache in app userData for instant startup
 * - Background batch scanning (50/batch with setImmediate yields)
 * - EventEmitter interface for push updates
 *
 * All public methods follow the "never throw" contract —
 * errors are caught and safe defaults are returned.
 */

import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
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
const CACHE_VERSION = 1;
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
  /** In-memory index keyed by session ID. */
  private index = new Map<string, SessionListItemIpc>();
  private currentRootDir = '';
  private scanning = false;
  private stopRequested = false;
  private scanGeneration = 0;
  private scanPromise: Promise<void> | null = null;

  constructor(manager: DataSourceManager) {
    super();
    this.manager = manager;
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
          this.index.set(item.id, item);
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
   * Change the root directory: clears the in-memory index, tells the manager
   * to use the new directory, and restarts the background scan from scratch.
   */
  async setRootDir(dir: string): Promise<void> {
    try {
      // Signal any in-flight scan to stop
      this.stopRequested = true;

      const ok = await this.manager.setLocalRootDir(dir);
      if (!ok) {
        // Directory is invalid — clear index but keep old rootDir
        this.index.clear();
        this.emitUpdated();
        return;
      }

      this.index.clear();
      this.currentRootDir = dir;
      this.stopRequested = false;
      await this.start(dir);
    } catch (err) {
      console.error('[SessionIndexer] setRootDir() error:', err);
    }
  }

  // ── Background scan ────────────────────────────────────────────────────────

  private async runBackgroundScan(): Promise<void> {
    // Guard against concurrent scans
    if (this.scanning) return;
    this.scanning = true;

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
                    this.index.set(ipcItem.id, ipcItem);
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
