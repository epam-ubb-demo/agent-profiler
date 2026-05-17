/**
 * parseClaudeCodeSession — the primary public API for the adapters-claude-code
 * package. Parses a single Claude Code session JSONL file and returns a
 * canonical Session domain object.
 */

import type { Session } from '@agent-profiler/core';

import { createSessionBuilder, finaliseSession, processEvents } from './event-mapper.js';
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
  let events: Awaited<ReturnType<typeof parseSessionFile>>['events'];
  let diagnostics: Awaited<ReturnType<typeof parseSessionFile>>['diagnostics'];

  try {
    ({ events, diagnostics } = await parseSessionFile(filePath));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return finaliseSession(
      {
        ...createSessionBuilder(),
        parseStatus: { status: 'failed', error: `I/O error: ${message}` },
      },
      sessionId ?? filePath,
    );
  }

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
