/**
 * @agent-profiler/adapters-copilot-cli — public API.
 *
 * Parses a Copilot CLI `events.jsonl` file into the canonical Session
 * domain model. Never throws — always returns a Session with parseStatus.
 */

import type { Session } from '@agent-profiler/core';

import { countPostShutdownEvents, deriveSessionOutcome, processEvents } from './event-handlers';
import { buildFanoutTurns } from './fanout-builder';
import { parseEventsFile } from './parser';
import { resolveEventsPath } from './path-resolver';
import { buildTurns } from './turn-builder';

/**
 * Parse a Copilot CLI session from a directory or events file path.
 *
 * @param path - Either a directory containing `events.jsonl`/`events.ndjson`,
 *               or a direct path to the events file.
 * @returns A Session object — never throws. Check `parseStatus` for outcome.
 */
export async function parseCopilotCliSession(path: string): Promise<Session> {
  // Resolve the events file path
  const { resolved, error: resolveError } = resolveEventsPath(path);

  if (!resolved) {
    return createFailedSession(resolveError ?? 'Unknown path resolution error');
  }

  // Parse the JSONL file
  let events;
  let diagnostics;
  try {
    const result = await parseEventsFile(resolved);
    events = result.events;
    diagnostics = result.diagnostics;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return createFailedSession(`Failed to read events file: ${message}`);
  }

  if (events.length === 0 && diagnostics.skippedEvents === 0) {
    return createFailedSession('Events file is empty');
  }

  // Process events through handlers
  const sb = processEvents(events);

  // Derive outcome from terminal events
  const success = deriveSessionOutcome(sb);

  // Build structured turn data
  const turns = buildTurns(sb);
  const fanoutTurns = buildFanoutTurns(sb);

  // Determine parse status
  const parseStatus =
    diagnostics.skippedEvents > 0
      ? { status: 'partial' as const, error: `${diagnostics.skippedEvents} event(s) skipped` }
      : { status: 'ok' as const, error: null };

  // Check shutdown freshness
  const postShutdownCount = countPostShutdownEvents(sb);
  const shutdownFresh = postShutdownCount === 0;

  // Detect possible schema mismatch: shutdown exists but all token counts are zero
  const metricsEmpty =
    sb.shutdown !== null &&
    sb.shutdown.modelMetrics.length > 0 &&
    sb.shutdown.modelMetrics.every((m) => m.inputTokens === 0 && m.outputTokens === 0);

  // Add metadata about shutdown discrepancy if relevant
  const warnings: string[] = [];
  if (parseStatus.error) warnings.push(parseStatus.error);
  if (!shutdownFresh && sb.shutdown) {
    warnings.push(
      `Shutdown metrics may be stale: ${postShutdownCount} event(s) occurred after shutdown`,
    );
  }
  if (metricsEmpty) {
    warnings.push(
      'Shutdown metrics present but all token counts are zero — possible event schema mismatch',
    );
  }
  const finalError = warnings.length > 0 ? warnings.join('; ') : null;

  // Escalate status to 'partial' if we detected a schema mismatch warning
  const finalStatus =
    metricsEmpty && parseStatus.status === 'ok' ? ('partial' as const) : parseStatus.status;

  return {
    sessionId: sb.sessionId,
    copilotVersion: sb.copilotVersion,
    selectedModel: sb.selectedModel,
    reasoningEffort: sb.reasoningEffort,
    repository: sb.repository,
    branch: sb.branch,
    cwd: sb.cwd,
    startTs: sb.startTs,
    endTs: sb.endTs,
    modelChanges: sb.modelChanges,
    toolCalls: sb.toolCalls,
    assistantMessages: sb.assistantMessages,
    userMessages: sb.userMessages,
    compactions: sb.compactions,
    subagents: sb.subagents,
    shutdown: sb.shutdown,
    success,
    fanoutTurns,
    turns,
    parseStatus: { status: finalStatus, error: finalError },
    utilisation: [], // Utilisation requires process log parsing, not yet implemented
  };
}

function createFailedSession(error: string): Session {
  return {
    sessionId: '',
    copilotVersion: '',
    selectedModel: '',
    reasoningEffort: '',
    repository: '',
    branch: '',
    cwd: '',
    startTs: null,
    endTs: null,
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: null,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'failed', error },
    utilisation: [],
  };
}

// Re-export key utilities for advanced usage
export { resolveEventsPath } from './path-resolver';
export { parseEventsFile } from './parser';
export { processEvents, countPostShutdownEvents, deriveSessionOutcome } from './event-handlers';
export { buildTurns } from './turn-builder';
export { buildFanoutTurns } from './fanout-builder';
