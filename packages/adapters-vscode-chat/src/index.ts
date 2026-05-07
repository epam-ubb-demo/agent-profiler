/**
 * @agent-profiler/adapters-vscode-chat — public API.
 *
 * Parses a VS Code Copilot Chat transcript JSONL file into the canonical
 * Session domain model. Never throws — always returns a Session with parseStatus.
 */

import type { Session } from '@agent-profiler/core';

import { buildTurns, processEvents } from './event-mapper';
import { parseTranscriptFile } from './parser';

/**
 * Parse a VS Code Copilot Chat session from a transcript file path.
 *
 * @param filePath - Path to the `.jsonl` transcript file.
 * @returns A Session object — never throws. Check `parseStatus` for outcome.
 */
export async function parseVsCodeChatSession(filePath: string): Promise<Session> {
  // Parse the JSONL file
  let events;
  let diagnostics;
  try {
    const result = await parseTranscriptFile(filePath);
    events = result.events;
    diagnostics = result.diagnostics;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return createFailedSession(`Failed to read transcript file: ${message}`);
  }

  if (events.length === 0 && diagnostics.skippedLines === 0) {
    return createFailedSession('Transcript file is empty');
  }

  // Process events through handlers
  const sb = processEvents(events);

  // Build structured turn data
  const turns = buildTurns(sb);

  // Determine parse status
  const parseStatus =
    diagnostics.skippedLines > 0
      ? { status: 'partial' as const, error: `${diagnostics.skippedLines} line(s) skipped` }
      : { status: 'ok' as const, error: null };

  return {
    sessionId: sb.sessionId,
    copilotVersion: sb.copilotVersion,
    selectedModel: '',
    reasoningEffort: '',
    repository: '',
    branch: '',
    cwd: '',
    startTs: sb.startTs,
    endTs: sb.endTs,
    modelChanges: [],
    toolCalls: sb.toolCalls,
    assistantMessages: sb.assistantMessages,
    userMessages: sb.userMessages,
    compactions: [],
    subagents: [],
    shutdown: null,
    success: null,
    fanoutTurns: [],
    turns,
    parseStatus,
    utilisation: [],
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
export { parseTranscriptFile } from './parser';
export { processEvents, buildTurns } from './event-mapper';
export { discoverSessions, getWorkspaceStoragePaths } from './path-resolver';
export type { DiscoveredSession, DiscoveryResult } from './path-resolver';
