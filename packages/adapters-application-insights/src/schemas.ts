/**
 * Zod schemas for raw Application Insights span rows.
 *
 * Validates and parses raw query result rows into typed {@link OTelSpan}
 * objects ready for downstream grouping and reconstruction.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Validated OTel span after parsing from a raw Application Insights row. */
export interface OTelSpan {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly traceId: string;
  readonly name: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  readonly durationMs: number;
  readonly success: boolean;
  /** Flattened customDimensions key-value pairs. */
  readonly dims: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

/**
 * Schema for a single raw span row returned by Application Insights.
 *
 * Field names match the Application Insights column conventions
 * (e.g. `operation_Id`, `operation_ParentId`).
 */
const RawSpanRowSchema = z.object({
  id: z.string(),
  operation_Id: z.string(),
  operation_ParentId: z.string().nullish().transform((v) => (v == null || v.trim() === '') ? null : v),
  name: z.string(),
  timestamp: z.union([
    z.string().transform((s) => {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
    }),
    z.date().transform((d) => d.toISOString()),
  ]),
  duration: z.union([z.number(), z.string().transform(parseKustoDuration)]),
  success: z.boolean().default(true),
  customDimensions: z
    .union([z.string(), z.record(z.unknown())])
    .nullish()
    .transform((v) => v ?? '{}'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Kusto timespan string into milliseconds.
 *
 * Supports formats:
 * - `HH:mm:ss.fffffff`
 * - `d.HH:mm:ss.fffffff`
 *
 * @returns Duration in milliseconds, or `0` for unparseable values.
 */
export function parseKustoDuration(value: string): number {
  // d.HH:mm:ss.fffffff  or  HH:mm:ss.fffffff
  const match = /^(?:(\d+)\.)?(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(
    value,
  );
  if (!match) return 0;

  const days = match[1] != null ? parseInt(match[1], 10) : 0;
  const hours = parseInt(match[2]!, 10);
  const minutes = parseInt(match[3]!, 10);
  const seconds = parseInt(match[4]!, 10);
  // Fractional part: pad/truncate to 7 digits (100-ns ticks), then convert to ms
  const fracStr = (match[5] ?? '').padEnd(7, '0').slice(0, 7);
  const fracMs = parseInt(fracStr, 10) / 10_000;

  return (
    days * 86_400_000 +
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1_000 +
    fracMs
  );
}

/**
 * Safely parse an integer from a string value.
 *
 * @returns The parsed integer, or `0` when the value is null, undefined,
 *          empty, or cannot be parsed as a number.
 */
export function safeInt(value: string | undefined | null): number {
  if (value == null || value === '') return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parse a `customDimensions` value (JSON string or object) into a flat
 * string-keyed record. Malformed JSON is handled gracefully by returning
 * an empty record.
 */
function parseDims(
  raw: string | Record<string, unknown>,
): Record<string, string> {
  let obj: Record<string, unknown>;

  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else {
    obj = raw;
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = String(val ?? '');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse and validate a single raw Application Insights row into an
 * {@link OTelSpan}.
 *
 * @throws {Error} When the row fails Zod validation — the error message
 *   includes the formatted Zod issues for easier debugging.
 */
export function parseSpanRow(row: Record<string, unknown>): OTelSpan {
  const result = RawSpanRowSchema.safeParse(row);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid span row: ${issues}`);
  }

  const data = result.data;

  return {
    spanId: data.id,
    parentSpanId: data.operation_ParentId,
    traceId: data.operation_Id,
    name: data.name,
    timestamp: data.timestamp,
    durationMs: data.duration,
    success: data.success,
    dims: parseDims(data.customDimensions),
  };
}

/**
 * Parse a batch of raw rows, collecting both successful spans and error
 * messages for rows that failed validation.
 *
 * This function never throws — all parse failures are captured in the
 * returned `errors` array.
 */
export function parseSpanRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): { spans: OTelSpan[]; errors: string[] } {
  const spans: OTelSpan[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    try {
      spans.push(parseSpanRow(row));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      errors.push(`Row ${index}: ${message}`);
    }
  }

  return { spans, errors };
}
