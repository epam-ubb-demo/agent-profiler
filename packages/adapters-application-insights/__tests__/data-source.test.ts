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
  })),
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
} {
  return vi.mocked(MockedQueryClient).mock.results[0]!
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
  });

  // -----------------------------------------------------------------------
  // getSession
  // -----------------------------------------------------------------------
  describe('getSession', () => {
    it('returns Session from assembleSession when spans found', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({ rows: mockSpanRows });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      const session = await ds.getSession('session-abc-123');

      expect(session).toBe(FAKE_SESSION);
      expect(mockedAssembleSession).toHaveBeenCalledWith(mockSpanRows);
    });

    it('returns null when query returns no rows', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({ rows: [] });

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
      expect(mockedAssembleSession).not.toHaveBeenCalled();
    });

    it('returns null when query throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockRejectedValueOnce(new Error('query failed'));

      await expect(ds.getSession('session-abc-123')).resolves.toBeNull();
    });

    it('returns null when assembleSession throws', async () => {
      const ds = createDataSource();
      const mock = getMockInstance();
      mock.query.mockResolvedValueOnce({ rows: mockSpanRows });
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
      expect(mock.query).not.toHaveBeenCalled();
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
      mock.query.mockResolvedValueOnce({ rows: mockSpanRows });
      vi.mocked(mockedAssembleSession).mockReturnValueOnce(FAKE_SESSION);

      await ds.getSession('session-abc-123');

      expect(mockCache.set).toHaveBeenCalledWith(
        'session-abc-123',
        FAKE_SESSION,
      );
    });
  });
});
