import { LogsQueryClient } from '@azure/monitor-query-logs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QueryClient, DEFAULT_MAX_SPAN_COUNT } from '../src/query-client';
import {
  AuthenticationError,
  WorkspaceNotFoundError,
  QueryTimeoutError,
  AppInsightsError,
} from '../src/types';
import type { TimeRange } from '../src/types';

// Mock Azure SDK modules — vi.mock calls are hoisted by vitest.
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock('@azure/monitor-query-logs', () => ({
  LogsQueryClient: vi.fn().mockImplementation(() => ({
    queryWorkspace: vi.fn(),
  })),
  LogsQueryResultStatus: {
    Success: 'Success',
    PartialFailure: 'PartialFailure',
    Failure: 'Failure',
  },
}));

const TEST_WORKSPACE_ID = 'test-workspace-id';
const TEST_TIME_RANGE: TimeRange = {
  startTime: new Date('2024-01-01T00:00:00Z'),
  endTime: new Date('2024-01-02T00:00:00Z'),
};

describe('QueryClient', () => {
  let mockQueryWorkspace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryWorkspace = vi.fn();
    vi.mocked(LogsQueryClient).mockImplementation(
      () =>
        ({
          queryWorkspace: mockQueryWorkspace,
        }) as unknown as InstanceType<typeof LogsQueryClient>,
    );
  });

  it('returns typed rows on successful query', async () => {
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'int' },
          ],
          rows: [
            ['alice', 42],
            ['bob', 7],
          ],
        },
      ],
    });

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });
    const result = await client.query('TestQuery', TEST_TIME_RANGE);

    expect(result.rows).toEqual([
      { name: 'alice', value: 42 },
      { name: 'bob', value: 7 },
    ]);
  });

  it('returns rows from partialTables on partial failure', async () => {
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'PartialFailure',
      partialTables: [
        {
          columnDescriptors: [
            { name: 'ts', type: 'datetime' },
            { name: 'msg', type: 'string' },
          ],
          rows: [['2024-01-01T00:00:00Z', 'partial result row']],
        },
      ],
      partialError: { message: 'Query returned partial results' },
    });

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });
    const result = await client.query('TestQuery', TEST_TIME_RANGE);

    expect(result.rows).toEqual([
      { ts: '2024-01-01T00:00:00Z', msg: 'partial result row' },
    ]);
  });

  it('throws AuthenticationError on credential failure', async () => {
    const authError = new Error(
      'DefaultAzureCredential authentication failed',
    );
    authError.name = 'CredentialUnavailableError';
    mockQueryWorkspace.mockRejectedValueOnce(authError);

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });

    await expect(
      client.query('TestQuery', TEST_TIME_RANGE),
    ).rejects.toThrow(AuthenticationError);
  });

  it('throws WorkspaceNotFoundError when workspace is missing', async () => {
    const wsError = new Error('workspace not found');
    mockQueryWorkspace.mockRejectedValueOnce(wsError);

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });

    await expect(
      client.query('TestQuery', TEST_TIME_RANGE),
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('throws QueryTimeoutError on timeout', async () => {
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'AbortError';
    mockQueryWorkspace.mockRejectedValueOnce(timeoutError);

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });

    await expect(
      client.query('TestQuery', TEST_TIME_RANGE),
    ).rejects.toThrow(QueryTimeoutError);
  });

  it('testConnection returns true on success', async () => {
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [{ name: 'connected', type: 'bool' }],
          rows: [[true]],
        },
      ],
    });

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });
    const result = await client.testConnection();

    expect(result).toBe(true);
  });

  it('testConnection returns false on failure', async () => {
    mockQueryWorkspace.mockRejectedValueOnce(new Error('connection failed'));

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });
    const result = await client.testConnection();

    expect(result).toBe(false);
  });

  it('maps unknown errors to AppInsightsError', async () => {
    mockQueryWorkspace.mockRejectedValueOnce(
      new Error('something unexpected'),
    );

    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });

    await expect(
      client.query('TestQuery', TEST_TIME_RANGE),
    ).rejects.toThrow(AppInsightsError);
  });

  it('accepts a custom TokenCredential', () => {
    const customCredential = {
      getToken: vi.fn(),
    };
    // Should not throw when a custom credential is provided.
    const client = new QueryClient({
      workspaceId: TEST_WORKSPACE_ID,
      credential: customCredential as never,
    });
    expect(client).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // maxSpanCount
  // -----------------------------------------------------------------------

  it('defaults maxSpanCount to DEFAULT_MAX_SPAN_COUNT (10_000)', () => {
    expect(DEFAULT_MAX_SPAN_COUNT).toBe(10_000);
  });

  it('uses default maxSpanCount when not configured', async () => {
    // Verify the default is applied by creating a client without explicit maxSpanCount
    // and checking that fewer rows than the default are not flagged as truncated.
    const rows = Array.from({ length: 5 }, (_, i) => [`row-${i}`]);
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [{ name: 'id', type: 'string' }],
          rows,
        },
      ],
    });

    // Client with no explicit maxSpanCount — should use DEFAULT_MAX_SPAN_COUNT (10_000)
    const client = new QueryClient({ workspaceId: TEST_WORKSPACE_ID });
    const result = await client.queryWithTruncationCheck('TestQuery', TEST_TIME_RANGE);

    // 5 rows is well below the 10_000 default, so should not be truncated
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(5);
  });

  it('respects custom maxSpanCount from config', async () => {
    // Create 5 rows — at the custom limit of 5
    const rows = Array.from({ length: 5 }, (_, i) => [`row-${i}`, i]);
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [
            { name: 'name', type: 'string' },
            { name: 'value', type: 'int' },
          ],
          rows,
        },
      ],
    });

    const client = new QueryClient({
      workspaceId: TEST_WORKSPACE_ID,
      maxSpanCount: 5,
    });

    const result = await client.queryWithTruncationCheck('TestQuery', TEST_TIME_RANGE);

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(5);
  });

  // -----------------------------------------------------------------------
  // queryWithTruncationCheck
  // -----------------------------------------------------------------------

  it('queryWithTruncationCheck returns truncated: false when rows < maxSpanCount', async () => {
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [{ name: 'id', type: 'string' }],
          rows: [['a'], ['b']],
        },
      ],
    });

    const client = new QueryClient({
      workspaceId: TEST_WORKSPACE_ID,
      maxSpanCount: 100,
    });

    const result = await client.queryWithTruncationCheck('TestQuery', TEST_TIME_RANGE);

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it('queryWithTruncationCheck returns truncated: true when rows >= maxSpanCount', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => [`item-${i}`]);
    mockQueryWorkspace.mockResolvedValueOnce({
      status: 'Success',
      tables: [
        {
          columnDescriptors: [{ name: 'id', type: 'string' }],
          rows,
        },
      ],
    });

    const client = new QueryClient({
      workspaceId: TEST_WORKSPACE_ID,
      maxSpanCount: 3,
    });

    const result = await client.queryWithTruncationCheck('TestQuery', TEST_TIME_RANGE);

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(3);
  });
});
