/**
 * Basic validation tests for the test-fixtures loaders.
 *
 * Verifies structural integrity of each golden fixture without asserting
 * exact adapter output (that is the responsibility of F12.1 contract tests).
 */

import { describe, expect, it } from 'vitest';

import {
  loadClaudeCodeFixture,
  loadCopilotCliFixture,
  loadVsCodeChatFixture,
} from '../src/loaders.js';
import type { FixtureData } from '../src/loaders.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function assertValidFixture(data: FixtureData, expectedSessionId: string): void {
  it('returns non-empty rawLines', () => {
    expect(data.rawLines.length).toBeGreaterThan(0);
  });

  it('every rawLine is valid JSON', () => {
    for (const line of data.rawLines) {
      expect(() => JSON.parse(line), `Line should parse as JSON: ${line.slice(0, 80)}`).not.toThrow();
    }
  });

  it('returns non-empty expectedEvents', () => {
    expect(data.expectedEvents.length).toBeGreaterThan(0);
  });

  it('every expectedEvent has required EnrichmentEvent shape', () => {
    for (const event of data.expectedEvents) {
      expect(event.schemaVersion).toBe(1);
      expect(typeof event.tool).toBe('string');
      expect(['copilot-cli', 'vscode-chat', 'claude-code']).toContain(event.tool);
      expect(typeof event.sessionId).toBe('string');
      expect(event.sessionId.length).toBeGreaterThan(0);
      expect(typeof event.category).toBe('string');
      expect(typeof event.ordinal).toBe('number');
      expect(Number.isInteger(event.ordinal)).toBe(true);
      expect(event.ordinal).toBeGreaterThanOrEqual(0);
      expect(typeof event.eventId).toBe('string');
      expect(typeof event.eventTs).toBe('string');
      // eventTs must be a valid ISO 8601 date
      expect(new Date(event.eventTs).toISOString()).toBe(event.eventTs);
      expect(typeof event.payloadSchema).toBe('string');
      expect(typeof event.payload).toBe('object');
    }
  });

  it('sessionId matches expected value', () => {
    expect(data.sessionId).toBe(expectedSessionId);
  });

  it('fixtureDir is a non-empty string', () => {
    expect(typeof data.fixtureDir).toBe('string');
    expect(data.fixtureDir.length).toBeGreaterThan(0);
  });
}

// ── Copilot CLI fixture ───────────────────────────────────────────────────────

describe('loadCopilotCliFixture()', () => {
  const data = loadCopilotCliFixture();
  assertValidFixture(data, 'golden-copilot-001');

  it('fixture contains a session.start event', () => {
    const parsed = data.rawLines.map((l) => JSON.parse(l) as { type: string });
    expect(parsed.some((e) => e.type === 'session.start')).toBe(true);
  });

  it('fixture contains a session.shutdown event', () => {
    const parsed = data.rawLines.map((l) => JSON.parse(l) as { type: string });
    expect(parsed.some((e) => e.type === 'session.shutdown')).toBe(true);
  });

  it('expectedEvents include a metadata event', () => {
    expect(data.expectedEvents.some((e) => e.category === 'metadata')).toBe(true);
  });

  it('expectedEvents include at least one tool_result event', () => {
    expect(data.expectedEvents.some((e) => e.category === 'tool_result')).toBe(true);
  });
});

// ── VS Code Chat fixture ─────────────────────────────────────────────────────

describe('loadVsCodeChatFixture()', () => {
  const data = loadVsCodeChatFixture();
  assertValidFixture(data, 'golden-vscode-001');

  it('fixture contains a session.start event', () => {
    const parsed = data.rawLines.map((l) => JSON.parse(l) as { type: string });
    expect(parsed.some((e) => e.type === 'session.start')).toBe(true);
  });

  it('expectedEvents include a metadata event', () => {
    expect(data.expectedEvents.some((e) => e.category === 'metadata')).toBe(true);
  });

  it('expectedEvents include at least one user_interaction event', () => {
    expect(data.expectedEvents.some((e) => e.category === 'user_interaction')).toBe(true);
  });
});

// ── Claude Code fixture ───────────────────────────────────────────────────────

describe('loadClaudeCodeFixture()', () => {
  const data = loadClaudeCodeFixture();
  assertValidFixture(data, 'golden-claude-001');

  it('fixture contains at least one user event', () => {
    const parsed = data.rawLines.map((l) => JSON.parse(l) as { type: string });
    expect(parsed.some((e) => e.type === 'user')).toBe(true);
  });

  it('fixture contains at least one tool_use event', () => {
    const parsed = data.rawLines.map((l) => JSON.parse(l) as { type: string });
    expect(parsed.some((e) => e.type === 'tool_use')).toBe(true);
  });

  it('expectedEvents include a metadata event', () => {
    expect(data.expectedEvents.some((e) => e.category === 'metadata')).toBe(true);
  });

  it('expectedEvents include at least two tool_result events', () => {
    const toolResults = data.expectedEvents.filter((e) => e.category === 'tool_result');
    expect(toolResults.length).toBeGreaterThanOrEqual(2);
  });
});
