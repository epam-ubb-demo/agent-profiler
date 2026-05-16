import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Marker, MarkerStore, SessionRef } from '@agent-profiler/enrichment-core';
import { markerSchema } from '@agent-profiler/enrichment-core';

/**
 * A MarkerStore implementation that persists markers to the filesystem.
 *
 * Uses atomic writes (write to a `.tmp` file, then rename) for crash safety.
 * Each session gets its own `.marker.json` file inside `baseDir`.
 */
export class FileMarkerStore implements MarkerStore {
  constructor(private readonly baseDir: string) {}

  /** Derive the marker file path from a session ref. */
  private markerPath(ref: SessionRef): string {
    // Use tool--sessionId as filename, sanitising colons for Windows compatibility.
    // Also strip any path-separator characters to prevent traversal.
    const safeName = `${ref.tool}--${ref.sessionId}`
      .replace(/[/\\]/g, '_')
      .concat('.marker.json');
    return join(this.baseDir, safeName);
  }

  async read(ref: SessionRef): Promise<Marker | undefined> {
    try {
      const raw = await readFile(this.markerPath(ref), 'utf-8');
      return markerSchema.parse(JSON.parse(raw));
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async write(ref: SessionRef, marker: Marker): Promise<void> {
    const target = this.markerPath(ref);
    const temp = `${target}.tmp`;
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(temp, JSON.stringify(marker, null, 2), 'utf-8');
    await rename(temp, target);
  }

  async resetCategories(ref: SessionRef, categories: readonly string[]): Promise<void> {
    const marker = await this.read(ref);
    if (!marker) return;
    const updatedCursors = { ...marker.cursors };
    const updatedPayloadSchemaVersions = { ...marker.payloadSchemaVersions };
    for (const category of categories) {
      delete updatedCursors[category];
      delete updatedPayloadSchemaVersions[category];
    }
    const updated: Marker = {
      schemaVersion: 2,
      tool: marker.tool,
      sessionId: marker.sessionId,
      cursors: updatedCursors,
      payloadSchemaVersions: updatedPayloadSchemaVersions,
      ...(marker.tenantId !== undefined ? { tenantId: marker.tenantId } : {}),
      ...(marker.userId !== undefined ? { userId: marker.userId } : {}),
      ...(marker.lastFullReuploadAt !== undefined
        ? { lastFullReuploadAt: marker.lastFullReuploadAt }
        : {}),
    };
    await this.write(ref, updated);
  }

  async resetAll(ref: SessionRef): Promise<void> {
    try {
      await unlink(this.markerPath(ref));
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
