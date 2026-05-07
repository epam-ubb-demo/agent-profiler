/**
 * Integration test — validates parseCopilotCliSession end-to-end.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCopilotCliSession } from '../src/index';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('parseCopilotCliSession', () => {
  it('parses a valid session directory', async () => {
    const session = await parseCopilotCliSession(join(FIXTURES, 'valid-session'));

    expect(session.parseStatus.status).toBe('ok');
    expect(session.sessionId).toBe('sess-abc-123');
    expect(session.copilotVersion).toBe('1.2.3');
    expect(session.selectedModel).toBe('claude-sonnet-4-20250514');
    expect(session.repository).toBe('test-org/test-repo');
    expect(session.branch).toBe('main');
    expect(session.toolCalls.length).toBeGreaterThan(0);
    expect(session.assistantMessages.length).toBeGreaterThan(0);
    expect(session.userMessages.length).toBeGreaterThan(0);
    expect(session.compactions).toHaveLength(1);
    expect(session.subagents).toHaveLength(1);
    expect(session.shutdown).not.toBeNull();
    expect(session.success).toBe(true);
    expect(session.turns.length).toBeGreaterThan(0);
    expect(session.fanoutTurns.length).toBeGreaterThan(0);
  });

  it('parses a valid session via direct file path', async () => {
    const session = await parseCopilotCliSession(
      join(FIXTURES, 'valid-session', 'events.jsonl'),
    );

    expect(session.parseStatus.status).toBe('ok');
    expect(session.sessionId).toBe('sess-abc-123');
  });

  it('returns partial status for malformed sessions', async () => {
    const session = await parseCopilotCliSession(join(FIXTURES, 'malformed-session'));

    expect(session.parseStatus.status).toBe('partial');
    expect(session.parseStatus.error).toContain('skipped');
    expect(session.sessionId).toBe('sess-malformed-001');
    expect(session.shutdown).not.toBeNull();
  });

  it('parses a minimal session', async () => {
    const session = await parseCopilotCliSession(join(FIXTURES, 'minimal-session'));

    expect(session.parseStatus.status).toBe('ok');
    expect(session.sessionId).toBe('sess-minimal-001');
    expect(session.selectedModel).toBe('gpt-4o');
    expect(session.toolCalls).toHaveLength(0);
    expect(session.turns).toHaveLength(0);
    expect(session.shutdown).not.toBeNull();
  });

  it('returns failed status for non-existent path', async () => {
    const session = await parseCopilotCliSession('/nonexistent/path');

    expect(session.parseStatus.status).toBe('failed');
    expect(session.parseStatus.error).toContain('does not exist');
    expect(session.sessionId).toBe('');
  });

  it('returns failed status for directory without events file', async () => {
    const session = await parseCopilotCliSession(join(FIXTURES));

    expect(session.parseStatus.status).toBe('failed');
    expect(session.parseStatus.error).toContain('No events file found');
  });
});
