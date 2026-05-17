/**
 * parseClaudeCodeSession — the primary public API for the adapters-claude-code
 * package. Parses a single Claude Code session JSONL file and returns a
 * canonical Session domain object.
 */

import type { Session } from '@agent-profiler/core';

import { finaliseSession, processEvents } from './event-mapper.js';
import { parseSessionFile } from './parser.js';

/**
 * Parse a Claude Code session JSONL file and return a canonical Session.
 *
 * @param filePath - Absolute path to the `.jsonl` session file.
 * @param sessionId - Fallback session ID used when the file doesn't carry one.
 * @returns A resolved Session with all events processed.
 */
export async function parseClaudeCodeSession(
  filePath: string,
  sessionId?: string,
): Promise<Session> {
  const { events, diagnostics } = await parseSessionFile(filePath);

  const sb = processEvents(events);

  if (diagnostics.skippedLines > 0) {
    if (sb.parseStatus.status === 'ok') {
      sb.parseStatus = {
        status: 'partial',
        error: diagnostics.warnings[0] ?? 'Some lines were skipped',
      };
    }
  }

  return finaliseSession(sb, sessionId ?? filePath);
}
