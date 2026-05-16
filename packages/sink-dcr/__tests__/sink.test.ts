/**
 * Unit tests for DcrEnrichmentSink.
 */

import { RetriableSinkError } from '@agent-profiler/enrichment-core';
import { createTestEvent } from '@agent-profiler/enrichment-core/testing';
import { LogsIngestionClient } from '@azure/monitor-ingestion';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DcrEnrichmentSink } from '../src/sink.js';

// Mock Azure SDK modules before importing the module under test.
// vi.mock calls are hoisted to the top of the file by Vitest.
vi.mock('@azure/monitor-ingestion');
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue({ token: 'test-token', expiresOnTimestamp: 9_999_999 }),
  })),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  endpoint: 'https://dce-test.eastus-1.ingest.monitor.azure.com',
  ruleId: 'dcr-abc123',
  streamName: 'Custom-AgentSessionEvents_CL',
} as const;

let mockUpload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpload = vi.fn().mockResolvedValue(undefined);
  vi.mocked(LogsIngestionClient).mockImplementation(
    () => ({ upload: mockUpload }) as unknown as LogsIngestionClient,
  );
});

function makeSink(overrides?: Partial<ConstructorParameters<typeof DcrEnrichmentSink>[0]>) {
  return new DcrEnrichmentSink({ ...TEST_CONFIG, ...overrides });
}

// ---------------------------------------------------------------------------
// Constructor defaults
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — constructor defaults', () => {
  it('uses "dcr" as the default id', () => {
    const sink = makeSink();
    expect(sink.id).toBe('dcr');
  });

  it('accepts a custom id', () => {
    const sink = makeSink({ id: 'my-dcr-sink' });
    expect(sink.id).toBe('my-dcr-sink');
  });

  it('defaults supportedCategories to wildcard (*)', () => {
    const sink = makeSink();
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(true);
    expect(sink.supportsCategory('anything-at-all')).toBe(true);
  });

  it('accepts explicit supportedCategories', () => {
    const sink = makeSink({ supportedCategories: ['metadata', 'utilisation'] });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(true);
    expect(sink.supportsCategory('compaction')).toBe(false);
  });

  it('creates a LogsIngestionClient with the provided endpoint', () => {
    makeSink();
    expect(vi.mocked(LogsIngestionClient)).toHaveBeenCalledWith(
      TEST_CONFIG.endpoint,
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// availability()
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — availability()', () => {
  it('returns true unconditionally', async () => {
    const sink = makeSink();
    const result = await sink.availability();
    expect(result).toBe(true);
  });

  it('never calls the SDK upload during availability check', async () => {
    const sink = makeSink();
    await sink.availability();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// supportsCategory()
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — supportsCategory()', () => {
  it('returns true for any category when wildcard is used (default)', () => {
    const sink = makeSink();
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('unknown-category')).toBe(true);
    expect(sink.supportsCategory('')).toBe(true);
  });

  it('returns true for any category when ["*"] is explicitly set', () => {
    const sink = makeSink({ supportedCategories: ['*'] });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('anything')).toBe(true);
  });

  it('returns true only for listed categories when no wildcard', () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(false);
  });

  it('"*" as a query does not match unless wildcard is in the list', () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    expect(sink.supportsCategory('*')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// push() — happy paths
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — push() happy paths', () => {
  it('returns empty result for an empty batch without calling upload', async () => {
    const sink = makeSink();
    const result = await sink.push([]);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns all ordinals as accepted on a successful upload', async () => {
    const sink = makeSink();
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 2),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toEqual([0, 1, 2]);
    expect(result.rejected).toHaveLength(0);
  });

  it('calls upload with the correct ruleId and streamName', async () => {
    const sink = makeSink();
    await sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]);

    expect(mockUpload).toHaveBeenCalledWith(
      TEST_CONFIG.ruleId,
      TEST_CONFIG.streamName,
      expect.any(Array),
    );
  });

  it('calls upload exactly once per push', async () => {
    const sink = makeSink();
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    await sink.push(events);

    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it('passes correctly mapped rows to upload (EventId, SessionId, Category, Payload)', async () => {
    const sink = makeSink();
    const event = createTestEvent('copilot-cli', 'session-xy', 'metadata', 0, { x: 42 });

    await sink.push([event]);

    const rows = mockUpload.mock.calls[0]?.[2] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row['EventId']).toBe(event.eventId);
    expect(row['SessionId']).toBe(event.sessionId);
    expect(row['Category']).toBe(event.category);
    expect(row['Payload']).toBe(JSON.stringify(event.payload));
    // Payload must be a JSON string, NOT an object
    expect(typeof row['Payload']).toBe('string');
  });

  it('is idempotent — pushing the same batch twice yields the same acceptedOrdinals', async () => {
    const sink = makeSink();
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    const first = await sink.push(events);
    const second = await sink.push(events);

    expect(first.acceptedOrdinals).toEqual(second.acceptedOrdinals);
  });
});

// ---------------------------------------------------------------------------
// push() — category filtering
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — push() category filtering', () => {
  it('rejects events with unsupported categories', async () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 1),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toEqual([0]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.ordinal).toBe(1);
    expect(result.rejected[0]!.reason).toMatch(/Unsupported category: utilisation/);
  });

  it('does not call upload when all categories are unsupported', async () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    await sink.push([createTestEvent('copilot-cli', 'session-1', 'utilisation', 0)]);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns no acceptedOrdinals when all categories are unsupported', async () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    const result = await sink.push([
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 0),
      createTestEvent('copilot-cli', 'session-1', 'compaction', 1),
    ]);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('splits a mixed batch: supported accepted, unsupported rejected', async () => {
    const sink = makeSink({ supportedCategories: ['metadata'] });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 1),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 2),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toEqual([0, 2]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.ordinal).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// push() — error handling
// ---------------------------------------------------------------------------

describe('DcrEnrichmentSink — push() non-retriable errors', () => {
  it('returns all supported events as rejected on a generic Error', async () => {
    mockUpload.mockRejectedValue(new Error('network timeout'));
    const sink = makeSink();
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]!.reason).toBe('network timeout');
    expect(result.rejected[1]!.reason).toBe('network timeout');
  });

  it('uses String() conversion for non-Error throws', async () => {
    mockUpload.mockRejectedValue('string error');
    const sink = makeSink();
    const events = [createTestEvent('copilot-cli', 'session-1', 'metadata', 0)];

    const result = await sink.push(events);

    expect(result.rejected[0]!.reason).toBe('string error');
  });

  it('includes category-rejected events when upload also fails', async () => {
    mockUpload.mockRejectedValue(new Error('server error'));
    const sink = makeSink({ supportedCategories: ['metadata'] });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),    // supported → upload fails
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 1), // unsupported → category-rejected
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    const ordinals = result.rejected.map(r => r.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual([0, 1]);
  });

  it('does not throw RetriableSinkError for 4xx errors (other than 429)', async () => {
    const error = Object.assign(new Error('Forbidden'), { statusCode: 403 });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    // Should NOT throw — should return a rejected result
    const result = await sink.push([
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
    ]);
    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('returns rejected result when payload serialisation throws (circular reference)', async () => {
    // JSON.stringify throws a TypeError on circular structures.
    // push() must catch this inside its try/catch and report it as a rejection,
    // not let the error propagate to the caller.
    const circular: Record<string, unknown> = {};
    circular['self'] = circular; // creates a circular reference

    const sink = makeSink();
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, circular);

    const result = await sink.push([event]);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.ordinal).toBe(0);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('DcrEnrichmentSink — push() retriable errors', () => {
  it('throws RetriableSinkError on HTTP 429', async () => {
    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    await expect(
      sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]),
    ).rejects.toBeInstanceOf(RetriableSinkError);
  });

  it('throws RetriableSinkError on HTTP 500', async () => {
    const error = Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    await expect(
      sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]),
    ).rejects.toBeInstanceOf(RetriableSinkError);
  });

  it('throws RetriableSinkError on HTTP 503', async () => {
    const error = Object.assign(new Error('Service Unavailable'), { statusCode: 503 });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    await expect(
      sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]),
    ).rejects.toBeInstanceOf(RetriableSinkError);
  });

  it('includes the status code in the RetriableSinkError message', async () => {
    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    await expect(
      sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]),
    ).rejects.toThrow('429');
  });

  it('parses Retry-After header into retryAfterMs on 429', async () => {
    const error = Object.assign(new Error('Too Many Requests'), {
      statusCode: 429,
      response: {
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '30' : null),
        },
      },
    });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    let thrown: RetriableSinkError | undefined;
    try {
      await sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]);
    } catch (e) {
      if (e instanceof RetriableSinkError) thrown = e;
    }

    expect(thrown).toBeInstanceOf(RetriableSinkError);
    expect(thrown?.retryAfterMs).toBe(30_000);
  });

  it('sets retryAfterMs to undefined when Retry-After header is absent', async () => {
    const error = Object.assign(new Error('Too Many Requests'), {
      statusCode: 429,
      response: { headers: { get: () => null } },
    });
    mockUpload.mockRejectedValue(error);
    const sink = makeSink();

    let thrown: RetriableSinkError | undefined;
    try {
      await sink.push([createTestEvent('copilot-cli', 'session-1', 'metadata', 0)]);
    } catch (e) {
      if (e instanceof RetriableSinkError) thrown = e;
    }

    expect(thrown?.retryAfterMs).toBeUndefined();
  });
});
