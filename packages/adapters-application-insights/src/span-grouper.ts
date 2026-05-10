/**
 * Span grouping utilities.
 *
 * Groups validated {@link OTelSpan} objects by session.
 * A separate {@link deduplicateSpans} helper removes duplicate spans
 * that may appear across overlapping query windows.
 */

import type { OTelSpan } from './schemas';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A collection of spans sharing the same session identity. */
export interface SpanGroup {
  readonly sessionId: string;
  readonly spans: readonly OTelSpan[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Sort spans by timestamp ascending (stable — preserves insertion order
 * for equal timestamps).
 */
function sortByTimestamp(spans: OTelSpan[]): OTelSpan[] {
  return [...spans].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group spans into sessions.
 *
 * **Strategy 1** — if any span carries a `copilot_chat.session.id`
 * custom dimension, all spans are grouped by that attribute.
 *
 * **Strategy 2** — otherwise, spans are grouped by `traceId`
 * (`operation_Id`).
 *
 * Within each group the spans are sorted by timestamp ascending.
 *
 * @returns An array of {@link SpanGroup} entries, one per detected session.
 */
export function groupSpansBySession(
  spans: readonly OTelSpan[],
): SpanGroup[] {
  if (spans.length === 0) return [];

  const SESSION_DIM = 'copilot_chat.session.id';
  const hasSessionDim = spans.some((s) => s.dims[SESSION_DIM] != null);

  // Build per-trace session ID lookup
  const traceSessionMap = new Map<string, string>();
  if (hasSessionDim) {
    for (const span of spans) {
      const sid = span.dims[SESSION_DIM];
      if (sid != null && !traceSessionMap.has(span.traceId)) {
        traceSessionMap.set(span.traceId, sid);
      }
    }
  }

  const buckets = new Map<string, OTelSpan[]>();

  for (const span of spans) {
    const key = hasSessionDim
      ? (traceSessionMap.get(span.traceId) ?? span.traceId)
      : span.traceId;

    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(span);
  }

  const groups: SpanGroup[] = [];
  for (const [sessionId, bucket] of buckets) {
    groups.push({ sessionId, spans: sortByTimestamp(bucket) });
  }

  return groups;
}

/**
 * Remove duplicate spans, keeping the entry with the latest timestamp
 * for each unique `spanId`.
 *
 * The returned array is sorted by timestamp ascending.
 */
export function deduplicateSpans(
  spans: readonly OTelSpan[],
): OTelSpan[] {
  if (spans.length === 0) return [];

  const seen = new Map<string, OTelSpan>();

  for (const span of spans) {
    const existing = seen.get(span.spanId);
    if (
      !existing ||
      span.timestamp.localeCompare(existing.timestamp) > 0
    ) {
      seen.set(span.spanId, span);
    }
  }

  return sortByTimestamp([...seen.values()]);
}
