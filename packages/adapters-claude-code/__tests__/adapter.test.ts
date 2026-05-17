/**
 * Unit tests for adapters-claude-code.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTurns, processEvents } from '../src/event-mapper.js';
import { parseSessionFile } from '../src/parser.js';
import { parseClaudeCodeSession } from '../src/session.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const FIXTURE_FILE = join(FIXTURES_DIR, 'cc-test-session-001.jsonl');
const SESSION_ID = 'cc-test-session-001';

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('parseSessionFile()', () => {
  it('parses all valid lines from the fixture', async () => {
    const { events, diagnostics } = await parseSessionFile(FIXTURE_FILE);
    expect(events.length).toBeGreaterThan(0);
    expect(diagnostics.skippedLines).toBe(0);
    expect(diagnostics.warnings).toHaveLength(0);
  });

  it('every parsed event has type, timestamp, and uuid fields', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    for (const event of events) {
      expect(typeof event.type).toBe('string');
      expect(typeof event.timestamp).toBe('string');
      expect(typeof event.uuid).toBe('string');
    }
  });

  it('returns empty events and diagnostics for an empty file', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(pathJoin(tmpdir(), 'claude-test-'));
    const emptyFile = pathJoin(dir, 'empty.jsonl');
    writeFileSync(emptyFile, '');

    const { events, diagnostics } = await parseSessionFile(emptyFile);
    expect(events).toHaveLength(0);
    expect(diagnostics.skippedLines).toBe(0);
  });

  it('skips malformed JSON lines with a warning', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(pathJoin(tmpdir(), 'claude-test-'));
    const badFile = pathJoin(dir, 'bad.jsonl');
    writeFileSync(badFile, 'not valid json\n{"type":"user","timestamp":"2026-01-01T00:00:00.000Z","uuid":"x"}\n');

    const { events, diagnostics } = await parseSessionFile(badFile);
    expect(diagnostics.skippedLines).toBe(1);
    expect(diagnostics.warnings.length).toBeGreaterThan(0);
    expect(events.length).toBe(1);
  });
});

// ── Event mapper tests ─────────────────────────────────────────────────────────

describe('processEvents()', () => {
  it('extracts session_id from the first user event', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.sessionId).toBe(SESSION_ID);
  });

  it('extracts cwd from the first event that has it', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.cwd).toBe('/home/user/my-project');
  });

  it('builds toolCalls from tool_use/tool_result event pairs', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.toolCalls.length).toBe(2);
    expect(sb.toolCalls[0]!.toolName).toBe('bash');
    expect(sb.toolCalls[1]!.toolName).toBe('read_file');
  });

  it('computes durationMs for tool calls that provide it', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.toolCalls[0]!.durationMs).toBe(205);
    expect(sb.toolCalls[1]!.durationMs).toBe(198);
  });

  it('sets success=true for tool calls where is_error=false', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.toolCalls[0]!.success).toBe(true);
  });

  it('accumulates userMessages from user events', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.userMessages.length).toBe(2);
    expect(sb.userMessages[0]!.content).toContain('list all files');
  });

  it('accumulates assistantMessages from assistant events', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.assistantMessages.length).toBeGreaterThan(0);
  });

  it('sets model from assistant events', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    expect(sb.model).toBe('claude-opus-4-5');
  });
});

describe('buildTurns()', () => {
  it('creates one turn per user message', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    const turns = buildTurns(sb);
    expect(turns.length).toBe(2);
  });

  it('each turn has a userMessage', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    const turns = buildTurns(sb);
    for (const turn of turns) {
      expect(turn.userMessage).not.toBeNull();
    }
  });

  it('each turn carries its associated tool calls', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb = processEvents(events);
    const turns = buildTurns(sb);
    const allTurnToolCalls = turns.flatMap((t) => t.toolCalls);
    expect(allTurnToolCalls.length).toBe(2);
  });
});

// ── parseClaudeCodeSession integration ────────────────────────────────────────

describe('parseClaudeCodeSession()', () => {
  it('returns a Session with the correct sessionId', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.sessionId).toBe(SESSION_ID);
  });

  it('returns startTs and endTs', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.startTs).toBeTruthy();
    expect(session.endTs).toBeTruthy();
    expect(typeof session.startTs).toBe('string');
  });

  it('returns toolCalls with expected tool names', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    const names = session.toolCalls.map((t) => t.toolName);
    expect(names).toContain('bash');
    expect(names).toContain('read_file');
  });

  it('returns turns with the correct count', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.turns.length).toBe(2);
  });

  it('returns a parseStatus of ok for a clean file', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.parseStatus.status).toBe('ok');
    expect(session.parseStatus.error).toBeNull();
  });

  it('returns empty arrays for non-available fields', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.compactions).toHaveLength(0);
    expect(session.subagents).toHaveLength(0);
    expect(session.fanoutTurns).toHaveLength(0);
    expect(session.utilisation).toHaveLength(0);
    expect(session.modelChanges).toHaveLength(0);
  });

  it('uses selectedModel from assistant events', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.selectedModel).toBe('claude-opus-4-5');
  });

  it('restores cwd from session events', async () => {
    const session = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);
    expect(session.cwd).toBe('/home/user/my-project');
  });

  it('returns a failed parseStatus when the file does not exist', async () => {
    const session = await parseClaudeCodeSession('/non-existent/path.jsonl', 'fallback-id');
    expect(session.parseStatus.status).toBe('failed');
    expect(session.parseStatus.error).toMatch(/I\/O error/);
    expect(session.sessionId).toBe('fallback-id');
  });
});

// ── processEvents() determinism ───────────────────────────────────────────────

describe('processEvents() turn counter', () => {
  it('produces identical turnIds on repeated calls with the same input', async () => {
    const { events } = await parseSessionFile(FIXTURE_FILE);
    const sb1 = processEvents(events);
    const sb2 = processEvents(events);
    const turnIds1 = [...sb1.turnData.keys()];
    const turnIds2 = [...sb2.turnData.keys()];
    expect(turnIds1).toEqual(turnIds2);
  });
});
