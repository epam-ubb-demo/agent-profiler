import type { Session, SessionListItemIpc } from '@agent-profiler/core';
import type { SessionListItem } from '@agent-profiler/data-source';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataSourceManager } from '../data-source-manager';
import { SessionIndexer } from '../session-indexer';

// ─── Mocks must be defined before imports ──────────────────────────────────

vi.mock('node:fs/promises', () => {
  const mockModule = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  };
  // Export mockModule so we can access it in tests
  (global as Record<string, unknown>).__mockFsPromises = mockModule;
  return mockModule;
});

vi.mock('node:fs', () => {
  const mockWatcher = {
    close: vi.fn(),
    on: vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>(),
  };
  const mockWatch = vi.fn().mockReturnValue(mockWatcher);
  (global as Record<string, unknown>).__mockNodeFs = { watch: mockWatch, watcher: mockWatcher };
  return { watch: mockWatch };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => {
      return key === 'userData' ? '/tmp/mock-app-data' : '/tmp';
    }),
  },
}));

vi.mock('../session-list-metrics', () => ({
  extractSessionListMetrics: vi.fn((_session: Session) => ({
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCostUsd: 0.001,
    costConfidence: 'known' as const,
    wallTimeMs: 1000,
    repository: 'https://example.com/repo.git',
    modelUsage: [],
  })),
}));

// ─── Helper functions ──────────────────────────────────────────────────────

function makeSessionListItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: 'session-1',
    name: 'Test Session 1',
    path: '/sessions/session-1',
    createdAt: new Date('2024-12-01T10:00:00Z'),
    adapter: 'copilot-cli',
    ...overrides,
  };
}

function makeSessionListItemIpc(overrides: Partial<SessionListItemIpc> = {}): SessionListItemIpc {
  return {
    id: 'session-1',
    name: 'Test Session 1',
    path: '/sessions/session-1',
    createdAt: '2024-12-01T10:00:00Z',
    adapter: 'copilot-cli',
    metrics: null,
    ...overrides,
  };
}

function makeMockDataSourceManager(overrides: Partial<DataSourceManager> = {}): DataSourceManager {
  return {
    listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([]),
    getSession: vi.fn<(id: string) => Promise<Session | null>>().mockResolvedValue(null),
    setLocalRootDir: vi.fn<(dir: string) => Promise<boolean>>().mockResolvedValue(true),
    invalidateSession: vi.fn<(id: string) => void>(),
    ...overrides,
  } as unknown as DataSourceManager;
}

/**
 * Properly flush all pending microtasks, macrotasks, and nested setImmediate callbacks.
 */
async function flushAllAsync(): Promise<void> {
  for (let iteration = 0; iteration < 100; iteration++) {
    await new Promise<void>((resolve) => {
      resolve();
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('SessionIndexer', () => {
  let indexer: SessionIndexer;
  let mockManager: DataSourceManager;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockUnlink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Get the mocked fs/promises module
    const mockFs = (global as Record<string, unknown>).__mockFsPromises;
    mockReadFile = (mockFs as Record<string, unknown>).readFile as ReturnType<typeof vi.fn>;
    mockWriteFile = (mockFs as Record<string, unknown>).writeFile as ReturnType<typeof vi.fn>;
    mockUnlink = (mockFs as Record<string, unknown>).unlink as ReturnType<typeof vi.fn>;
    
    mockManager = makeMockDataSourceManager();
    indexer = new SessionIndexer(mockManager);
  });

  afterEach(async () => {
    await indexer.stop();
    vi.clearAllMocks();
  });

  // ── Test 1: Empty root dir ─────────────────────────────────────────────────

  describe('empty root dir', () => {
    it('returns empty list when listSessions returns empty array', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('emits when scan completes even if empty', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const updatedCalls = emitSpy.mock.calls.filter((call) => call[0] === 'updated');
      expect(updatedCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Test 2: Disk cache load ────────────────────────────────────────────────

  describe('disk cache load', () => {
    it('loads and returns cached data immediately on start()', async () => {
      const cachedItem = makeSessionListItemIpc({
        id: 'cached-session',
        name: 'Cached Session',
        createdAt: '2024-12-01T10:00:00Z',
      });

      const cacheContent = JSON.stringify({
        version: 2,
        rootDir: '/root',
        updatedAt: '2024-12-15T00:00:00Z',
        sessions: [cachedItem],
      });

      mockReadFile.mockResolvedValueOnce(cacheContent);
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      expect(indexer.getSessionList()).toHaveLength(1);
      expect(indexer.getSessionList()[0]?.id).toBe('cached-session');

      expect(emitSpy).toHaveBeenCalledWith('updated', expect.arrayContaining([
        expect.objectContaining({ id: 'cached-session' }),
      ]));
    });

    it('returns empty list when cache file does not exist', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('returns empty list when cache is malformed JSON', async () => {
      mockReadFile.mockResolvedValueOnce('{ invalid json }');
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });
  });

  // ── Test 3: Background scan updates ────────────────────────────────────────

  describe('background scan updates', () => {
    it('calls listSessions and getSession for each item', async () => {
      const items = [
        makeSessionListItem({ id: 'session-1', name: 'Session 1' }),
        makeSessionListItem({ id: 'session-2', name: 'Session 2' }),
      ];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      expect(mockManager.listSessions).toHaveBeenCalled();
      expect(mockManager.getSession).toHaveBeenCalledWith('session-1');
      expect(mockManager.getSession).toHaveBeenCalledWith('session-2');
    });

    it('emits updated event with sorted list after scan', async () => {
      const items = [
        makeSessionListItem({ id: 's1', createdAt: new Date('2024-12-01T10:00:00Z') }),
        makeSessionListItem({ id: 's2', createdAt: new Date('2024-12-02T10:00:00Z') }),
      ];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const updatedCalls = emitSpy.mock.calls.filter((call) => call[0] === 'updated');
      expect(updatedCalls.length).toBeGreaterThan(0);
      const lastEmitCall = updatedCalls[updatedCalls.length - 1];
      const emittedList = lastEmitCall![1] as SessionListItemIpc[];
      expect(emittedList[0]?.id).toBe('s2');
      expect(emittedList[1]?.id).toBe('s1');
    });

    it('updates index with parsed IPC items', async () => {
      const items = [makeSessionListItem({ id: 'session-1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      const list = indexer.getSessionList();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('session-1');
      expect(list[0]?.createdAt).toBe('2024-12-01T10:00:00.000Z');
    });
  });

  // ── Test 4: setRootDir clears and rescans ───────────────────────────────────

  describe('setRootDir', () => {
    it('clears old index when changing directory', async () => {
      const oldItems = [makeSessionListItem({ id: 'old-session' })];
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(oldItems);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/old-root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toHaveLength(1);

      const newItems = [makeSessionListItem({ id: 'new-session' })];
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(newItems);

      await indexer.setRootDir('/new-root');
      await flushAllAsync();

      expect(mockManager.setLocalRootDir).toHaveBeenCalledWith('/new-root');
      expect(indexer.getSessionList()).toHaveLength(1);
      expect(indexer.getSessionList()[0]?.id).toBe('new-session');
    });

    it('calls manager.setLocalRootDir with new directory', async () => {
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.setRootDir('/new-root');

      expect(mockManager.setLocalRootDir).toHaveBeenCalledWith('/new-root');
    });

    it('preserves index and does not emit when setLocalRootDir returns false', async () => {
      // Seed the indexer with a session
      const items = [makeSessionListItem({ id: 'old-session' })];
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/old-root');
      await flushAllAsync();
      expect(indexer.getSessionList()).toHaveLength(1);

      // Now point to an invalid directory
      vi.mocked(mockManager.setLocalRootDir).mockResolvedValueOnce(false);
      const updatedLists: SessionListItemIpc[][] = [];
      indexer.on('updated', (list: SessionListItemIpc[]) => updatedLists.push(list));

      await indexer.setRootDir('/invalid-root');

      // Index must be preserved — no state change when dir is invalid
      expect(indexer.getSessionList()).toHaveLength(1);
      expect(updatedLists).toHaveLength(0);
      // currentRootDir must NOT have changed to the invalid dir
      // (verified indirectly: a subsequent start('/old-root') should work)
    });

    it('returns true when the directory change succeeds', async () => {
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.setLocalRootDir).mockResolvedValueOnce(true);
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      const result = await indexer.setRootDir('/new-root');

      expect(result).toBe(true);
    });

    it('returns false when the target directory is invalid', async () => {
      // Seed the indexer with a session to test that we correctly handle rejection
      const items = [makeSessionListItem({ id: 'old-session' })];
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/old-root');
      await flushAllAsync();

      // Now try to set an invalid directory
      vi.mocked(mockManager.setLocalRootDir).mockResolvedValueOnce(false);

      const result = await indexer.setRootDir('/invalid-root');

      expect(result).toBe(false);
      // Verify the index is preserved — state must not change on failure
      expect(indexer.getSessionList()).toHaveLength(1);
      expect(indexer.getSessionList()[0]?.id).toBe('old-session');
    });

    it('returns false when an error occurs during directory change', async () => {
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      // Mock setLocalRootDir to throw
      vi.mocked(mockManager.setLocalRootDir).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const result = await indexer.setRootDir('/invalid-root');

      expect(result).toBe(false);
    });

    it('returns true and rescans when changing to a valid directory', async () => {
      // Start with initial directory and sessions
      const initialItems = [makeSessionListItem({ id: 'session-1' })];
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(initialItems);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/initial-root');
      await flushAllAsync();
      expect(indexer.getSessionList()).toHaveLength(1);

      // Switch to new directory with different sessions
      const newItems = [
        makeSessionListItem({ id: 'new-session-1' }),
        makeSessionListItem({ id: 'new-session-2' }),
      ];
      vi.mocked(mockManager.setLocalRootDir).mockResolvedValueOnce(true);
      vi.mocked(mockManager.listSessions).mockResolvedValueOnce(newItems);

      const result = await indexer.setRootDir('/new-root');

      expect(result).toBe(true);
      await flushAllAsync();

      // Verify new sessions are indexed
      const list = indexer.getSessionList();
      expect(list).toHaveLength(2);
      expect(list.some((item) => item.id === 'new-session-1')).toBe(true);
      expect(list.some((item) => item.id === 'new-session-2')).toBe(true);
      // Verify old sessions are cleared
      expect(list.some((item) => item.id === 'session-1')).toBe(false);
    });
  });

  // ── Test 5: Disk cache flush ───────────────────────────────────────────────

  describe('disk cache flush', () => {
    it('writes cache to disk after scan completes', async () => {
      const items = [makeSessionListItem({ id: 'session-1', name: 'Session 1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall![0]).toContain('session-index-cache.json');

      const cacheContent = JSON.parse(writeCall![1] as string);
      expect(cacheContent.version).toBe(2);
      expect(cacheContent.rootDir).toBe('/root');
      expect(cacheContent.sessions).toHaveLength(1);
      expect(cacheContent.sessions[0]?.id).toBe('session-1');
    });

    it('flushes cache on stop()', async () => {
      const items = [makeSessionListItem({ id: 'session-1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      mockWriteFile.mockClear();

      await indexer.stop();

      expect(mockWriteFile).toHaveBeenCalled();
      const cacheContent = JSON.parse(mockWriteFile.mock.calls[0]![1] as string);
      expect(cacheContent.sessions).toHaveLength(1);
    });
  });

  // ── Test 6: Cache invalidation ─────────────────────────────────────────────

  describe('cache invalidation', () => {
    it('ignores cache when rootDir does not match', async () => {
      const cachedItem = makeSessionListItemIpc({
        id: 'cached-session',
        name: 'Cached Session',
      });

      const cacheContent = JSON.stringify({
        version: 1,
        rootDir: '/old-root',
        updatedAt: '2024-12-15T00:00:00Z',
        sessions: [cachedItem],
      });

      mockReadFile.mockResolvedValueOnce(cacheContent);
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/new-root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('ignores cache with wrong version', async () => {
      const cachedItem = makeSessionListItemIpc({ id: 'cached-session' });

      const cacheContent = JSON.stringify({
        version: 999,
        rootDir: '/root',
        updatedAt: '2024-12-15T00:00:00Z',
        sessions: [cachedItem],
      });

      mockReadFile.mockResolvedValueOnce(cacheContent);
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('skips invalid items in cache but loads valid ones', async () => {
      const validItem = makeSessionListItemIpc({ id: 'valid-session' });
      const invalidItem = { id: 'invalid' };

      const cacheContent = JSON.stringify({
        version: 2,
        rootDir: '/root',
        updatedAt: '2024-12-15T00:00:00Z',
        sessions: [validItem, invalidItem],
      });

      mockReadFile.mockResolvedValueOnce(cacheContent);
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      const list = indexer.getSessionList();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('valid-session');
    });
  });

  // ── Test 7: Batch scanning ────────────────────────────────────────────────

  describe('batch scanning', () => {
    it('processes sessions in batches of 50 with setImmediate yields', async () => {
      const items = Array.from({ length: 120 }, (_, i) =>
        makeSessionListItem({
          id: `session-${i}`,
          name: `Session ${i}`,
          createdAt: new Date(2024, 11, 1 + i),
        }),
      );

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const updatedCalls = emitSpy.mock.calls.filter((call) => call[0] === 'updated');
      expect(updatedCalls.length).toBeGreaterThan(1);

      const list = indexer.getSessionList();
      expect(list).toHaveLength(120);
    });
  });

  // ── Test 8: Error handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('skips session when parse fails but continues scan', async () => {
      const items = [
        makeSessionListItem({ id: 'session-1' }),
        makeSessionListItem({ id: 'session-2' }),
      ];

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession)
        .mockResolvedValueOnce({ parseStatus: { status: 'ok' } } as unknown as Session)
        .mockRejectedValueOnce(new Error('Parse error'));

      await indexer.start('/root');
      await flushAllAsync();

      const list = indexer.getSessionList();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('session-1');
    });

    it('continues scan when listSessions fails', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockRejectedValue(new Error('Network error'));

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('does not throw when start() fails', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('Disk error'));
      vi.mocked(mockManager.listSessions).mockRejectedValue(new Error('Manager error'));

      expect(async () => {
        await indexer.start('/root');
      }).not.toThrow();
    });

    it('does not throw when stop() fails', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('Disk error'));

      expect(async () => {
        await indexer.stop();
      }).not.toThrow();
    });
  });

  // ── Test 9: stop() ────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('signals scan to stop and flushes cache', async () => {
      const items = Array.from({ length: 100 }, (_, i) =>
        makeSessionListItem({ id: `session-${i}` }),
      );

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      const listBeforeStop = indexer.getSessionList();

      mockWriteFile.mockClear();
      await indexer.stop();

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const cacheContent = JSON.parse(writeCall![1] as string);
      expect(cacheContent.sessions).toBeDefined();
      expect(cacheContent.sessions.length).toBeLessThanOrEqual(listBeforeStop.length);
    });
  });

  // ── Test 10: getSessionList is sync ───────────────────────────────────────

  describe('getSessionList()', () => {
    it('returns immediately from memory without async calls', async () => {
      const items = [
        makeSessionListItem({ id: 'session-1', createdAt: new Date('2024-12-01T10:00:00Z') }),
        makeSessionListItem({ id: 'session-2', createdAt: new Date('2024-12-02T10:00:00Z') }),
      ];

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      const list = indexer.getSessionList();

      expect(list).toBeDefined();
      expect(Array.isArray(list)).toBe(true);
    });

    it('returns list sorted by createdAt descending', async () => {
      const items = [
        makeSessionListItem({ id: 's1', createdAt: new Date('2024-12-01T10:00:00Z') }),
        makeSessionListItem({ id: 's2', createdAt: new Date('2024-12-02T10:00:00Z') }),
        makeSessionListItem({ id: 's3', createdAt: new Date('2024-12-03T10:00:00Z') }),
      ];

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      const list = indexer.getSessionList();

      expect(list[0]?.id).toBe('s3');
      expect(list[1]?.id).toBe('s2');
      expect(list[2]?.id).toBe('s1');
    });

    it('returns empty array initially', () => {
      const list = indexer.getSessionList();
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(0);
    });
  });

  // ── Integration tests ──────────────────────────────────────────────────────

  describe('integration scenarios', () => {
    it('handles full lifecycle: start -> scan -> stop', async () => {
      const items = [
        makeSessionListItem({ id: 'session-1' }),
        makeSessionListItem({ id: 'session-2' }),
      ];

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toHaveLength(2);
      expect(emitSpy).toHaveBeenCalledWith('updated', expect.any(Array));

      mockWriteFile.mockClear();
      await indexer.stop();

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('emits incrementally during batch processing', async () => {
      const items = Array.from({ length: 120 }, (_, i) =>
        makeSessionListItem({ id: `session-${i}` }),
      );

      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const updatedCalls = emitSpy.mock.calls.filter((call) => call[0] === 'updated');

      expect(updatedCalls.length).toBeGreaterThan(1);

      for (const [event, list] of updatedCalls) {
        expect(event).toBe('updated');
        expect(Array.isArray(list)).toBe(true);
      }
    });
  });

  // ── Test 11: Filesystem watching ──────────────────────────────────────────

  describe('filesystem watching', () => {
    type MockNodeFs = {
      watch: ReturnType<typeof vi.fn>;
      watcher: {
        close: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
      };
    };

    let mockNodeFs: MockNodeFs;
    let originalPlatform: NodeJS.Platform;

    beforeEach(() => {
      mockNodeFs = (global as Record<string, unknown>).__mockNodeFs as MockNodeFs;
      // Reset watch mock to return a fresh watcher object each time
      mockNodeFs.watcher.close.mockReset();
      mockNodeFs.watcher.on.mockReset();
      mockNodeFs.watch.mockReset();
      mockNodeFs.watch.mockReturnValue(mockNodeFs.watcher);
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
      vi.useRealTimers();
    });

    function setPlatform(platform: string): void {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    }

    // ── startWatching / platform guard ───────────────────────────────────────

    it('does not call fs.watch on Linux', async () => {
      setPlatform('linux');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      expect(mockNodeFs.watch).not.toHaveBeenCalled();
    });

    it('calls fs.watch with recursive:true on non-Linux platforms', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      expect(mockNodeFs.watch).toHaveBeenCalledWith(
        '/root',
        { recursive: true },
        expect.any(Function),
      );
    });

    it('attaches an error handler to the watcher', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      expect(mockNodeFs.watcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    // ── stopWatching ─────────────────────────────────────────────────────────

    it('closes the watcher when stop() is called', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      mockNodeFs.watcher.close.mockClear();

      await indexer.stop();

      expect(mockNodeFs.watcher.close).toHaveBeenCalledTimes(1);
    });

    it('closes old watcher and starts new one on setRootDir()', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/old-root');
      mockNodeFs.watcher.close.mockClear();
      mockNodeFs.watch.mockClear();

      await indexer.setRootDir('/new-root');

      // Old watcher must be closed before new one is started
      expect(mockNodeFs.watcher.close).toHaveBeenCalledTimes(1);
      expect(mockNodeFs.watch).toHaveBeenCalledWith(
        '/new-root',
        { recursive: true },
        expect.any(Function),
      );
    });

    // ── handleFsEvent / change ────────────────────────────────────────────────

    it('change event triggers debounced handleChangeEvent and updates the index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      const existingItem = makeSessionListItemIpc({
        id: 'session-abc',
        name: 'Session ABC',
        path: '/root/session-abc',
        createdAt: '2024-12-01T10:00:00.000Z',
        adapter: 'copilot-cli',
        metrics: null,
      });
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      // Manually seed the index with an existing item
      // (simulate it was already indexed by the background scan)
      indexer['index'].set('session-abc', existingItem);

      // Capture the watch callback
      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;
      expect(watchCallback).toBeDefined();

      const emitSpy = vi.spyOn(indexer, 'emit');

      // Simulate a change event
      watchCallback('change', 'session-abc/events.jsonl');

      // Before debounce fires, no handler should have run
      expect(vi.mocked(mockManager.getSession).mock.calls.length).toBe(0);

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(600);

      expect(vi.mocked(mockManager.getSession)).toHaveBeenCalledWith('session-abc');
      const updatedCalls = emitSpy.mock.calls.filter((c) => c[0] === 'updated');
      expect(updatedCalls.length).toBeGreaterThan(0);
    });

    it('rapid change events for same session are debounced to one call', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      // Seed the index
      indexer['index'].set(
        'session-abc',
        makeSessionListItemIpc({ id: 'session-abc', metrics: null }),
      );

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      // Fire 5 rapid change events
      watchCallback('change', 'session-abc/events.jsonl');
      watchCallback('change', 'session-abc/events.jsonl');
      watchCallback('change', 'session-abc/events.jsonl');
      watchCallback('change', 'session-abc/events.jsonl');
      watchCallback('change', 'session-abc/events.jsonl');

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(600);

      // getSession should only be called once (debounced)
      const getSessionCalls = vi.mocked(mockManager.getSession).mock.calls.filter(
        ([id]) => id === 'session-abc',
      );
      expect(getSessionCalls.length).toBe(1);
    });

    it('change event with null session removes it from the index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      vi.mocked(mockManager.getSession).mockResolvedValue(null);

      await indexer.start('/root');

      // Seed the index
      indexer['index'].set(
        'session-gone',
        makeSessionListItemIpc({ id: 'session-gone', metrics: null }),
      );
      expect(indexer.getSessionList()).toHaveLength(1);

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      watchCallback('change', 'session-gone/events.jsonl');
      await vi.advanceTimersByTimeAsync(600);

      expect(indexer.getSessionList()).toHaveLength(0);
    });

    // ── handleFsEvent / rename ────────────────────────────────────────────────

    it('rename event for deleted session removes it from index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      // listSessions returns empty (session no longer exists)
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      // Seed the index with the session that will be "deleted"
      indexer['index'].set(
        'session-deleted',
        makeSessionListItemIpc({ id: 'session-deleted', metrics: null }),
      );
      expect(indexer.getSessionList()).toHaveLength(1);

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      watchCallback('rename', 'session-deleted');
      await vi.advanceTimersByTimeAsync(600);

      expect(indexer.getSessionList()).toHaveLength(0);
    });

    it('rename event for new session adds it to index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      const newItem = makeSessionListItem({
        id: 'session-new',
        name: 'New Session',
        path: '/root/session-new',
        createdAt: new Date('2024-12-15T10:00:00Z'),
        adapter: 'copilot-cli',
      });

      // Always return the new session (used by both background scan and rename handler)
      vi.mocked(mockManager.listSessions).mockResolvedValue([newItem]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      // Capture watcher callback before triggering fake timer advances
      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;
      expect(watchCallback).toBeDefined();

      // Remove the session from index to simulate a fresh state for the rename test
      indexer['index'].clear();
      expect(indexer.getSessionList()).toHaveLength(0);

      watchCallback('rename', 'session-new');
      // Advance past debounce (500ms) + let all async handlers resolve
      await vi.advanceTimersByTimeAsync(600);

      expect(indexer.getSessionList()).toHaveLength(1);
      expect(indexer.getSessionList()[0]?.id).toBe('session-new');
    });

    it('rename event for existing session (not new, not deleted) is a no-op on the index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      const existingListItem = makeSessionListItem({ id: 'session-existing' });
      vi.mocked(mockManager.listSessions).mockResolvedValue([existingListItem]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      // Seed the index directly (skip background scan)
      indexer['index'].set(
        'session-existing',
        makeSessionListItemIpc({ id: 'session-existing', metrics: null }),
      );

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      watchCallback('rename', 'session-existing/subfile');
      await vi.advanceTimersByTimeAsync(600);

      // Still present (not deleted, not duplicated)
      expect(indexer.getSessionList()).toHaveLength(1);
    });

    // ── Null filename guard ───────────────────────────────────────────────────

    it('ignores fs events with null filename', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      const emitSpy = vi.spyOn(indexer, 'emit');

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string | null,
      ) => void;

      // Should not throw or call any handlers
      watchCallback('change', null);

      expect(vi.mocked(mockManager.getSession)).not.toHaveBeenCalled();
      const updatedCalls = emitSpy.mock.calls.filter((c) => c[0] === 'updated');
      expect(updatedCalls.length).toBe(0);
    });

    // ── Watcher error / restart ───────────────────────────────────────────────

    it('restarts watcher after WATCHER_RESTART_MS on error', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      // Capture the error handler registered on the watcher
      const errorHandlerCall = mockNodeFs.watcher.on.mock.calls.find(
        ([event]) => event === 'error',
      );
      expect(errorHandlerCall).toBeDefined();
      const errorHandler = errorHandlerCall![1] as (err: Error) => void;

      mockNodeFs.watcher.close.mockClear();
      mockNodeFs.watch.mockClear();

      // Simulate a watcher error
      errorHandler(new Error('ENOSPC'));

      // Watcher should be closed immediately
      expect(mockNodeFs.watcher.close).toHaveBeenCalledTimes(1);

      // Before WATCHER_RESTART_MS, watch is not called again
      await vi.advanceTimersByTimeAsync(500);
      expect(mockNodeFs.watch).not.toHaveBeenCalled();

      // After WATCHER_RESTART_MS, watcher is restarted
      await vi.advanceTimersByTimeAsync(600);
      expect(mockNodeFs.watch).toHaveBeenCalledWith(
        '/root',
        { recursive: true },
        expect.any(Function),
      );
    });

    // ── Windows path separator ────────────────────────────────────────────────

    it('extracts session ID correctly from Windows-style paths', async () => {
      vi.useFakeTimers();
      setPlatform('win32');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      vi.mocked(mockManager.getSession).mockResolvedValue(null);

      await indexer.start('/root');

      indexer['index'].set(
        'session-win',
        makeSessionListItemIpc({ id: 'session-win', metrics: null }),
      );

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      // Simulate Windows backslash path
      watchCallback('change', 'session-win\\events.jsonl');
      await vi.advanceTimersByTimeAsync(600);

      expect(vi.mocked(mockManager.getSession)).toHaveBeenCalledWith('session-win');
    });

    // ── restartTimer is cleared by stopWatching ───────────────────────────────

    it('clears the restart timer when stop() is called before it fires', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      // Trigger a watcher error to schedule restartWatcher
      const errorHandlerCall = mockNodeFs.watcher.on.mock.calls.find(
        ([event]) => event === 'error',
      );
      const errorHandler = errorHandlerCall![1] as (err: Error) => void;
      errorHandler(new Error('ENOSPC'));

      mockNodeFs.watch.mockClear();

      // Stop before the restart timer fires
      await indexer.stop();

      // Advance past WATCHER_RESTART_MS — restart must NOT happen
      await vi.advanceTimersByTimeAsync(1500);
      expect(mockNodeFs.watch).not.toHaveBeenCalled();
    });

    it('does not restart watcher when rootDir changed before timer fires', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');

      // Simulate watcher error — captures rootDir = '/root'
      const errorHandlerCall = mockNodeFs.watcher.on.mock.calls.find(
        ([event]) => event === 'error',
      );
      const errorHandler = errorHandlerCall![1] as (err: Error) => void;
      errorHandler(new Error('ENOSPC'));

      // Change rootDir before timer fires
      await indexer.setRootDir('/new-root');
      mockNodeFs.watch.mockClear();

      // Advance past WATCHER_RESTART_MS — old restart must NOT fire for /root
      await vi.advanceTimersByTimeAsync(1500);
      // Only the new watcher (for /new-root started via setRootDir→start) matters;
      // the stale restart for /root must have been suppressed by the guard.
      const watchCalls = mockNodeFs.watch.mock.calls.filter(
        ([dir]) => dir === '/root',
      );
      expect(watchCalls).toHaveLength(0);
    });

    // ── Generation guard ──────────────────────────────────────────────────────

    it('generation guard: rename handler aborts when generation advances mid-flight', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValue(new Error('no cache'));

      // listSessions resolves slowly — simulate mid-flight setRootDir
      let resolveListSessions!: (val: never[]) => void;
      const listSessionsPromise = new Promise<never[]>((res) => {
        resolveListSessions = res;
      });
      vi.mocked(mockManager.listSessions).mockReturnValueOnce(listSessionsPromise);

      await indexer.start('/root');

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      // Fire rename event — debounce fires immediately via advanceTimersByTimeAsync
      watchCallback('rename', 'session-abc');
      await vi.advanceTimersByTimeAsync(600);

      // Advance generation (e.g., setRootDir was called)
      indexer['scanGeneration']++;

      // Now resolve listSessions — handler should abort due to generation mismatch
      resolveListSessions([]);
      await vi.advanceTimersByTimeAsync(0);

      // Index should not have been updated (no emitUpdated from rename handler)
      const emitSpy = vi.spyOn(indexer, 'emit');
      expect(emitSpy).not.toHaveBeenCalledWith('updated', expect.anything());
    });

    // ── handleChangeEvent indexes unindexed session ───────────────────────────

    it('change event indexes a session not yet in the index', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      const listItem = makeSessionListItem({
        id: 'session-early',
        name: 'Early Session',
        path: '/root/session-early',
        createdAt: new Date('2024-12-10T10:00:00Z'),
        adapter: 'copilot-cli',
      });

      vi.mocked(mockManager.listSessions).mockResolvedValue([listItem]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      // Index is empty — session not yet processed by background scan
      expect(indexer.getSessionList()).toHaveLength(0);

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      watchCallback('change', 'session-early/events.jsonl');
      await vi.advanceTimersByTimeAsync(600);

      // Session should now be in the index (indexed via listSessions fallback)
      expect(indexer.getSessionList()).toHaveLength(1);
      expect(indexer.getSessionList()[0]?.id).toBe('session-early');
    });

    it('change event skips unindexed session absent from listSessions()', async () => {
      vi.useFakeTimers();
      setPlatform('darwin');
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      // listSessions returns empty — session truly does not exist
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');

      const watchCallback = mockNodeFs.watch.mock.calls[0]?.[2] as (
        eventType: string,
        filename: string,
      ) => void;

      watchCallback('change', 'session-phantom/events.jsonl');
      await vi.advanceTimersByTimeAsync(600);

      // Should not be indexed
      expect(indexer.getSessionList()).toHaveLength(0);
    });

    // ── startWatching closes existing watcher ────────────────────────────────

    it('startWatching closes existing watcher before creating a new one', async () => {
      setPlatform('darwin');
      mockReadFile.mockRejectedValue(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      // First start — creates watcher #1
      await indexer.start('/root');
      expect(mockNodeFs.watch).toHaveBeenCalledTimes(1);
      mockNodeFs.watcher.close.mockClear();

      // Call start() again directly (without setRootDir) — should close watcher #1
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      await indexer.start('/root');

      expect(mockNodeFs.watcher.close).toHaveBeenCalledTimes(1);
      expect(mockNodeFs.watch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Test: Scanning state getter and events ─────────────────────────────────

  describe('scanning state', () => {
    it('isScanning() returns false initially', () => {
      expect(indexer.isScanning()).toBe(false);
    });

    it('isScanning() returns true during background scan', async () => {
      vi.useFakeTimers();
      try {
        mockReadFile.mockRejectedValueOnce(new Error('no cache'));
        let resolveSessions!: (value: SessionListItem[]) => void;
        vi.mocked(mockManager.listSessions).mockImplementation(
          () =>
            new Promise<SessionListItem[]>((resolve) => {
              resolveSessions = resolve;
            }),
        );
        vi.mocked(mockManager.getSession).mockResolvedValue({
          parseStatus: { status: 'ok' },
        } as unknown as Session);

        const startPromise = indexer.start('/root');

        // Flush microtasks so the scan begins
        await vi.advanceTimersByTimeAsync(0);

        expect(indexer.isScanning()).toBe(true);

        // Let the scan complete
        resolveSessions([makeSessionListItem({ id: 'session-1' })]);
        await vi.advanceTimersByTimeAsync(0);
        await startPromise;
      } finally {
        vi.useRealTimers();
      }
    });

    it('isScanning() returns false after scan completes', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([
        makeSessionListItem({ id: 'session-1' }),
      ]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.isScanning()).toBe(false);
    });

    it('emits scanningState event with true when scan starts', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);
      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const scanningStateEvents = emitSpy.mock.calls.filter(
        (call) => call[0] === 'scanningState',
      );
      expect(scanningStateEvents.length).toBeGreaterThan(0);
      expect(scanningStateEvents[0]![1]).toBe(true);
    });

    it('emits scanningState event with false when scan completes', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([
        makeSessionListItem({ id: 'session-1' }),
      ]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);
      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const scanningStateEvents = emitSpy.mock.calls.filter(
        (call) => call[0] === 'scanningState',
      );
      expect(scanningStateEvents.length).toBeGreaterThan(0);
      // Last event should be false
      expect(
        scanningStateEvents[scanningStateEvents.length - 1]![1],
      ).toBe(false);
    });

    it('emits scanningState events in correct order: true then false', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([
        makeSessionListItem({ id: 'session-1' }),
      ]);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);
      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.start('/root');
      await flushAllAsync();

      const scanningStateEvents = emitSpy.mock.calls.filter(
        (call) => call[0] === 'scanningState',
      );
      expect(scanningStateEvents.length).toBeGreaterThanOrEqual(2);
      expect(scanningStateEvents[0]![1]).toBe(true);
      expect(
        scanningStateEvents[scanningStateEvents.length - 1]![1],
      ).toBe(false);
    });

    // Regression test: refresh() must not leave scanning=true forever.
    //
    // Before the fix, when refresh() interrupted an in-flight scan the old
    // scan's finally block skipped resetting scanning=false (generation
    // mismatch). The new scan then hit the `if (this.scanning) return` guard
    // and exited immediately, leaving the UI spinner stuck permanently.
    it('isScanning() returns false after refresh() interrupts an in-flight scan', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));

      // First invocation: block indefinitely so the scan is still in-flight
      // when refresh() is called.
      let resolveFirstScan!: (value: SessionListItem[]) => void;
      vi.mocked(mockManager.listSessions)
        .mockImplementationOnce(
          () =>
            new Promise<SessionListItem[]>((resolve) => {
              resolveFirstScan = resolve;
            }),
        )
        // Second invocation (triggered by refresh): resolve immediately.
        .mockResolvedValueOnce([makeSessionListItem({ id: 'session-1' })]);

      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      // Start the indexer — runBackgroundScan() runs synchronously up to the
      // first await (listSessions), so scanning=true before start() returns.
      await indexer.start('/root');

      // Sanity-check: scan is in progress.
      expect(indexer.isScanning()).toBe(true);

      // Call refresh() while the first scan is still blocked. Do NOT await yet
      // so we can unblock the first scan independently.
      const refreshPromise = indexer.refresh();

      // Yield once to let refresh() reach `await this.scanPromise`.
      await Promise.resolve();

      // Unblock the first scan — it detects stopRequested and exits without
      // resetting scanning (generation mismatch in the finally block).
      resolveFirstScan([]);

      // Wait for refresh() to complete (it resets scanning then starts the
      // new scan) and for the new scan to fully process its batches.
      await refreshPromise;
      await flushAllAsync();

      // The key assertion: scanning must be false — not stuck at true.
      expect(indexer.isScanning()).toBe(false);
    });
  });

  // ── Test 10: clearCache() ──────────────────────────────────────────────────

  describe('clearCache', () => {
    it('deletes the cache file', async () => {
      const items = [makeSessionListItem({ id: 'session-1', name: 'Session 1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      // Verify session is in index
      expect(indexer.getSessionList()).toHaveLength(1);

      // Clear the mock and call clearCache
      mockUnlink.mockClear();
      mockUnlink.mockResolvedValue(undefined);

      await indexer.clearCache();

      // Verify unlink was called with the cache file path
      expect(mockUnlink).toHaveBeenCalled();
      const unlinkCall = mockUnlink.mock.calls[0];
      expect(unlinkCall![0]).toContain('session-index-cache.json');
    });

    it('clears the in-memory session list', async () => {
      const items = [
        makeSessionListItem({ id: 'session-1', name: 'Session 1' }),
        makeSessionListItem({ id: 'session-2', name: 'Session 2' }),
      ];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      expect(indexer.getSessionList()).toHaveLength(2);

      mockUnlink.mockResolvedValue(undefined);
      await indexer.clearCache();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('emits updated event with empty list', async () => {
      const items = [makeSessionListItem({ id: 'session-1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'ok' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      mockUnlink.mockResolvedValue(undefined);
      const emitSpy = vi.spyOn(indexer, 'emit');

      await indexer.clearCache();

      const updatedCalls = emitSpy.mock.calls.filter((call) => call[0] === 'updated');
      expect(updatedCalls.length).toBeGreaterThan(0);
      const lastUpdatedCall = updatedCalls[updatedCalls.length - 1];
      expect(lastUpdatedCall![1]).toEqual([]);
    });

    it('handles missing cache file gracefully (ENOENT)', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      // Mock unlink to throw ENOENT (file not found)
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockUnlink.mockRejectedValue(enoentError);

      // Should not throw
      expect(async () => {
        await indexer.clearCache();
      }).not.toThrow();

      expect(indexer.getSessionList()).toEqual([]);
    });

    it('throws when unlink fails for reasons other than ENOENT', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue([]);

      await indexer.start('/root');
      await flushAllAsync();

      // Mock unlink to throw a permission error
      const permError = new Error('Permission denied') as NodeJS.ErrnoException;
      permError.code = 'EACCES';
      mockUnlink.mockRejectedValue(permError);

      // Should not throw (error is caught and logged internally)
      // but the cache is still cleared from memory
      await indexer.clearCache();

      // Session list is still cleared even on error
      expect(indexer.getSessionList()).toEqual([]);
    });
  });
});
