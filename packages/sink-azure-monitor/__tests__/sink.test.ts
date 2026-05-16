/**
 * Unit tests for AzureMonitorEnrichmentSink.
 */

import type { EnrichmentRow } from '@agent-profiler/core';
import { createTestEvent } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AzureMonitorEnrichmentSink } from '../src/sink.js';
import type { RowUploader } from '../src/sink.js';

function makeNoOpUploader(): RowUploader {
  return async () => {};
}

function makeFailingUploader(message = 'upload failed'): RowUploader {
  return async () => {
    throw new Error(message);
  };
}

describe('AzureMonitorEnrichmentSink — constructor defaults', () => {
  it('uses "azure-monitor" as the default id', () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    expect(sink.id).toBe('azure-monitor');
  });

  it('accepts a custom id', () => {
    const sink = new AzureMonitorEnrichmentSink({
      id: 'my-custom-sink',
      upload: makeNoOpUploader(),
    });
    expect(sink.id).toBe('my-custom-sink');
  });

  it('defaults supportedCategories to the 4 known DCR categories', () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    // All four known categories are supported
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(true);
    expect(sink.supportsCategory('compaction')).toBe(true);
    expect(sink.supportsCategory('tool_result')).toBe(true);
    // Unknown categories are not supported by default
    expect(sink.supportsCategory('anything')).toBe(false);
  });

  it('accepts custom supportedCategories', () => {
    const sink = new AzureMonitorEnrichmentSink({
      supportedCategories: ['metadata', 'utilisation'],
      upload: makeNoOpUploader(),
    });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(true);
    expect(sink.supportsCategory('tool_result')).toBe(false);
  });
});

describe('AzureMonitorEnrichmentSink — availability()', () => {
  it('returns true when the upload function succeeds', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const available = await sink.availability();
    expect(available).toBe(true);
  });

  it('returns false when the upload function throws', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeFailingUploader() });
    const available = await sink.availability();
    expect(available).toBe(false);
  });

  it('calls the uploader with an empty array for the availability probe', async () => {
    const uploadSpy = vi.fn(async (_rows: readonly EnrichmentRow[]) => {});
    const sink = new AzureMonitorEnrichmentSink({ upload: uploadSpy });

    await sink.availability();

    expect(uploadSpy).toHaveBeenCalledOnce();
    expect(uploadSpy).toHaveBeenCalledWith([]);
  });
});

describe('AzureMonitorEnrichmentSink — supportsCategory()', () => {
  it('returns true for any category when wildcard is explicitly set', () => {
    const sink = new AzureMonitorEnrichmentSink({
      supportedCategories: ['*'],
      upload: makeNoOpUploader(),
    });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(true);
    expect(sink.supportsCategory('unknown-category')).toBe(true);
  });

  it('returns true only for listed categories when no wildcard', () => {
    const sink = new AzureMonitorEnrichmentSink({
      supportedCategories: ['metadata'],
      upload: makeNoOpUploader(),
    });
    expect(sink.supportsCategory('metadata')).toBe(true);
    expect(sink.supportsCategory('utilisation')).toBe(false);
  });

  it('returns false for wildcard-like string unless it is the actual wildcard', () => {
    const sink = new AzureMonitorEnrichmentSink({
      supportedCategories: ['metadata'],
      upload: makeNoOpUploader(),
    });
    // '*' as a query is not the wildcard; it would only match if literally in the list
    expect(sink.supportsCategory('*')).toBe(false);
  });
});

describe('AzureMonitorEnrichmentSink — push()', () => {
  it('returns empty result for an empty batch', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const result = await sink.push([]);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });

  it('does not call the uploader for an empty batch', async () => {
    const uploadSpy = vi.fn(async (_rows: readonly EnrichmentRow[]) => {});
    const sink = new AzureMonitorEnrichmentSink({ upload: uploadSpy });

    await sink.push([]);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('calls the uploader with correctly mapped rows', async () => {
    const capturedRows: EnrichmentRow[][] = [];
    const upload: RowUploader = async (rows) => {
      capturedRows.push([...rows]);
    };

    const sink = new AzureMonitorEnrichmentSink({ upload });
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, { x: 1 });

    await sink.push([event]);

    expect(capturedRows).toHaveLength(1);
    const row = capturedRows[0]![0]!;
    expect(row.EventId).toBe(event.eventId);
    expect(row.SessionId).toBe(event.sessionId);
    expect(row.Category).toBe(event.category);
    expect(row.Payload).toEqual(event.payload);
  });

  it('returns all ordinals as accepted on successful upload', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 2),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toEqual([0, 1, 2]);
    expect(result.rejected).toHaveLength(0);
  });

  it('returns all events as rejected when upload throws', async () => {
    const sink = new AzureMonitorEnrichmentSink({
      upload: makeFailingUploader('network error'),
    });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]!.ordinal).toBe(0);
    expect(result.rejected[0]!.reason).toBe('network error');
    expect(result.rejected[1]!.ordinal).toBe(1);
    expect(result.rejected[1]!.reason).toBe('network error');
  });

  it('uses the error message from non-Error throws as reason', async () => {
    const sink = new AzureMonitorEnrichmentSink({
      upload: async () => {
        throw 'string error'; // intentionally not an Error instance
      },
    });
    const events = [createTestEvent('copilot-cli', 'session-1', 'metadata', 0)];

    const result = await sink.push(events);

    expect(result.rejected[0]!.reason).toBe('string error');
  });

  it('is idempotent — pushing the same batch twice yields the same acceptedOrdinals', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    const first = await sink.push(events);
    const second = await sink.push(events);

    expect(first.acceptedOrdinals).toEqual(second.acceptedOrdinals);
  });

  it('rejects events whose category is not supported', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'unknown-category', 0),
      createTestEvent('copilot-cli', 'session-1', 'turns', 1),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]!.ordinal).toBe(0);
    expect(result.rejected[0]!.reason).toMatch(/Unsupported category: unknown-category/);
    expect(result.rejected[1]!.ordinal).toBe(1);
    expect(result.rejected[1]!.reason).toMatch(/Unsupported category: turns/);
  });

  it('does not call the uploader when all events have unsupported categories', async () => {
    const uploadSpy = vi.fn(async (_rows: readonly EnrichmentRow[]) => {});
    const sink = new AzureMonitorEnrichmentSink({ upload: uploadSpy });
    const events = [createTestEvent('copilot-cli', 'session-1', 'unknown-category', 0)];

    await sink.push(events);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('splits a mixed batch: supported events accepted, unsupported events rejected', async () => {
    const sink = new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'unknown-category', 1),
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 2),
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toEqual([0, 2]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.ordinal).toBe(1);
    expect(result.rejected[0]!.reason).toMatch(/Unsupported category: unknown-category/);
  });

  it('on upload failure, category-rejected and upload-failed events are all in rejected', async () => {
    const sink = new AzureMonitorEnrichmentSink({
      upload: makeFailingUploader('server error'),
    });
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),       // supported → upload fails
      createTestEvent('copilot-cli', 'session-1', 'unknown-category', 1), // unsupported → category-rejected
    ];

    const result = await sink.push(events);

    expect(result.acceptedOrdinals).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    const ordinals = result.rejected.map(r => r.ordinal).sort();
    expect(ordinals).toEqual([0, 1]);
  });
});
