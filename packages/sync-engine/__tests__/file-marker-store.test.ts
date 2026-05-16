/**
 * Tests for FileMarkerStore — contract tests + unit tests.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createTestCursor,
  createTestMarker,
  createTestSessionRef,
  runMarkerContractTests,
} from '@agent-profiler/enrichment-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileMarkerStore } from '../src/file-marker-store.js';

// ── Contract tests ─────────────────────────────────────────────────────────────

// `tmpDir` is refreshed before each `it()` via beforeEach, so each factory()
// call (which happens inside `it()`) gets a clean directory.
let contractTmpDir: string;

beforeEach(async () => {
  contractTmpDir = await mkdtemp(join(tmpdir(), 'sync-engine-contract-'));
});

afterEach(async () => {
  await rm(contractTmpDir, { recursive: true, force: true });
});

runMarkerContractTests(() => new FileMarkerStore(contractTmpDir));

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('FileMarkerStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sync-engine-unit-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('write()', () => {
    it('creates baseDir automatically if it does not exist', async () => {
      const nested = join(tmpDir, 'does', 'not', 'exist', 'yet');
      const store = new FileMarkerStore(nested);
      const ref = createTestSessionRef('copilot-cli', 'auto-mkdir-session');
      const marker = createTestMarker('copilot-cli', 'auto-mkdir-session');

      await store.write(ref, marker);

      const read = await store.read(ref);
      expect(read).toBeDefined();
      expect(read?.sessionId).toBe('auto-mkdir-session');
    });

    it('does not leave a .tmp file after a successful write', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'atomic-test');
      const marker = createTestMarker('copilot-cli', 'atomic-test');

      await store.write(ref, marker);

      // The .tmp file should have been renamed away
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tmpDir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });

    it('overwrites the marker file on a second write', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'overwrite-test');
      const cursor1 = createTestCursor('copilot-cli', 'overwrite-test', 'metadata', 3);
      const cursor2 = createTestCursor('copilot-cli', 'overwrite-test', 'metadata', 9);

      await store.write(ref, createTestMarker('copilot-cli', 'overwrite-test', { metadata: cursor1 }));
      await store.write(ref, createTestMarker('copilot-cli', 'overwrite-test', { metadata: cursor2 }));

      const read = await store.read(ref);
      expect(read?.cursors.metadata?.lastOrdinal).toBe(9);
    });
  });

  describe('read()', () => {
    it('throws (not returns undefined) when the file contains invalid JSON', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'bad-json-session');

      // Manually write a corrupted marker file
      const safeName = 'copilot-cli--bad-json-session.marker.json';
      await writeFile(join(tmpDir, safeName), '{ not valid json ]]]', 'utf-8');

      await expect(store.read(ref)).rejects.toThrow();
    });

    it('throws (not returns undefined) when the file contains valid JSON but invalid marker shape', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'bad-schema-session');

      const safeName = 'copilot-cli--bad-schema-session.marker.json';
      await writeFile(join(tmpDir, safeName), JSON.stringify({ schemaVersion: 99, tool: 'copilot-cli' }), 'utf-8');

      await expect(store.read(ref)).rejects.toThrow();
    });
  });

  describe('markerPath / file path sanitisation', () => {
    it('replaces forward slashes in sessionId to prevent path traversal', async () => {
      const store = new FileMarkerStore(tmpDir);
      // A sessionId with path traversal characters
      const ref = createTestSessionRef('copilot-cli', '../../../etc/passwd');
      const marker = createTestMarker('copilot-cli', '../../../etc/passwd');

      await store.write(ref, marker);

      // The file must be inside tmpDir, not somewhere up the tree
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tmpDir);
      expect(files.length).toBe(1);
      // The file name should not contain slashes
      const filename = files[0];
      expect(filename).toBeDefined();
      expect(filename).not.toContain('/');
      expect(filename).not.toContain('\\');
      // It should still be readable under the sanitised ref
      const read = await store.read(ref);
      expect(read).toBeDefined();
    });

    it('replaces backslashes in sessionId to prevent path traversal', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'sub\\session');
      const marker = createTestMarker('copilot-cli', 'sub\\session');

      await store.write(ref, marker);

      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tmpDir);
      const markerFiles = files.filter((f) => f.endsWith('.marker.json'));
      expect(markerFiles.length).toBe(1);
      expect(markerFiles[0]).not.toContain('\\');
    });
  });

  describe('multiple sessions', () => {
    it('stores markers for different sessions independently in the same baseDir', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref1 = createTestSessionRef('copilot-cli', 'session-aaa');
      const ref2 = createTestSessionRef('vscode-chat', 'session-bbb');
      const ref3 = createTestSessionRef('claude-code', 'session-ccc');

      const cursor1 = createTestCursor('copilot-cli', 'session-aaa', 'metadata', 1);
      const cursor2 = createTestCursor('vscode-chat', 'session-bbb', 'metadata', 2);
      const cursor3 = createTestCursor('claude-code', 'session-ccc', 'metadata', 3);

      await store.write(ref1, createTestMarker('copilot-cli', 'session-aaa', { metadata: cursor1 }));
      await store.write(ref2, createTestMarker('vscode-chat', 'session-bbb', { metadata: cursor2 }));
      await store.write(ref3, createTestMarker('claude-code', 'session-ccc', { metadata: cursor3 }));

      const [read1, read2, read3] = await Promise.all([
        store.read(ref1),
        store.read(ref2),
        store.read(ref3),
      ]);

      expect(read1?.cursors.metadata?.lastOrdinal).toBe(1);
      expect(read2?.cursors.metadata?.lastOrdinal).toBe(2);
      expect(read3?.cursors.metadata?.lastOrdinal).toBe(3);

      // Deleting one doesn't affect the others
      await store.resetAll(ref1);
      expect(await store.read(ref1)).toBeUndefined();
      expect(await store.read(ref2)).toBeDefined();
      expect(await store.read(ref3)).toBeDefined();
    });
  });

  describe('resetCategories()', () => {
    it('preserves optional marker fields (tenantId, userId, lastFullReuploadAt) after reset', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'optional-fields-session');
      const cursor = createTestCursor('copilot-cli', 'optional-fields-session', 'metadata', 5);

      // Write a marker with optional fields
      const now = new Date().toISOString();
      const marker = {
        schemaVersion: 2 as const,
        tool: 'copilot-cli' as const,
        sessionId: 'optional-fields-session',
        tenantId: 'tenant-123',
        userId: 'user-456',
        lastFullReuploadAt: now,
        cursors: { metadata: cursor },
        payloadSchemaVersions: { metadata: 'v1' },
      };

      await store.write(ref, marker);
      await store.resetCategories(ref, ['metadata']);

      const read = await store.read(ref);
      expect(read?.tenantId).toBe('tenant-123');
      expect(read?.userId).toBe('user-456');
      expect(read?.lastFullReuploadAt).toBe(now);
      expect(read?.cursors.metadata).toBeUndefined();
    });

    it('is a no-op when the marker does not exist', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'nonexistent-reset');

      await expect(store.resetCategories(ref, ['metadata'])).resolves.not.toThrow();
    });
  });

  describe('resetAll()', () => {
    it('is idempotent — calling twice does not throw', async () => {
      const store = new FileMarkerStore(tmpDir);
      const ref = createTestSessionRef('copilot-cli', 'double-reset-session');
      const marker = createTestMarker('copilot-cli', 'double-reset-session');

      await store.write(ref, marker);
      await store.resetAll(ref);
      await expect(store.resetAll(ref)).resolves.not.toThrow();
    });
  });

  describe('concurrent writes to different sessions', () => {
    it('handles concurrent writes without data corruption', async () => {
      const store = new FileMarkerStore(tmpDir);
      const refs = Array.from({ length: 5 }, (_, i) =>
        createTestSessionRef('copilot-cli', `concurrent-session-${i}`),
      );

      await Promise.all(
        refs.map((ref, i) =>
          store.write(
            ref,
            createTestMarker('copilot-cli', ref.sessionId, {
              metadata: createTestCursor('copilot-cli', ref.sessionId, 'metadata', i),
            }),
          ),
        ),
      );

      const results = await Promise.all(refs.map((ref) => store.read(ref)));
      results.forEach((marker, i) => {
        expect(marker?.cursors.metadata?.lastOrdinal).toBe(i);
      });
    });
  });
});
