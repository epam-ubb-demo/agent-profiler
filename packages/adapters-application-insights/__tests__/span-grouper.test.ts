import { describe, it, expect } from 'vitest';

import { type OTelSpan, parseSpanRows } from '../src/schemas';
import { groupSpansBySession, deduplicateSpans } from '../src/span-grouper';
import { multiSessionRows } from './fixtures';

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
      makeSpan({ spanId: 's1', traceId: 'trace-a', dims: { 'copilot_chat.session.id': 'sess-a' } }),
      makeSpan({ spanId: 's2', traceId: 'trace-b', dims: { 'copilot_chat.session.id': 'sess-b' } }),
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

  it('uses per-trace session ID resolution when some spans have it', () => {
    const spans = [
      makeSpan({ spanId: 's1', traceId: 'trace-x', dims: { 'copilot_chat.session.id': 'sess-1' } }),
      makeSpan({ spanId: 's2', traceId: 'trace-x', dims: {} }),
    ];

    const groups = groupSpansBySession(spans);

    // Both spans are in trace-x; s1 provides session id for the whole trace
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessionId).toBe('sess-1');
    expect(groups[0]!.spans).toHaveLength(2);
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

// ---------------------------------------------------------------------------
// Fixture-based tests — multi-session grouping
// ---------------------------------------------------------------------------

describe('groupSpansBySession — multi-session fixture', () => {
  it('separates spans from two different sessions', () => {
    const { spans } = parseSpanRows(multiSessionRows);
    const groups = groupSpansBySession(spans);

    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.sessionId).sort();
    expect(ids).toEqual(['sess-multi-a', 'sess-multi-b']);
  });

  it('assigns correct span counts to each session group', () => {
    const { spans } = parseSpanRows(multiSessionRows);
    const groups = groupSpansBySession(spans);

    const groupA = groups.find((g) => g.sessionId === 'sess-multi-a');
    const groupB = groups.find((g) => g.sessionId === 'sess-multi-b');

    expect(groupA!.spans).toHaveLength(3);
    expect(groupB!.spans).toHaveLength(2);
  });
});

describe('deduplicateSpans — fixture duplicates', () => {
  it('removes duplicate spans from multi-session fixture data', () => {
    const { spans } = parseSpanRows(multiSessionRows);
    // Simulate duplicates by doubling the span list
    const duplicated = [...spans, ...spans];

    const deduped = deduplicateSpans(duplicated);

    expect(deduped).toHaveLength(spans.length);
  });
});

// ---------------------------------------------------------------------------
// Edge case: Empty-string session dimension grouping
// ---------------------------------------------------------------------------

describe('groupSpansBySession — empty-string session IDs treated as missing', () => {
  it('falls back to traceId when session ID is empty string', () => {
    const spans = [
      makeSpan({
        spanId: 's1',
        traceId: 'trace-a',
        dims: { 'copilot_chat.session.id': '' }, // Empty string should be treated as missing
      }),
      makeSpan({
        spanId: 's2',
        traceId: 'trace-a',
        dims: { 'copilot_chat.session.id': '' },
      }),
    ];

    const groups = groupSpansBySession(spans);

    // Both spans should be grouped by traceId, not empty-string session ID
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessionId).toBe('trace-a');
    expect(groups[0]!.spans).toHaveLength(2);
  });

  it('differentiates between empty-string session ID and valid session ID in same trace', () => {
    const spans = [
      makeSpan({
        spanId: 's1',
        traceId: 'trace-x',
        dims: { 'copilot_chat.session.id': '' }, // Empty string falls back to traceId
      }),
      makeSpan({
        spanId: 's2',
        traceId: 'trace-x',
        dims: { 'copilot_chat.session.id': 'sess-valid' }, // Valid session ID overrides
      }),
      makeSpan({
        spanId: 's3',
        traceId: 'trace-x',
        dims: { 'copilot_chat.session.id': 'sess-valid' },
      }),
    ];

    const groups = groupSpansBySession(spans);

    // Per-trace session ID resolution: traces with valid session IDs win
    // Trace trace-x has some spans with 'sess-valid', so they all group by that
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessionId).toBe('sess-valid');
    expect(groups[0]!.spans).toHaveLength(3);
  });

  it('treats empty-string session separately from missing session in different traces', () => {
    const spans = [
      makeSpan({
        spanId: 's1',
        traceId: 'trace-a',
        dims: { 'copilot_chat.session.id': '' }, // Empty string in trace-a
      }),
      makeSpan({
        spanId: 's2',
        traceId: 'trace-b',
        dims: {}, // Missing session ID in trace-b
      }),
    ];

    const groups = groupSpansBySession(spans);

    // Two groups: one for each traceId (trace-a and trace-b)
    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.sessionId).sort();
    expect(ids).toEqual(['trace-a', 'trace-b']);
  });
});
