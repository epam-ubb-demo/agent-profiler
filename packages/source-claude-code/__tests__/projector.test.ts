/**
 * Unit tests for ClaudeCodeSessionProjector.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ClaudeCodeSessionProjector } from '../src/projector.js';
import { ClaudeCodeEnrichmentSource } from '../src/source.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const FIXTURE_FILE = join(FIXTURES_DIR, 'cc-test-session-001.jsonl');
const SESSION_ID = 'cc-test-session-001';

async function readAllEvents() {
  const source = new ClaudeCodeEnrichmentSource([
    { filePath: FIXTURE_FILE, sessionId: SESSION_ID, projectDir: '/test/project', cwd: '/home/user/my-project' },
  ]);
  const ref = { tool: 'claude-code' as const, sessionId: SESSION_ID, locationHint: FIXTURE_FILE };
  const events = [];
  for await (const event of source.readEvents(ref, {})) {
    events.push(event);
  }
  return events;
}

describe('ClaudeCodeSessionProjector', () => {
  describe('tool', () => {
    it('has tool = claude-code', () => {
      const projector = new ClaudeCodeSessionProjector();
      expect(projector.tool).toBe('claude-code');
    });
  });

  describe('project()', () => {
    it('returns a Session with the sessionId from metadata event', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);
      expect(session.sessionId).toBe(SESSION_ID);
    });

    it('restores selectedModel from metadata payload', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);
      expect(session.selectedModel).toBe('claude-opus-4-5');
    });

    it('restores cwd from metadata payload', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);
      expect(session.cwd).toBe('/home/user/my-project');
    });

    it('restores startTs from metadata payload', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);
      expect(session.startTs).toBeTruthy();
      expect(typeof session.startTs).toBe('string');
    });

    it('restores toolCalls array with correct tool names', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);

      expect(Array.isArray(session.toolCalls)).toBe(true);
      expect(session.toolCalls.length).toBe(2);

      const names = session.toolCalls.map((t) => t.toolName);
      expect(names).toContain('bash');
      expect(names).toContain('read_file');
    });

    it('restores turns from user_interaction events', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);

      expect(Array.isArray(session.turns)).toBe(true);
      expect(session.turns.length).toBe(2);
    });

    it('restores userMessages from turn payloads', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);

      expect(session.userMessages.length).toBe(2);
      expect(typeof session.userMessages[0]!.content).toBe('string');
      expect(session.userMessages[0]!.content).toContain('list all files');
    });

    it('restores assistantMessages from turn payloads', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);

      expect(session.assistantMessages.length).toBeGreaterThan(0);
    });

    it('always returns empty arrays for non-enriched fields', async () => {
      const events = await readAllEvents();
      const session = new ClaudeCodeSessionProjector().project(events);

      expect(session.compactions).toHaveLength(0);
      expect(session.subagents).toHaveLength(0);
      expect(session.fanoutTurns).toHaveLength(0);
      expect(session.utilisation).toHaveLength(0);
      expect(session.modelChanges).toHaveLength(0);
    });

    it('handles an empty events array gracefully', () => {
      const projector = new ClaudeCodeSessionProjector();
      expect(() => projector.project([])).not.toThrow();

      const session = projector.project([]);
      expect(session.sessionId).toBe('');
      expect(session.toolCalls).toHaveLength(0);
      expect(session.turns).toHaveLength(0);
    });

    it('produces the same session when called twice with the same events', async () => {
      const events = await readAllEvents();
      const projector = new ClaudeCodeSessionProjector();

      const session1 = projector.project(events);
      const session2 = projector.project(events);

      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.selectedModel).toBe(session2.selectedModel);
      expect(session1.toolCalls.length).toBe(session2.toolCalls.length);
      expect(session1.turns.length).toBe(session2.turns.length);
    });

    describe('round-trip (source → projector)', () => {
      it('restores the same number of toolCalls as the original session', async () => {
        const { parseClaudeCodeSession } = await import('@agent-profiler/adapters-claude-code');
        const original = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);

        const events = await readAllEvents();
        const reconstructed = new ClaudeCodeSessionProjector().project(events);

        expect(reconstructed.toolCalls.length).toBe(original.toolCalls.length);
      });

      it('restores the same number of turns as the original session', async () => {
        const { parseClaudeCodeSession } = await import('@agent-profiler/adapters-claude-code');
        const original = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);

        const events = await readAllEvents();
        const reconstructed = new ClaudeCodeSessionProjector().project(events);

        expect(reconstructed.turns.length).toBe(original.turns.length);
      });

      it('restores selectedModel correctly', async () => {
        const { parseClaudeCodeSession } = await import('@agent-profiler/adapters-claude-code');
        const original = await parseClaudeCodeSession(FIXTURE_FILE, SESSION_ID);

        const events = await readAllEvents();
        const reconstructed = new ClaudeCodeSessionProjector().project(events);

        expect(reconstructed.selectedModel).toBe(original.selectedModel);
      });
    });
  });
});
