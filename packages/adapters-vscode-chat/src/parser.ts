/**
 * Streaming JSONL parser for VS Code Copilot Chat transcripts.
 *
 * Reads a transcript file line-by-line and yields parsed raw events.
 * Malformed lines are skipped with a warning logged to the returned
 * diagnostics. Never throws.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import type { RawVsCodeChatEvent } from './types';

export interface ParseDiagnostics {
  skippedLines: number;
  warnings: string[];
}

export interface ParseResult {
  events: RawVsCodeChatEvent[];
  diagnostics: ParseDiagnostics;
}

/**
 * Parse a VS Code Chat transcript JSONL file into an array of raw events.
 *
 * Skips blank lines and malformed JSON, logging warnings for each.
 * Never throws — I/O errors are caught and returned as diagnostics.
 */
export async function parseTranscriptFile(filePath: string): Promise<ParseResult> {
  const events: RawVsCodeChatEvent[] = [];
  const diagnostics: ParseDiagnostics = { skippedLines: 0, warnings: [] };

  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineno = 0;
  for await (const line of rl) {
    lineno++;
    const stripped = line.trim();
    if (!stripped) continue;

    try {
      const parsed: unknown = JSON.parse(stripped);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        diagnostics.skippedLines++;
        diagnostics.warnings.push(`Line ${lineno}: not a JSON object`);
        continue;
      }

      const obj = parsed as Record<string, unknown>;

      // Validate required envelope fields
      if (typeof obj['type'] !== 'string' || typeof obj['id'] !== 'string' || typeof obj['timestamp'] !== 'string') {
        diagnostics.skippedLines++;
        diagnostics.warnings.push(`Line ${lineno}: missing required envelope fields (type, id, timestamp)`);
        continue;
      }

      events.push(obj as unknown as RawVsCodeChatEvent);
    } catch {
      diagnostics.skippedLines++;
      diagnostics.warnings.push(`Line ${lineno}: malformed JSON`);
    }
  }

  return { events, diagnostics };
}
