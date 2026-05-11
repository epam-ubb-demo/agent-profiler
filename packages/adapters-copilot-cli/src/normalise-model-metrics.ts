/**
 * Normalises raw model-metrics payloads from the Copilot CLI shutdown event.
 *
 * The CLI has shipped two structural formats over time:
 *
 * 1. **Dictionary** (current) — keys are model names:
 *    `{ "claude-opus-4.6": { usage: {…}, requests: {…} } }`
 *
 * 2. **Array** (legacy, from early test fixtures):
 *    `[{ modelId: "…", usage: {…}, requests: {…} }]`
 *
 * Within each entry the token/request fields may live inside nested
 * `usage` / `requests` sub-objects *or* directly on the entry ("flat").
 * Cache field names also changed across CLI versions
 * (`cacheCreationInputTokens` → `cacheWriteTokens`, etc.).
 *
 * This module isolates all format-specific logic so that future CLI
 * schema changes only require updating one place.
 */

import type { ModelMetrics } from '@agent-profiler/core';

// ---------------------------------------------------------------------------
// Safe coercion helpers
// ---------------------------------------------------------------------------

/** Returns a safe integer from a possibly-undefined numeric value, defaulting to `fallback`. */
export function safeInt(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Coerce an unknown value to a non-negative number, defaulting to `fallback`. */
export function safeNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Type guard: value is a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extract normalised metrics from a single raw model entry.
 *
 * `flat` is the entry itself; nested `usage` and `requests` sub-objects
 * take precedence per-field when present.
 */
function extractEntry(model: string, raw: unknown): ModelMetrics {
  const flat = isPlainObject(raw) ? raw : {};

  const usage = isPlainObject(flat['usage']) ? (flat['usage'] as Record<string, unknown>) : {};
  const requests = isPlainObject(flat['requests']) ? (flat['requests'] as Record<string, unknown>) : {};

  return {
    model,
    inputTokens:      safeInt(usage['inputTokens']      ?? flat['inputTokens']),
    outputTokens:     safeInt(usage['outputTokens']      ?? flat['outputTokens']),
    cacheReadTokens:  safeInt(
      usage['cacheReadTokens']  ?? usage['cacheReadInputTokens']
      ?? flat['cacheReadTokens'] ?? flat['cacheReadInputTokens'],
    ),
    cacheWriteTokens: safeInt(
      usage['cacheWriteTokens'] ?? usage['cacheCreationInputTokens']
      ?? flat['cacheWriteTokens'] ?? flat['cacheCreationInputTokens'],
    ),
    reasoningTokens:  safeInt(usage['reasoningTokens']   ?? flat['reasoningTokens']),
    requestCount:     safeInt(requests['count']           ?? flat['requestCount']),
    premiumRequestCost: safeNumber(requests['cost']       ?? flat['premiumRequestCost']),
    apiDurationMs:    safeInt(flat['apiDurationMs']),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalise a raw `modelMetrics` payload into an array of {@link ModelMetrics}.
 *
 * Handles both the dictionary format (keys = model names) and the legacy
 * array format (`modelId` field on each element).  Returns an empty array
 * when the input is `null`, `undefined`, or otherwise unrecognised.
 */
export function normaliseModelMetrics(raw: unknown): ModelMetrics[] {
  if (raw == null) return [];

  // Legacy array format: [{ modelId: "…", … }]
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const obj = isPlainObject(entry) ? entry : {};
      const model = typeof obj['modelId'] === 'string' ? obj['modelId'] : '';
      return extractEntry(model, obj);
    });
  }

  // Dictionary format: { "model-name": { … } }
  if (isPlainObject(raw)) {
    return Object.entries(raw).map(([model, entry]) => extractEntry(model, entry));
  }

  return [];
}
