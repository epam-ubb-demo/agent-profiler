/**
 * Streaming JSONL parser.
 *
 * Reads an events file line-by-line and yields parsed raw events.
 * Malformed lines are skipped with a warning logged to the returned
 * diagnostics. Never throws.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import type { RawEvent } from './types';

export interface ParseDiagnostics {
  skippedEvents: number;
  warnings: string[];
}

export interface ParseResult {
  events: RawEvent[];
  diagnostics: ParseDiagnostics;
}

/**
 * Parse a JSONL/NDJSON file into an array of raw events.
 *
 * Mirrors `_read_events` from the Python prototype — skips blank lines
 * and malformed JSON, logging warnings for each.
 */
export async function parseEventsFile(filePath: string): Promise<ParseResult> {
  const events: RawEvent[] = [];
  const diagnostics: ParseDiagnostics = { skippedEvents: 0, warnings: [] };

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
        diagnostics.skippedEvents++;
        diagnostics.warnings.push(`Line ${lineno}: not a JSON object`);
        continue;
      }
      events.push(parsed as RawEvent);
    } catch {
      diagnostics.skippedEvents++;
      diagnostics.warnings.push(`Line ${lineno}: malformed JSON`);
    }
  }

  return { events, diagnostics };
}
