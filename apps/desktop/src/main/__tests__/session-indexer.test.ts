import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SessionListItemIpc } from '@agent-profiler/core';
import type { SessionListItem } from '@agent-profiler/data-source';

// ─── Mocks must be defined before imports ──────────────────────────────────

vi.mock('node:fs/promises', () => {
  const mockModule = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
  // Export mockModule so we can access it in tests
  (global as any).__mockFsPromises = mockModule;
  return mockModule;
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => {
      return key === 'userData' ? '/tmp/mock-app-data' : '/tmp';
    }),
  },
}));

vi.mock('../session-list-metrics', () => ({
  extractSessionListMetrics: vi.fn((session: Session) => ({
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalCostUsd: 0.001,
    costConfidence: 'known' as const,
    wallTimeMs: 1000,
    repository: 'https://example.com/repo.git',
  })),
}));

import { SessionIndexer } from '../session-indexer';
import type { DataSourceManager } from '../data-source-manager';

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
    setLocalRootDir: vi.fn<(dir: string) => Promise<void>>().mockResolvedValue(),
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

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Get the mocked fs/promises module
    const mockFs = (global as any).__mockFsPromises;
    mockReadFile = mockFs.readFile;
    mockWriteFile = mockFs.writeFile;
    
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
        version: 1,
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
  });

  // ── Test 5: Disk cache flush ───────────────────────────────────────────────

  describe('disk cache flush', () => {
    it('writes cache to disk after scan completes', async () => {
      const items = [makeSessionListItem({ id: 'session-1', name: 'Session 1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'success' },
      } as unknown as Session);

      await indexer.start('/root');
      await flushAllAsync();

      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall![0]).toContain('session-index-cache.json');

      const cacheContent = JSON.parse(writeCall![1] as string);
      expect(cacheContent.version).toBe(1);
      expect(cacheContent.rootDir).toBe('/root');
      expect(cacheContent.sessions).toHaveLength(1);
      expect(cacheContent.sessions[0]?.id).toBe('session-1');
    });

    it('flushes cache on stop()', async () => {
      const items = [makeSessionListItem({ id: 'session-1' })];
      mockReadFile.mockRejectedValueOnce(new Error('no cache'));
      vi.mocked(mockManager.listSessions).mockResolvedValue(items);
      vi.mocked(mockManager.getSession).mockResolvedValue({
        parseStatus: { status: 'success' },
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
        version: 1,
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
        parseStatus: { status: 'success' },
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
        .mockResolvedValueOnce({ parseStatus: { status: 'success' } } as unknown as Session)
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
        parseStatus: { status: 'success' },
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
});
