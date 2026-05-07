/**
 * Parser tests — validates JSONL reading, malformed line handling, and
 * missing file behaviour.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseEventsFile } from '../src/parser';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('parseEventsFile', () => {
  it('reads a valid JSONL file and returns all events', async () => {
    const result = await parseEventsFile(join(FIXTURES, 'valid-session', 'events.jsonl'));

    expect(result.events.length).toBe(20);
    expect(result.diagnostics.skippedEvents).toBe(0);
    expect(result.diagnostics.warnings).toHaveLength(0);
  });

  it('skips malformed lines and reports diagnostics', async () => {
    const result = await parseEventsFile(join(FIXTURES, 'malformed-session', 'events.jsonl'));

    // 4 valid objects (session.start, user.message, assistant.message, session.shutdown)
    // 3 bad lines (plain text, malformed json, array)
    expect(result.events.length).toBe(4);
    expect(result.diagnostics.skippedEvents).toBe(3);
    expect(result.diagnostics.warnings.length).toBe(3);
    expect(result.diagnostics.warnings[0]).toContain('Line 2');
    expect(result.diagnostics.warnings[1]).toContain('Line 4');
    expect(result.diagnostics.warnings[2]).toContain('Line 6');
  });

  it('handles a minimal session (start + shutdown only)', async () => {
    const result = await parseEventsFile(join(FIXTURES, 'minimal-session', 'events.jsonl'));

    expect(result.events.length).toBe(2);
    expect(result.diagnostics.skippedEvents).toBe(0);
  });

  it('rejects a non-existent file', async () => {
    await expect(
      parseEventsFile(join(FIXTURES, 'nonexistent', 'events.jsonl')),
    ).rejects.toThrow();
  });
});
