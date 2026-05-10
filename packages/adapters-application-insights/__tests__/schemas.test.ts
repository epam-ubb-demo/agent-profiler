import { describe, it, expect } from 'vitest';

import { parseSpanRow, parseSpanRows, safeInt } from '../src/schemas';

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
