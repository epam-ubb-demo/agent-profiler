/**
 * Invalid and edge-case span rows fixture.
 *
 * Each row exercises a different failure mode of `parseSpanRow()` /
 * `parseSpanRows()`:
 *
 * - `rowMissingId`: no `id` field — Zod validation fails
 * - `rowNonStringOperationId`: `operation_Id` is a number — Zod validation fails
 * - `rowInvalidTimestamp`: timestamp is not parseable — normalised to epoch
 * - `rowMalformedDimensions`: customDimensions is broken JSON — dims = {}
 * - `rowEmptyStrings`: empty strings for key fields — mostly acceptable
 * - `rowKustoDuration`: Kusto timespan string for duration — parsed to ms
 */

/** Row missing the `id` field — expected to fail validation. */
export const rowMissingId: Record<string, unknown> = {
  operation_Id: 'trace-bad-001',
  operation_ParentId: null,
  name: 'bad-span',
  timestamp: '2025-06-15T10:00:00.000Z',
  duration: 100,
  success: true,
  customDimensions: '{}',
};

/** Row with non-string `operation_Id` — expected to fail validation. */
export const rowNonStringOperationId: Record<string, unknown> = {
  id: 'span-bad-002',
  operation_Id: 12345,
  operation_ParentId: null,
  name: 'bad-span',
  timestamp: '2025-06-15T10:00:00.000Z',
  duration: 100,
  success: true,
  customDimensions: '{}',
};

/** Row with an invalid timestamp — normalised to epoch by the schema. */
export const rowInvalidTimestamp: Record<string, unknown> = {
  id: 'span-bad-003',
  operation_Id: 'trace-bad-003',
  operation_ParentId: null,
  name: 'bad-ts-span',
  timestamp: 'not-a-real-date',
  duration: 100,
  success: true,
  customDimensions: '{}',
};

/** Row with malformed JSON in customDimensions — dims resolve to {}. */
export const rowMalformedDimensions: Record<string, unknown> = {
  id: 'span-bad-004',
  operation_Id: 'trace-bad-004',
  operation_ParentId: null,
  name: 'bad-dims-span',
  timestamp: '2025-06-15T10:00:00.000Z',
  duration: 100,
  success: true,
  customDimensions: '{this is not valid json!!!',
};

/** Row with empty string values for name and other fields. */
export const rowEmptyStrings: Record<string, unknown> = {
  id: '',
  operation_Id: '',
  operation_ParentId: '',
  name: '',
  timestamp: '2025-06-15T10:00:00.000Z',
  duration: 0,
  success: true,
  customDimensions: '{}',
};

/** Row with Kusto timespan duration string instead of a number. */
export const rowKustoDuration: Record<string, unknown> = {
  id: 'span-kusto-dur',
  operation_Id: 'trace-kusto-001',
  operation_ParentId: null,
  name: 'kusto-duration-span',
  timestamp: '2025-06-15T10:00:00.000Z',
  duration: '00:00:05.2500000',
  success: true,
  customDimensions: JSON.stringify({
    'gen_ai.request.model': 'claude-4',
    'gen_ai.usage.input_tokens': '100',
  }),
};

/** All malformed rows collected for batch testing with parseSpanRows(). */
export const allMalformedRows: Record<string, unknown>[] = [
  rowMissingId,
  rowNonStringOperationId,
  rowInvalidTimestamp,
  rowMalformedDimensions,
  rowEmptyStrings,
  rowKustoDuration,
];
