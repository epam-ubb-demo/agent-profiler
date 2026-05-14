/**
 * MarkerStore — atomic, corruption-resilient read/write store for per-session
 * sync marker sidecar files.
 *
 * The marker file lives alongside the session's `events.jsonl` as
 * `.agent-profiler-sync.json` and tracks byte offset, last event ID, and
 * categories pushed to remote so subsequent syncs can resume correctly.
 *
 * Atomic write strategy: write to `.tmp` then `fs.rename()` to avoid
 * partial-write corruption on crash.
 */

import { type SyncMarker, syncMarkerSchema } from '@agent-profiler/core';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MARKER_FILENAME = '.agent-profiler-sync.json';

export class MarkerStore {
  /**
   * Read the sync marker for a session directory.
   * Returns null if the marker doesn't exist or is corrupted.
   */
  async read(sessionDir: string): Promise<SyncMarker | null> {
    const filePath = join(sessionDir, MARKER_FILENAME);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = syncMarkerSchema.safeParse(parsed);
      if (!result.success) {
        // Corrupted or outdated schema — treat as no marker
        return null;
      }
      return result.data;
    } catch {
      // ENOENT or read error — no marker
      return null;
    }
  }

  /**
   * Write the sync marker atomically (write to .tmp then rename).
   */
  async write(sessionDir: string, marker: SyncMarker): Promise<void> {
    const filePath = join(sessionDir, MARKER_FILENAME);
    const tmpPath = filePath + '.tmp';
    const data = JSON.stringify(marker, null, 2);
    await writeFile(tmpPath, data, 'utf-8');
    await rename(tmpPath, filePath);
  }

  /**
   * Delete the sync marker (e.g., for a full re-sync).
   */
  async delete(sessionDir: string): Promise<void> {
    const filePath = join(sessionDir, MARKER_FILENAME);
    try {
      await unlink(filePath);
    } catch {
      // Already gone — fine
    }
  }

  /**
   * Clean up any leftover .tmp file (e.g., after crash).
   */
  async cleanupTemp(sessionDir: string): Promise<void> {
    const tmpPath = join(sessionDir, MARKER_FILENAME + '.tmp');
    try {
      await unlink(tmpPath);
    } catch {
      // Already gone — fine
    }
  }
}
