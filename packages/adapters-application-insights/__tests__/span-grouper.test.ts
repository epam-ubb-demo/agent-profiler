import { describe, it, expect } from 'vitest';

import type { OTelSpan } from '../src/schemas';
import { groupSpansBySession, deduplicateSpans } from '../src/span-grouper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(overrides: Partial<OTelSpan> = {}): OTelSpan {
  return {
    spanId: 'span-1',
    parentSpanId: null,
    traceId: 'trace-1',
    name: 'test',
    timestamp: '2025-01-01T00:00:00.000Z',
    durationMs: 100,
    success: true,
    dims: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupSpansBySession
// ---------------------------------------------------------------------------

describe('groupSpansBySession', () => {
  it('returns empty array for empty input', () => {
    expect(groupSpansBySession([])).toEqual([]);
  });

  it('groups spans by copilot_chat.session.id dimension', () => {
    const spans = [
      makeSpan({ spanId: 's1', dims: { 'copilot_chat.session.id': 'sess-1' } }),
      makeSpan({ spanId: 's2', dims: { 'copilot_chat.session.id': 'sess-1' } }),
      makeSpan({ spanId: 's3', dims: { 'copilot_chat.session.id': 'sess-1' } }),
    ];

    const groups = groupSpansBySession(spans);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessionId).toBe('sess-1');
    expect(groups[0]!.spans).toHaveLength(3);
  });

  it('creates multiple groups for different session ids', () => {
    const spans = [
      makeSpan({ spanId: 's1', dims: { 'copilot_chat.session.id': 'sess-a' } }),
      makeSpan({ spanId: 's2', dims: { 'copilot_chat.session.id': 'sess-b' } }),
    ];

    const groups = groupSpansBySession(spans);

    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.sessionId).sort();
    expect(ids).toEqual(['sess-a', 'sess-b']);
  });

  it('falls back to traceId when no span has session dim', () => {
    const spans = [
      makeSpan({ spanId: 's1', traceId: 'trace-a' }),
      makeSpan({ spanId: 's2', traceId: 'trace-a' }),
      makeSpan({ spanId: 's3', traceId: 'trace-b' }),
    ];

    const groups = groupSpansBySession(spans);

    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.sessionId).sort();
    expect(ids).toEqual(['trace-a', 'trace-b']);
  });

  it('uses session dim strategy when some spans have it, falling back to traceId for others', () => {
    const spans = [
      makeSpan({ spanId: 's1', traceId: 'trace-x', dims: { 'copilot_chat.session.id': 'sess-1' } }),
      makeSpan({ spanId: 's2', traceId: 'trace-x', dims: {} }),
    ];

    const groups = groupSpansBySession(spans);

    // s1 -> sess-1, s2 -> trace-x (fallback within session-dim strategy)
    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.sessionId).sort();
    expect(ids).toEqual(['sess-1', 'trace-x']);
  });

  it('sorts spans within each group by timestamp ascending', () => {
    const spans = [
      makeSpan({ spanId: 's3', timestamp: '2025-01-03T00:00:00.000Z', traceId: 'trace-1' }),
      makeSpan({ spanId: 's1', timestamp: '2025-01-01T00:00:00.000Z', traceId: 'trace-1' }),
      makeSpan({ spanId: 's2', timestamp: '2025-01-02T00:00:00.000Z', traceId: 'trace-1' }),
    ];

    const groups = groupSpansBySession(spans);

    expect(groups).toHaveLength(1);
    const sortedIds = groups[0]!.spans.map((s) => s.spanId);
    expect(sortedIds).toEqual(['s1', 's2', 's3']);
  });
});

// ---------------------------------------------------------------------------
// deduplicateSpans
// ---------------------------------------------------------------------------

describe('deduplicateSpans', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateSpans([])).toEqual([]);
  });

  it('returns same spans when there are no duplicates', () => {
    const spans = [
      makeSpan({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z' }),
      makeSpan({ spanId: 'b', timestamp: '2025-01-02T00:00:00.000Z' }),
    ];

    const result = deduplicateSpans(spans);

    expect(result).toHaveLength(2);
  });

  it('keeps the later-timestamped span when spanIds collide', () => {
    const spans = [
      makeSpan({ spanId: 'dup', timestamp: '2025-01-01T00:00:00.000Z' }),
      makeSpan({ spanId: 'dup', timestamp: '2025-01-02T00:00:00.000Z' }),
    ];

    const result = deduplicateSpans(spans);

    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp).toBe('2025-01-02T00:00:00.000Z');
  });

  it('returns results sorted by timestamp ascending', () => {
    const spans = [
      makeSpan({ spanId: 'c', timestamp: '2025-01-03T00:00:00.000Z' }),
      makeSpan({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z' }),
      makeSpan({ spanId: 'b', timestamp: '2025-01-02T00:00:00.000Z' }),
    ];

    const result = deduplicateSpans(spans);

    expect(result.map((s) => s.spanId)).toEqual(['a', 'b', 'c']);
  });
});
