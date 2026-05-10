/**
 * Session assembly pipeline.
 *
 * Orchestrates the full transformation from raw Application Insights
 * query result rows to a domain {@link Session} object:
 *
 * 1. Parse and validate rows → {@link OTelSpan}
 * 2. Deduplicate spans
 * 3. Build span tree
 * 4. Extract turn buckets
 * 5. Build domain turns and fan-out turns
 * 6. Aggregate metrics
 * 7. Assemble final session
 */

import type {
  ModelChange,
  ModelMetrics,
  ParseStatus,
  Session,
  ShutdownMetrics,
} from '@agent-profiler/core';

import type { OTelSpan } from './schemas';
import { parseSpanRows, safeInt } from './schemas';
import { deduplicateSpans } from './span-grouper';
import type { SpanNode } from './turn-reconstructor';
import {
  buildSpanTree,
  buildTurns,
  computeEndTs,
  extractTurns,
  flattenTree,
} from './turn-reconstructor';

// ---------------------------------------------------------------------------
// Metrics aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate per-model token metrics from LLM spans.
 *
 * Spans are grouped by the model name extracted from
 * `gen_ai.response.model`, falling back to `gen_ai.request.model`, then
 * to `'unknown'`.
 */
export function aggregateModelMetrics(
  llmSpans: readonly OTelSpan[],
): ModelMetrics[] {
  const map = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      requestCount: number;
      apiDurationMs: number;
    }
  >();

  for (const span of llmSpans) {
    const d = span.dims;
    const model =
      d['gen_ai.response.model'] ??
      d['gen_ai.request.model'] ??
      'unknown';

    let entry = map.get(model);
    if (!entry) {
      entry = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        requestCount: 0,
        apiDurationMs: 0,
      };
      map.set(model, entry);
    }

    entry.inputTokens += safeInt(
      d['gen_ai.usage.input_tokens'] ?? d['gen_ai.usage.prompt_tokens'],
    );
    entry.outputTokens += safeInt(
      d['gen_ai.usage.output_tokens'] ?? d['gen_ai.usage.completion_tokens'],
    );
    entry.cacheReadTokens += safeInt(d['gen_ai.usage.cache_read_tokens']);
    entry.cacheWriteTokens += safeInt(d['gen_ai.usage.cache_write_tokens']);
    entry.requestCount += 1;
    entry.apiDurationMs += span.durationMs;
  }

  const result: ModelMetrics[] = [];
  for (const [model, entry] of map) {
    result.push({
      model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheWriteTokens: entry.cacheWriteTokens,
      requestCount: entry.requestCount,
      apiDurationMs: entry.apiDurationMs,
    });
  }

  return Object.freeze(result) as ModelMetrics[];
}

/**
 * Aggregate shutdown-level metrics from LLM span nodes and the full
 * span list.
 *
 * @returns `null` when there are no LLM nodes.
 */
export function aggregateShutdownMetrics(
  llmNodes: readonly SpanNode[],
  allSpans: readonly OTelSpan[],
): ShutdownMetrics | null {
  if (llmNodes.length === 0) return null;

  const llmSpans = llmNodes.map((n) => n.span);
  const modelMetrics = aggregateModelMetrics(llmSpans);

  let totalPremiumRequests = 0;
  let totalApiDurationMs = 0;
  for (const m of modelMetrics) {
    totalPremiumRequests += m.requestCount;
    totalApiDurationMs += m.apiDurationMs;
  }

  // Use the latest span timestamp as the shutdown timestamp
  const lastSpan = [...allSpans].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  )[0];

  return {
    totalPremiumRequests,
    totalApiDurationMs,
    modelMetrics,
    currentTokens: 0,
    systemTokens: 0,
    conversationTokens: 0,
    toolDefinitionsTokens: 0,
    codeChanges: {},
    timestamp: lastSpan?.timestamp ?? null,
  };
}

// ---------------------------------------------------------------------------
// Model changes
// ---------------------------------------------------------------------------

/**
 * Detect mid-session model switches across LLM span nodes.
 *
 * The first model encountered is treated as the `selectedModel` (not
 * recorded as a change). Subsequent transitions are returned in
 * timestamp order.
 */
export function detectModelChanges(
  llmNodes: readonly SpanNode[],
): ModelChange[] {
  if (llmNodes.length === 0) return [];

  const sorted = [...llmNodes].sort((a, b) =>
    a.span.timestamp.localeCompare(b.span.timestamp),
  );

  const changes: ModelChange[] = [];
  let currentModel: string | null = null;

  for (const node of sorted) {
    const d = node.span.dims;
    const model =
      d['gen_ai.response.model'] ??
      d['gen_ai.request.model'] ??
      'unknown';

    if (currentModel === null) {
      // First model — not a change
      currentModel = model;
    } else if (model !== currentModel) {
      changes.push({ timestamp: node.span.timestamp, model });
      currentModel = model;
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Parse status
// ---------------------------------------------------------------------------

/**
 * Derive the overall {@link ParseStatus} from the parsing results.
 */
export function deriveParseStatus(
  spans: readonly OTelSpan[],
  turnsLength: number,
  parseErrors: readonly string[],
): ParseStatus {
  if (spans.length === 0) {
    return { status: 'failed', error: 'No spans found for session' };
  }

  const spanIds = new Set(spans.map((s) => s.spanId));
  const orphanCount = spans.filter(
    (s) => s.parentSpanId !== null && !spanIds.has(s.parentSpanId),
  ).length;
  if (orphanCount > spans.length * 0.5) {
    return {
      status: 'partial',
      error: `High orphan ratio: ${orphanCount}/${spans.length} spans have no parent`,
    };
  }

  if (turnsLength === 0) {
    return {
      status: 'partial',
      error: 'No turns could be reconstructed from the span tree',
    };
  }

  if (parseErrors.length > 0) {
    return {
      status: 'partial',
      error: `${parseErrors.length} row(s) failed validation`,
    };
  }

  return { status: 'ok', error: null };
}

// ---------------------------------------------------------------------------
// Success derivation
// ---------------------------------------------------------------------------

/**
 * Derive the overall success state of a session from root span nodes.
 *
 * - No roots → `null` (indeterminate)
 * - Any root span failed → `false`
 * - All roots succeeded but a descendant failed → `null`
 * - All nodes succeeded → `true`
 */
export function deriveSuccess(
  roots: readonly SpanNode[],
): boolean | null {
  if (roots.length === 0) return null;

  const anyRootFailed = roots.some((r) => !r.span.success);
  if (anyRootFailed) return false;

  // All roots succeeded — check descendants
  const allNodes = flattenTree(roots);
  const anyDescendantFailed = allNodes.some((n) => !n.span.success);
  if (anyDescendantFailed) return null;

  return true;
}

// ---------------------------------------------------------------------------
// Session assembly
// ---------------------------------------------------------------------------

/**
 * Assemble a complete {@link Session} from raw Application Insights rows.
 *
 * This is the main entry point for the span transformation pipeline.
 * It orchestrates parsing, deduplication, tree construction, turn
 * extraction, metrics aggregation, and final assembly.
 */
export function assembleSession(
  rows: ReadonlyArray<Record<string, unknown>>,
): Session {
  // Step 1 — Parse
  const { spans: parsedSpans, errors: parseErrors } = parseSpanRows(rows);

  // Step 2 — Deduplicate
  const spans = deduplicateSpans(parsedSpans);

  // Step 3 — Build tree
  const roots = buildSpanTree(spans);

  // Step 4 — Extract turns
  const buckets = extractTurns(roots, spans);

  // Step 5 — Build domain turns
  const { turns, fanoutTurns } = buildTurns(buckets);

  // Step 6 — Aggregate metrics
  const allNodes = flattenTree(roots);
  const llmNodes = allNodes.filter((n) => n.kind === 'llm');
  const llmSpans = llmNodes.map((n) => n.span);
  const modelMetrics = aggregateModelMetrics(llmSpans);
  const shutdown = aggregateShutdownMetrics(llmNodes, spans);
  const modelChanges = detectModelChanges(llmNodes);

  // Collect all events across turns
  const allToolCalls = turns.flatMap((t) => t.toolCalls);
  const allAssistantMessages = turns.flatMap((t) => t.assistantMessages);
  const allUserMessages = turns
    .map((t) => t.userMessage)
    .filter((m): m is Exclude<typeof m, null> => m !== null);
  const allSubagents = turns.flatMap((t) => t.subagents);

  // Determine selected model from first LLM metric or first model change
  const selectedModel = modelMetrics[0]?.model ?? '';

  // Session identity and context from span dimensions
  const firstSpan = spans[0];
  const sessionId =
    firstSpan?.dims['copilot_chat.session.id'] ??
    firstSpan?.traceId ??
    '';

  // Time bounds
  const startTs = spans.length > 0 ? spans[0]!.timestamp : null;
  const endTs = spans.length > 0
    ? spans.reduce((max, s) => {
        const end = computeEndTs(s);
        return end > max ? end : max;
      }, computeEndTs(spans[0]!))
    : null;

  // Parse status
  const parseStatus = deriveParseStatus(spans, turns.length, parseErrors);

  // Step 7 — Assemble
  const session: Session = {
    sessionId,
    copilotVersion: '',
    selectedModel,
    reasoningEffort: '',
    repository: firstSpan?.dims['copilot_chat.context.repository'] ?? '',
    branch: firstSpan?.dims['copilot_chat.context.branch'] ?? '',
    cwd: firstSpan?.dims['copilot_chat.context.cwd'] ?? '',
    startTs,
    endTs,
    modelChanges,
    toolCalls: allToolCalls,
    assistantMessages: allAssistantMessages,
    userMessages: allUserMessages,
    compactions: [],
    subagents: allSubagents,
    shutdown,
    success: deriveSuccess(roots),
    fanoutTurns,
    turns,
    parseStatus,
    utilisation: [],
  };

  return session;
}
