import { describe, it, expect } from 'vitest';

import { parseSpanRow, parseSpanRows, safeInt, parseKustoDuration } from '../src/schemas';
import {
  rowMissingId,
  rowNonStringOperationId,
  rowInvalidTimestamp,
  rowMalformedDimensions,
  rowEmptyStrings,
  rowKustoDuration,
  allMalformedRows,
} from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'span-1',
    operation_Id: 'trace-1',
    operation_ParentId: 'parent-1',
    name: 'test-span',
    timestamp: '2025-01-01T00:00:00.000Z',
    duration: 100,
    success: true,
    customDimensions: '{}',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safeInt
// ---------------------------------------------------------------------------

describe('safeInt', () => {
  it('returns 0 for null', () => {
    expect(safeInt(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(safeInt(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(safeInt('')).toBe(0);
  });

  it('parses a valid integer string', () => {
    expect(safeInt('42')).toBe(42);
  });

  it('returns 0 for non-numeric string', () => {
    expect(safeInt('abc')).toBe(0);
  });

  it('truncates a float string to integer', () => {
    expect(safeInt('3.7')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseSpanRow
// ---------------------------------------------------------------------------

describe('parseSpanRow', () => {
  it('parses a valid row into an OTelSpan', () => {
    const span = parseSpanRow(makeRawRow());

    expect(span).toEqual({
      spanId: 'span-1',
      parentSpanId: 'parent-1',
      traceId: 'trace-1',
      name: 'test-span',
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: 100,
      success: true,
      dims: {},
    });
  });

  it('parses JSON customDimensions string', () => {
    const span = parseSpanRow(
      makeRawRow({ customDimensions: '{"gen_ai.request.model":"claude"}' }),
    );

    expect(span.dims['gen_ai.request.model']).toBe('claude');
  });

  it('parses object customDimensions', () => {
    const span = parseSpanRow(
      makeRawRow({ customDimensions: { 'gen_ai.request.model': 'claude' } }),
    );

    expect(span.dims['gen_ai.request.model']).toBe('claude');
  });

  it('handles malformed JSON customDimensions gracefully', () => {
    const span = parseSpanRow(makeRawRow({ customDimensions: '{bad-json' }));

    expect(span.dims).toEqual({});
  });

  it('throws when a required field is missing', () => {
    const row = makeRawRow();
    delete row.id;

    expect(() => parseSpanRow(row)).toThrow(Error);
  });

  it('sets parentSpanId to null when operation_ParentId is null', () => {
    const span = parseSpanRow(makeRawRow({ operation_ParentId: null }));

    expect(span.parentSpanId).toBeNull();
  });

  it('sets parentSpanId to null when operation_ParentId is absent', () => {
    const row = makeRawRow();
    delete row.operation_ParentId;
    const span = parseSpanRow(row);

    expect(span.parentSpanId).toBeNull();
  });

  it('defaults success to true when the field is missing', () => {
    const row = makeRawRow();
    delete row.success;
    const span = parseSpanRow(row);

    expect(span.success).toBe(true);
  });

  it('accepts a Date object for timestamp and coerces to ISO string', () => {
    const date = new Date('2025-06-15T12:30:00.000Z');
    const span = parseSpanRow(makeRawRow({ timestamp: date }));

    expect(span.timestamp).toBe('2025-06-15T12:30:00.000Z');
  });

  it('handles customDimensions: null gracefully', () => {
    const span = parseSpanRow(makeRawRow({ customDimensions: null }));

    expect(span.dims).toEqual({});
  });

  it('drops keys with null values from customDimensions', () => {
    const span = parseSpanRow(
      makeRawRow({ customDimensions: { 'gen_ai.request.model': null } }),
    );
    expect(span.dims['gen_ai.request.model']).toBeUndefined();
    expect('gen_ai.request.model' in span.dims).toBe(false);
  });

  it('drops keys with undefined values from customDimensions', () => {
    const span = parseSpanRow(
      makeRawRow({ customDimensions: { 'copilot_chat.session.id': undefined } }),
    );
    expect(span.dims['copilot_chat.session.id']).toBeUndefined();
    expect('copilot_chat.session.id' in span.dims).toBe(false);
  });

  it('retains keys with real values including empty string', () => {
    const span = parseSpanRow(
      makeRawRow({ customDimensions: { 'gen_ai.request.model': 'claude-4', 'copilot_chat.tool.call.name': '' } }),
    );
    expect(span.dims['gen_ai.request.model']).toBe('claude-4');
    // Empty string IS a real value — it stays (unlike null/undefined which are absent)
    expect(span.dims['copilot_chat.tool.call.name']).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseSpanRows
// ---------------------------------------------------------------------------

describe('parseSpanRows', () => {
  it('collects valid spans and error messages for invalid rows', () => {
    const rows = [
      makeRawRow({ id: 'ok-1' }),
      { bad: 'row' }, // missing required fields
      makeRawRow({ id: 'ok-2' }),
    ];

    const { spans, errors } = parseSpanRows(rows);

    expect(spans).toHaveLength(2);
    expect(spans[0]!.spanId).toBe('ok-1');
    expect(spans[1]!.spanId).toBe('ok-2');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Row 1');
  });

  it('returns empty errors when all rows are valid', () => {
    const { spans, errors } = parseSpanRows([
      makeRawRow({ id: 'a' }),
      makeRawRow({ id: 'b' }),
    ]);

    expect(spans).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  it('returns empty arrays for empty input', () => {
    const { spans, errors } = parseSpanRows([]);

    expect(spans).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseKustoDuration
// ---------------------------------------------------------------------------

describe('parseKustoDuration', () => {
  it('parses HH:mm:ss.fffffff format', () => {
    // 1 second + 0.2345678 seconds = 1234.5678 ms
    expect(parseKustoDuration('00:00:01.2345678')).toBeCloseTo(1234.5678, 2);
  });

  it('parses d.HH:mm:ss.fffffff format with day component', () => {
    // 1 day + 2 hours + 3 minutes + 4 seconds + 0.567 seconds
    const expected = 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 4 * 1_000 + 567;
    expect(parseKustoDuration('1.02:03:04.5670000')).toBeCloseTo(expected, 0);
  });

  it('returns 0 for unparseable values', () => {
    expect(parseKustoDuration('not-a-duration')).toBe(0);
  });

  it('handles format without fractional seconds', () => {
    expect(parseKustoDuration('00:01:30')).toBe(90_000);
  });
});

// ---------------------------------------------------------------------------
// parseSpanRow — duration as Kusto timespan string (Fix 1)
// ---------------------------------------------------------------------------

describe('parseSpanRow — Kusto duration', () => {
  it('parses duration as a Kusto timespan string', () => {
    const span = parseSpanRow(makeRawRow({ duration: '00:00:01.2345678' }));
    expect(span.durationMs).toBeCloseTo(1234.5678, 2);
  });

  it('parses duration with day component', () => {
    const span = parseSpanRow(makeRawRow({ duration: '1.02:03:04.5670000' }));
    const expected = 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 4 * 1_000 + 567;
    expect(span.durationMs).toBeCloseTo(expected, 0);
  });

  it('returns durationMs 0 for unparseable duration string', () => {
    const span = parseSpanRow(makeRawRow({ duration: 'not-a-duration' }));
    expect(span.durationMs).toBe(0);
  });

  it('still works with duration as a regular number (regression)', () => {
    const span = parseSpanRow(makeRawRow({ duration: 42 }));
    expect(span.durationMs).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// parseSpanRow — invalid timestamp normalisation (Fix 2)
// ---------------------------------------------------------------------------

describe('parseSpanRow — timestamp validation', () => {
  it('normalises an invalid timestamp string to epoch', () => {
    const span = parseSpanRow(makeRawRow({ timestamp: 'not-a-date' }));
    expect(span.timestamp).toBe('1970-01-01T00:00:00.000Z');
  });

  it('preserves a valid ISO timestamp string (regression)', () => {
    const span = parseSpanRow(makeRawRow({ timestamp: '2025-06-15T12:00:00.000Z' }));
    expect(span.timestamp).toBe('2025-06-15T12:00:00.000Z');
  });

  it('normalises parseable timestamp string to ISO-8601', () => {
    const row = makeRawRow({ timestamp: '2024-01-15 10:30:00' });
    const span = parseSpanRow(row);
    expect(span.timestamp).toBe(new Date('2024-01-15 10:30:00').toISOString());
  });

  it('normalises empty operation_ParentId to null', () => {
    const row = makeRawRow({ operation_ParentId: '' });
    const span = parseSpanRow(row);
    expect(span.parentSpanId).toBeNull();
  });

  it('normalises whitespace-only operation_ParentId to null', () => {
    const row = makeRawRow({ operation_ParentId: '   ' });
    const span = parseSpanRow(row);
    expect(span.parentSpanId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fixture-based tests — parseSpanRows with malformed data
// ---------------------------------------------------------------------------

describe('parseSpanRows — malformed fixture data', () => {
  it('rejects row missing id field', () => {
    const { spans, errors } = parseSpanRows([rowMissingId]);

    expect(spans).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Row 0');
  });

  it('rejects row with non-string operation_Id', () => {
    const { spans, errors } = parseSpanRows([rowNonStringOperationId]);

    expect(spans).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('accepts row with invalid timestamp (normalised to epoch)', () => {
    const { spans, errors } = parseSpanRows([rowInvalidTimestamp]);

    expect(spans).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(spans[0]!.timestamp).toBe('1970-01-01T00:00:00.000Z');
  });

  it('accepts row with malformed customDimensions (dims = {})', () => {
    const { spans, errors } = parseSpanRows([rowMalformedDimensions]);

    expect(spans).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(spans[0]!.dims).toEqual({});
  });

  it('accepts row with empty string values', () => {
    const { spans, errors } = parseSpanRows([rowEmptyStrings]);

    // Empty string for id is still a string — Zod accepts it
    expect(spans).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(spans[0]!.spanId).toBe('');
    expect(spans[0]!.parentSpanId).toBeNull(); // empty string normalised to null
  });

  it('parses Kusto timespan duration from fixture', () => {
    const { spans, errors } = parseSpanRows([rowKustoDuration]);

    expect(spans).toHaveLength(1);
    expect(errors).toHaveLength(0);
    // '00:00:05.2500000' = 5250ms
    expect(spans[0]!.durationMs).toBeCloseTo(5250, 0);
    expect(spans[0]!.dims['gen_ai.request.model']).toBe('claude-4');
  });

  it('collects errors and successes from mixed batch of malformed rows', () => {
    const { spans, errors } = parseSpanRows(allMalformedRows);

    // rowMissingId and rowNonStringOperationId fail; rest succeed
    expect(errors).toHaveLength(2);
    expect(spans).toHaveLength(4);
  });
});
