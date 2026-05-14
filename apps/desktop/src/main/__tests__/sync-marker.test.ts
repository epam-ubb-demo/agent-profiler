/**
 * Unit tests for MarkerStore.
 *
 * Tests the atomic read/write semantics of the sync marker sidecar file,
 * including corruption resilience and cleanup operations.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

import type { SyncMarker } from '@agent-profiler/core';
import { MarkerStore } from '../sync-marker';

describe('MarkerStore', () => {
  let tempDir: string;
  let store: MarkerStore;

  beforeEach(async () => {
    // Create a real temporary directory for filesystem tests
    tempDir = await mkdtemp(join(tmpdir(), 'marker-store-test-'));
    store = new MarkerStore();
  });

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('read()', () => {
    it('returns null when marker file does not exist', async () => {
      const result = await store.read(tempDir);
      expect(result).toBeNull();
    });

    it('returns null when marker file contains invalid JSON', async () => {
      const { writeFile } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      await writeFile(markerPath, 'not valid json {', 'utf-8');

      const result = await store.read(tempDir);
      expect(result).toBeNull();
    });

    it('returns null when marker file fails schema validation (wrong version)', async () => {
      const { writeFile } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      const invalid = {
        version: 2, // Wrong version
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 0,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: ['metadata'],
        schemaVersion: 1,
      };
      await writeFile(markerPath, JSON.stringify(invalid), 'utf-8');

      const result = await store.read(tempDir);
      expect(result).toBeNull();
    });

    it('returns null when marker file fails schema validation (missing fields)', async () => {
      const { writeFile } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      const invalid = {
        version: 1,
        // Missing other required fields
      };
      await writeFile(markerPath, JSON.stringify(invalid), 'utf-8');

      const result = await store.read(tempDir);
      expect(result).toBeNull();
    });

    it('returns valid SyncMarker when file is correct', async () => {
      const { writeFile } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      const valid: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 1024,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:30Z',
        categoriesPushed: ['metadata', 'utilisation'],
        schemaVersion: 1,
      };
      await writeFile(markerPath, JSON.stringify(valid), 'utf-8');

      const result = await store.read(tempDir);
      expect(result).toEqual(valid);
    });

    it('returns null when marker file has negative byte offset', async () => {
      const { writeFile } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      const invalid = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: -1, // Invalid
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: ['metadata'],
        schemaVersion: 1,
      };
      await writeFile(markerPath, JSON.stringify(invalid), 'utf-8');

      const result = await store.read(tempDir);
      expect(result).toBeNull();
    });
  });

  describe('write()', () => {
    it('creates marker file with correct JSON content', async () => {
      const { readFile } = await import('node:fs/promises');
      const marker: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 2048,
        lastSyncedEventId: 'evt-002',
        lastEventTimestamp: '2025-01-15T10:01:00Z',
        categoriesPushed: ['metadata', 'utilisation', 'compactions'],
        schemaVersion: 1,
      };

      await store.write(tempDir, marker);

      const content = await readFile(join(tempDir, '.agent-profiler-sync.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(marker);
    });

    it('is atomic — .tmp file does not linger after successful write', async () => {
      const { exists } = await import('fs/promises').then(
        (m) => ({
          exists: async (path: string) => {
            try {
              await m.access(path);
              return true;
            } catch {
              return false;
            }
          },
        }),
        (e) => ({ exists: async () => false }),
      );

      const marker: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 0,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: [],
        schemaVersion: 1,
      };

      await store.write(tempDir, marker);

      // Verify .tmp file is gone after atomic write
      const tmpPath = join(tempDir, '.agent-profiler-sync.json.tmp');
      const hasTemp = await exists(tmpPath);
      expect(hasTemp).toBe(false);
    });

    it('overwrites existing marker', async () => {
      const { readFile } = await import('node:fs/promises');
      const marker1: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 100,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: [],
        schemaVersion: 1,
      };
      const marker2: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T11:00:00Z',
        lastSyncedByteOffset: 500,
        lastSyncedEventId: 'evt-002',
        lastEventTimestamp: '2025-01-15T11:00:00Z',
        categoriesPushed: ['metadata'],
        schemaVersion: 1,
      };

      await store.write(tempDir, marker1);
      await store.write(tempDir, marker2);

      const content = await readFile(join(tempDir, '.agent-profiler-sync.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(marker2);
    });
  });

  describe('delete()', () => {
    it('removes marker file', async () => {
      const { writeFile, access } = await import('node:fs/promises');
      const markerPath = join(tempDir, '.agent-profiler-sync.json');
      const marker: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedByteOffset: 0,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: [],
        schemaVersion: 1,
      };

      await store.write(tempDir, marker);
      await store.delete(tempDir);

      try {
        await access(markerPath);
        expect.fail('File should have been deleted');
      } catch {
        // Expected — file is gone
      }
    });

    it("does not throw when file doesn't exist", async () => {
      // Should not throw even though marker doesn't exist
      await expect(store.delete(tempDir)).resolves.toBeUndefined();
    });

    it('does not throw when called on non-existent directory', async () => {
      const nonExistent = join(tempDir, 'does-not-exist');
      await expect(store.delete(nonExistent)).resolves.toBeUndefined();
    });
  });

  describe('cleanupTemp()', () => {
    it('removes .tmp file', async () => {
      const { writeFile, access } = await import('node:fs/promises');
      const tmpPath = join(tempDir, '.agent-profiler-sync.json.tmp');
      await writeFile(tmpPath, 'temp content', 'utf-8');

      await store.cleanupTemp(tempDir);

      try {
        await access(tmpPath);
        expect.fail('.tmp file should have been deleted');
      } catch {
        // Expected — file is gone
      }
    });

    it("does not throw when .tmp doesn't exist", async () => {
      await expect(store.cleanupTemp(tempDir)).resolves.toBeUndefined();
    });

    it('does not throw when called on non-existent directory', async () => {
      const nonExistent = join(tempDir, 'does-not-exist');
      await expect(store.cleanupTemp(nonExistent)).resolves.toBeUndefined();
    });
  });

  describe('integration', () => {
    it('read/write cycle preserves marker data exactly', async () => {
      const original: SyncMarker = {
        version: 1,
        lastSyncedAt: '2025-01-15T10:15:30Z',
        lastSyncedByteOffset: 5120,
        lastSyncedEventId: 'evt-123-abc',
        lastEventTimestamp: '2025-01-15T10:16:00Z',
        categoriesPushed: ['metadata', 'utilisation', 'compactions', 'toolResults'],
        schemaVersion: 1,
      };

      await store.write(tempDir, original);
      const read = await store.read(tempDir);

      expect(read).toEqual(original);
    });
  });
});
