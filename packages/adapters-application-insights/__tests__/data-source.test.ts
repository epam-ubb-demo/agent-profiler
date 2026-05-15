import type { Session } from '@agent-profiler/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApplicationInsightsDataSource } from '../src/data-source';
import type { SessionCache } from '../src/data-source';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../src/query-client', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn(),
    query: vi.fn(),
    queryWithTruncationCheck: vi.fn(),
  })),
  DEFAULT_MAX_SPAN_COUNT: 10_000,
}));

vi.mock('../src/session-assembler', () => ({
  assembleSession: vi.fn(),
}));

// Re-import after mock to pick up the mocked module.
const { QueryClient: MockedQueryClient } = await import('../src/query-client');
const { assembleSession: mockedAssembleSession } = await import(
  '../src/session-assembler'
);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_WORKSPACE_ID = 'test-workspace-id';

const mockListRows = [
  {
    sessionId: 'session-abc-123',
    startTs: '2024-06-15T10:00:00Z',
    endTs: '2024-06-15T10:30:00Z',
    spanCount: 42,
    selectedModel: 'claude-sonnet-4-20250514',
  },
];

const mockSpanRows = [
  {
    id: 'span-1',
    operation_Id: 'session-abc-123',
    operation_ParentId: null,
    name: 'chat',
    timestamp: '2024-06-15T10:00:00Z',
    duration: 5000,
    success: true,
    customDimensions: '{}',
  },
];

const FAKE_SESSION = {
  sessionId: 'session-abc-123',
  turns: [],
} as unknown as Session;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDataSource(cache?: SessionCache | undefined) {
  return new ApplicationInsightsDataSource({
    workspaceId: TEST_WORKSPACE_ID,
    cache,
  });
}

function getMockInstance(): {
  testConnection: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  queryWithTruncationCheck: ReturnType<typeof vi.fn>;
} {
  const mock = vi.mocked(MockedQueryClient).mock;
  return mock.results[mock.results.length - 1]!
    .value as unknown as ReturnType<typeof getMockInstance>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApplicationInsightsDataSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // type property
  // -----------------------------------------------------------------------
  describe('type property', () => {
    it('returns application-insights', () => {
      const ds = createDataSource();
      expect(ds.type).toBe('application-insights');
    });
  });

  // -----------------------------------------------------------------------
  // isAvailable
  // -----------------------------------------------------------------------
  describe('isAvailable', () => {
    it('returns true when testConnection succeeds', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.testConnection.mockResolvedValueOnce(true);

      await expect(ds.isAvailable()).resolves.toBe(true);
    });

    it('returns false when testConnection returns false', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.testConnection.mockResolvedValueOnce(false);

      await expect(ds.isAvailable()).resolves.toBe(false);
    });

    it('returns false when testConnection throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.testConnection.mockRejectedValueOnce(new Error('network error'));

      await expect(ds.isAvailable()).resolves.toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // listSessions
  // -----------------------------------------------------------------------
  describe('listSessions', () => {
    it('returns mapped SessionListItem[] from query results', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({ rows: mockListRows });

      const items = await ds.listSessions();

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        id: 'session-abc-123',
        name: 'session-abc-123',
        path: `ai://${TEST_WORKSPACE_ID}/session-abc-123`,
        createdAt: new Date('2024-06-15T10:00:00Z'),
        adapter: 'application-insights',
      });
    });

    it('returns empty array when query returns no rows', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({ rows: [] });

      await expect(ds.listSessions()).resolves.toEqual([]);
    });

    it('returns empty array when query throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockRejectedValueOnce(new Error('query failed'));

      await expect(ds.listSessions()).resolves.toEqual([]);
    });

    it('filters out rows with empty sessionId', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({
        rows: [
          { sessionId: '', startTs: '2024-06-15T10:00:00Z', spanCount: 5, selectedModel: 'gpt-4' },
          { sessionId: 'valid-session', startTs: '2024-06-15T11:00:00Z', spanCount: 10, selectedModel: 'gpt-4' },
        ],
      });

      const items = await ds.listSessions();
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe('valid-session');
    });

    it('handles Date objects from Azure SDK in startTs', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      const dateObj = new Date('2024-06-15T10:00:00Z');
      mock.query.mockResolvedValueOnce({
        rows: [{ sessionId: 'session-1', startTs: dateObj, spanCount: 5, selectedModel: 'gpt-4' }],
      });

      const items = await ds.listSessions();
      expect(items).toHaveLength(1);
      expect(items[0]!.createdAt).toEqual(dateObj);
    });

    it('filters out rows with invalid startTs instead of falling back to epoch', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({
        rows: [
          { sessionId: 'bad-ts', startTs: 'not-a-date', spanCount: 5, selectedModel: 'gpt-4' },
          { sessionId: 'good-ts', startTs: '2024-06-15T10:00:00Z', spanCount: 10, selectedModel: 'gpt-4' },
        ],
      });

      const items = await ds.listSessions();
      expect(items).toHaveLength(1);
      expect(items[0]!.id).toBe('good-ts');
    });
  });

  // -----------------------------------------------------------------------
  // getSession
  // -----------------------------------------------------------------------
  describe('getSession', () => {
    it('returns Session from assembleSession when spans found', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      const session = await ds.getSession('session-abc-123');

      expect(session).toBe(FAKE_SESSION);
      expect(mockedAssembleSession).toHaveBeenCalledWith(mockSpanRows);
    });

    it('returns null when copilot spans and enrichment both return no rows', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [] });

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
      expect(mockedAssembleSession).not.toHaveBeenCalled();
    });

    it('returns null when query throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockRejectedValueOnce(new Error('query failed'));

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
    });

    it('returns null when assembleSession throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockImplementationOnce(() => {
        throw new Error('assembly failed');
      });

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
    });

    it('returns null for invalid session ID', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      // Session ID with KQL injection attempt
      await expect(ds.getSession('"; drop table spans; //')).resolves.toBeNull();
      // Empty session ID
      await expect(ds.getSession('')).resolves.toBeNull();
      // getMockInstance query should NOT have been called for invalid IDs
      expect(mock.queryWithTruncationCheck).not.toHaveBeenCalled();
    });

    it('returns cached session when cache has entry', async () => {
      const mockCache: SessionCache = {
        get: vi.fn().mockReturnValue(FAKE_SESSION),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const ds = createDataSource(mockCache);
      const mock = getMockInstance();

      const session = await ds.getSession('session-abc-123');

      expect(session).toBe(FAKE_SESSION);
      expect(mockCache.get).toHaveBeenCalledWith('session-abc-123');
      expect(mock.query).not.toHaveBeenCalled();
      expect(mock.queryWithTruncationCheck).not.toHaveBeenCalled();
    });

    it('falls through to live query when cache.get() throws', async () => {
      const mockCache: SessionCache = {
        get: vi.fn().mockImplementation(() => {
          throw new Error('cache read failed');
        }),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const ds = createDataSource(mockCache);
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      const session = await ds.getSession('session-abc-123');

      expect(session).toBe(FAKE_SESSION);
      expect(mockCache.get).toHaveBeenCalledWith('session-abc-123');
      expect(mock.queryWithTruncationCheck).toHaveBeenCalled();
    });

    it('stores session in cache after successful query', async () => {
      const mockCache: SessionCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const ds = createDataSource(mockCache);
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      await ds.getSession('session-abc-123');

      expect(mockCache.set).toHaveBeenCalledWith(
        'session-abc-123',
        FAKE_SESSION,
      );
    });

    it('returns assembled session even when cache.set() throws', async () => {
      const mockCache: SessionCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn().mockImplementation(() => {
          throw new Error('cache write failed');
        }),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const ds = createDataSource(mockCache);
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      const session = await ds.getSession('session-abc-123');

      expect(session).toBe(FAKE_SESSION);
      expect(mockCache.set).toHaveBeenCalledWith(
        'session-abc-123',
        FAKE_SESSION,
      );
    });

    it('returns null for session IDs exceeding max length', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      const longId = 'a'.repeat(257);

      await expect(ds.getSession(longId)).resolves.toBeNull();
      expect(mock.queryWithTruncationCheck).not.toHaveBeenCalled();
    });

    it('sets parseStatus to partial when row count >= maxSpanCount (truncation)', async () => {
      // Create a data source with a very small maxSpanCount
      const ds = new ApplicationInsightsDataSource({
        workspaceId: TEST_WORKSPACE_ID,
        maxSpanCount: 2,
      });
      const mock = getMockInstance();
      // Return exactly 2 rows (= maxSpanCount), triggering truncation
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [mockSpanRows[0], mockSpanRows[0]], truncated: true });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce({
        ...FAKE_SESSION,
        parseStatus: { status: 'ok', error: null },
      });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('partial');
      expect(session!.parseStatus.error).toContain('truncated');
      expect(session!.parseStatus.error).toContain('2 spans');
    });

    it('appends truncation warning to existing non-ok parseStatus', async () => {
      const mockSession = {
        ...FAKE_SESSION,
        parseStatus: { status: 'partial' as const, error: '3/5 spans have missing parents' },
      } as unknown as Session;

      const ds = new ApplicationInsightsDataSource({
        workspaceId: TEST_WORKSPACE_ID,
        maxSpanCount: 5,
      });
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({
        rows: Array.from({ length: 5 }, () => ({})),
        truncated: true,
      });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(mockSession);

      const session = await ds.getSession('sess-001');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('partial');
      // Should preserve original error AND append truncation note
      expect(session!.parseStatus.error).toContain('3/5 spans have missing parents');
      expect(session!.parseStatus.error).toContain('truncated at 5 spans');
    });

    it('does not override parseStatus when row count < maxSpanCount', async () => {
      const ds = new ApplicationInsightsDataSource({
        workspaceId: TEST_WORKSPACE_ID,
        maxSpanCount: 100,
      });
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce({
        ...FAKE_SESSION,
        parseStatus: { status: 'ok', error: null },
      });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('ok');
    });

    it('uses DEFAULT_MAX_SPAN_COUNT when maxSpanCount is not specified', async () => {
      // Default is 10_000, so with 1 row it should not trigger truncation
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: mockSpanRows, truncated: false });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce({
        ...FAKE_SESSION,
        parseStatus: { status: 'ok', error: null },
      });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('ok');
    });

  });

  // -----------------------------------------------------------------------
  // getSession – enrichment fallback
  // -----------------------------------------------------------------------
  describe('getSession enrichment fallback', () => {
    const ENRICHMENT_META = JSON.stringify({
      copilotVersion: '1.0.0',
      selectedModel: 'claude-opus-4',
      reasoningEffort: 'medium',
      repository: 'owner/repo',
      branch: 'main',
      cwd: '/home/user/project',
      startTs: '2024-06-15T10:00:00Z',
      endTs: '2024-06-15T10:30:00Z',
      success: true,
      parseStatus: null,
      shutdown: null,
      modelChanges: [],
    });

    const mockEnrichmentMetaRow = {
      timestamp: new Date('2024-06-15T10:00:00Z'),
      category: 'metadata',
      message: ENRICHMENT_META,
    };

    it('falls back to enrichment query when no copilot spans found', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [mockEnrichmentMetaRow] });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      // enrichment fallback should not use assembleSession
      expect(mockedAssembleSession).not.toHaveBeenCalled();
      expect(mock.query).toHaveBeenCalled();
    });

    it('enrichment session contains sessionId and selectedModel', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [mockEnrichmentMetaRow] });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('session-abc-123');
      expect(session!.selectedModel).toBe('claude-opus-4');
    });

    it('enrichment session defaults parseStatus to partial when metadata has no parseStatus', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [mockEnrichmentMetaRow] });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('partial');
    });

    it('enrichment session preserves ok parseStatus from metadata', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      const metaWithOkStatus = JSON.stringify({
        ...JSON.parse(ENRICHMENT_META) as Record<string, unknown>,
        parseStatus: { status: 'ok', error: null },
      });
      mock.query.mockResolvedValueOnce({
        rows: [{ ...mockEnrichmentMetaRow, message: metaWithOkStatus }],
      });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.parseStatus.status).toBe('ok');
    });

    it('returns null when both copilot and enrichment queries return no rows', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [] });

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
    });

    it('caches enrichment session after assembly', async () => {
      const mockCache: SessionCache = {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
      };
      const ds = createDataSource(mockCache);
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [mockEnrichmentMetaRow] });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(mockCache.set).toHaveBeenCalledWith('session-abc-123', session);
    });

    it('enrichment session includes empty turns arrays', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      mock.query.mockResolvedValueOnce({ rows: [mockEnrichmentMetaRow] });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.turns).toEqual([]);
      expect(session!.fanoutTurns).toEqual([]);
    });

    it('enrichment session includes utilisation rows from AppTraces', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.queryWithTruncationCheck.mockResolvedValueOnce({ rows: [], truncated: false });
      const utilisationPayload = JSON.stringify({
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalCacheReadTokens: 10,
        totalCacheWriteTokens: 5,
        totalCostUsd: 0.01,
        costConfidence: 'known',
        wallTimeMs: 5000,
        modelUsage: [],
      });
      mock.query.mockResolvedValueOnce({
        rows: [
          mockEnrichmentMetaRow,
          { timestamp: new Date('2024-06-15T10:15:00Z'), category: 'utilisation', message: utilisationPayload },
        ],
      });

      const session = await ds.getSession('session-abc-123');

      expect(session).not.toBeNull();
      expect(session!.utilisation).toHaveLength(1);
    });

  });
});
