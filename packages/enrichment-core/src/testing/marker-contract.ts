/**
 * Contract test suite for MarkerStore implementations.
 * Reusable by any package that implements the marker store interface.
 */

import { describe, expect, it } from 'vitest';

import type { MarkerStore } from '../index.js';

import { createTestCursor, createTestMarker, createTestSessionRef } from './fakes.js';

/**
 * Runs a standard set of contract tests against a MarkerStore implementation.
 * 
 * @param factory - A function that returns a fresh marker store instance
 * 
 * @example
 * ```typescript
 * import { runMarkerContractTests } from '@agent-profiler/enrichment-core/testing';
 * import { MyMarkerStore } from './my-marker-store';
 * 
 * runMarkerContractTests(() => new MyMarkerStore());
 * ```
 */
export function runMarkerContractTests(factory: () => MarkerStore): void {
  describe('MarkerStore contract', () => {
    it('should return undefined for unknown session', async () => {
      const store = factory();
      const ref = createTestSessionRef('copilot-cli', 'unknown-session');

      const marker = await store.read(ref);
      expect(marker).toBeUndefined();
    });

    it('should write and read back a marker', async () => {
      const store = factory();
      const ref = createTestSessionRef('copilot-cli', 'session-123');
      const cursor = createTestCursor('copilot-cli', 'session-123', 'metadata', 5);
      const marker = createTestMarker('copilot-cli', 'session-123', {
        metadata: cursor,
      });

      await store.write(ref, marker);
      const read = await store.read(ref);

      expect(read).toBeDefined();
      expect(read?.schemaVersion).toBe(2);
      expect(read?.tool).toBe('copilot-cli');
      expect(read?.sessionId).toBe('session-123');
      expect(read?.cursors.metadata).toEqual(cursor);
    });

    it('should overwrite previous marker when writing again', async () => {
      const store = factory();
      const ref = createTestSessionRef('copilot-cli', 'session-456');
      
      const marker1 = createTestMarker('copilot-cli', 'session-456', {
        metadata: createTestCursor('copilot-cli', 'session-456', 'metadata', 1),
      });
      await store.write(ref, marker1);

      const marker2 = createTestMarker('copilot-cli', 'session-456', {
        metadata: createTestCursor('copilot-cli', 'session-456', 'metadata', 10),
        turns: createTestCursor('copilot-cli', 'session-456', 'turns', 5),
      });
      await store.write(ref, marker2);

      const read = await store.read(ref);
      if (!read) throw new Error('Expected read to be defined');
      if (!read.cursors.metadata) throw new Error('Expected metadata cursor to exist');
      expect(read.cursors.metadata.lastOrdinal).toBe(10);
      expect(read.cursors.turns).toBeDefined();
    });

    it('should remove specified categories via resetCategories', async () => {
      const store = factory();
      const ref = createTestSessionRef('copilot-cli', 'session-789');
      
      const marker = createTestMarker('copilot-cli', 'session-789', {
        metadata: createTestCursor('copilot-cli', 'session-789', 'metadata', 3),
        turns: createTestCursor('copilot-cli', 'session-789', 'turns', 7),
        context: createTestCursor('copilot-cli', 'session-789', 'context', 2),
      });
      await store.write(ref, marker);

      await store.resetCategories(ref, ['metadata', 'turns']);

      const read = await store.read(ref);
      expect(read?.cursors.metadata).toBeUndefined();
      expect(read?.cursors.turns).toBeUndefined();
      expect(read?.cursors.context).toBeDefined();
    });

    it('should leave other categories untouched when resetting specific ones', async () => {
      const store = factory();
      const ref = createTestSessionRef('vscode-chat', 'session-abc');
      
      const originalCursor = createTestCursor('vscode-chat', 'session-abc', 'context', 42);
      const marker = createTestMarker('vscode-chat', 'session-abc', {
        metadata: createTestCursor('vscode-chat', 'session-abc', 'metadata', 10),
        context: originalCursor,
      });
      await store.write(ref, marker);

      await store.resetCategories(ref, ['metadata']);

      const read = await store.read(ref);
      expect(read?.cursors.metadata).toBeUndefined();
      expect(read?.cursors.context).toEqual(originalCursor);
    });

    it('should remove entire marker via resetAll', async () => {
      const store = factory();
      const ref = createTestSessionRef('claude-code', 'session-def');
      
      const marker = createTestMarker('claude-code', 'session-def', {
        metadata: createTestCursor('claude-code', 'session-def', 'metadata', 5),
      });
      await store.write(ref, marker);

      await store.resetAll(ref);

      const read = await store.read(ref);
      expect(read).toBeUndefined();
    });

    it('should not throw when resetting non-existent marker', async () => {
      const store = factory();
      const ref = createTestSessionRef('copilot-cli', 'non-existent');

      // Should not throw
      await expect(store.resetAll(ref)).resolves.not.toThrow();
    });

    it('should handle multiple sessions independently', async () => {
      const store = factory();
      const ref1 = createTestSessionRef('copilot-cli', 'session-1');
      const ref2 = createTestSessionRef('vscode-chat', 'session-2');

      const marker1 = createTestMarker('copilot-cli', 'session-1', {
        metadata: createTestCursor('copilot-cli', 'session-1', 'metadata', 1),
      });
      const marker2 = createTestMarker('vscode-chat', 'session-2', {
        metadata: createTestCursor('vscode-chat', 'session-2', 'metadata', 2),
      });

      await store.write(ref1, marker1);
      await store.write(ref2, marker2);

      const read1 = await store.read(ref1);
      const read2 = await store.read(ref2);

      if (!read1 || !read2) throw new Error('Expected both reads to be defined');
      if (!read1.cursors.metadata || !read2.cursors.metadata) {
        throw new Error('Expected both to have metadata cursors');
      }
      expect(read1.cursors.metadata.lastOrdinal).toBe(1);
      expect(read2.cursors.metadata.lastOrdinal).toBe(2);
    });
  });
}
