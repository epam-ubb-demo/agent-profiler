/**
 * LocalFsDataSource — implements SessionDataSource by scanning
 * a root directory for session folders.
 *
 * Runs in the Electron main process (Node.js context) only.
 */

import { readdir, stat, access } from 'node:fs/promises';
import { join } from 'node:path';

import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';
import type { Session } from '@agent-profiler/core';

import type { AdapterType, SessionDataSource, SessionListItem } from './types';

/** File signatures used to detect adapter type. */
const ADAPTER_SIGNATURES: ReadonlyArray<{ file: string; adapter: AdapterType }> = [
  { file: 'events.jsonl', adapter: 'copilot-cli' },
  { file: 'events.ndjson', adapter: 'copilot-cli' },
];

/** Default maximum number of cached sessions. */
const DEFAULT_CACHE_SIZE = 50;

/**
 * Scans a local filesystem directory for session folders and parses them
 * using the appropriate adapter.
 */
export class LocalFsDataSource implements SessionDataSource {
  private readonly rootDir: string;
  private readonly maxCacheSize: number;
  private readonly cache = new Map<string, Session>();

  constructor(rootDir: string, options?: { maxCacheSize?: number }) {
    this.rootDir = rootDir;
    this.maxCacheSize = options?.maxCacheSize ?? DEFAULT_CACHE_SIZE;
  }

  /** Returns the root directory being scanned. */
  getRootDir(): string {
    return this.rootDir;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await access(this.rootDir);
      return true;
    } catch {
      return false;
    }
  }

  async listSessions(): Promise<SessionListItem[]> {
    const available = await this.isAvailable();
    if (!available) {
      return [];
    }

    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true });
      const directories = entries.filter((e) => e.isDirectory());

      const items: SessionListItem[] = [];

      for (const dir of directories) {
        const dirPath = join(this.rootDir, dir.name);
        const detected = await this.detectAdapter(dirPath);
        if (detected) {
          const dirStat = await stat(dirPath);
          items.push({
            id: dir.name,
            name: dir.name,
            path: dirPath,
            createdAt: dirStat.birthtime,
            adapter: detected,
          });
        }
      }

      // Sort by creation date descending (newest first)
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return items;
    } catch {
      return [];
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    // Check cache first
    const cached = this.cache.get(sessionId);
    if (cached) {
      return cached;
    }

    const sessionPath = join(this.rootDir, sessionId);

    try {
      await access(sessionPath);
    } catch {
      return null;
    }

    const adapter = await this.detectAdapter(sessionPath);
    if (!adapter) {
      return null;
    }

    const session = await this.parseSession(sessionPath, adapter);
    if (!session) {
      return null;
    }

    // Cache with LRU eviction
    this.addToCache(sessionId, session);
    return session;
  }

  /** Clears the session cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Remove a single session from the in-memory cache so the next read re-parses from disk. */
  invalidateSession(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  private async detectAdapter(dirPath: string): Promise<AdapterType | null> {
    for (const sig of ADAPTER_SIGNATURES) {
      try {
        await access(join(dirPath, sig.file));
        return sig.adapter;
      } catch {
        // File not found, try next
      }
    }
    return null;
  }

  private async parseSession(
    sessionPath: string,
    adapter: AdapterType,
  ): Promise<Session | null> {
    switch (adapter) {
      case 'copilot-cli':
        return parseCopilotCliSession(sessionPath);
      default:
        // Other adapters not yet implemented
        return null;
    }
  }

  private addToCache(sessionId: string, session: Session): void {
    // Simple LRU: if at capacity, delete the oldest entry
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(sessionId, session);
  }
}
