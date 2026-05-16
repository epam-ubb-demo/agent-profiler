/**
 * Unit tests for CopilotCliSessionProjector.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CopilotCliSessionProjector } from '../src/projector.js';
import { CopilotCliEnrichmentSource } from '../src/source.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const VALID_SESSION_PATH = join(FIXTURES_DIR, 'valid-session');

async function readAllEvents(sessionId: string) {
  const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
  const ref = { tool: 'copilot-cli' as const, sessionId, locationHint: join(FIXTURES_DIR, sessionId) };
  const events = [];
  for await (const event of source.readEvents(ref, {})) {
    events.push(event);
  }
  return events;
}

describe('CopilotCliSessionProjector', () => {
  describe('tool', () => {
    it('has tool = copilot-cli', () => {
      const projector = new CopilotCliSessionProjector();
      expect(projector.tool).toBe('copilot-cli');
    });
  });

  describe('project()', () => {
    it('returns a Session with the sessionId from metadata event', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(session.sessionId).toBe('valid-session');
    });

    it('restores copilotVersion from metadata payload', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(session.copilotVersion).toBeTruthy();
      expect(typeof session.copilotVersion).toBe('string');
    });

    it('restores selectedModel from metadata payload', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(session.selectedModel).toBeTruthy();
    });

    it('restores compactions array with correct fields', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(Array.isArray(session.compactions)).toBe(true);
      expect(session.compactions.length).toBeGreaterThan(0);

      const c = session.compactions[0]!;
      expect(typeof c.inputTokens).toBe('number');
      expect(typeof c.outputTokens).toBe('number');
      expect(typeof c.cacheRead).toBe('number');
      expect(typeof c.cacheWrite).toBe('number');
    });

    it('restores toolCalls array with correct fields', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(Array.isArray(session.toolCalls)).toBe(true);
      expect(session.toolCalls.length).toBeGreaterThan(0);

      const t = session.toolCalls[0]!;
      expect(typeof t.toolCallId).toBe('string');
      expect(typeof t.toolName).toBe('string');
    });

    it('returns empty utilisation when no utilisation events', async () => {
      const events = await readAllEvents('valid-session');
      // valid-session fixture has 0 utilisation events
      const utilisationEvents = events.filter((e) => e.category === 'utilisation');
      expect(utilisationEvents).toHaveLength(0);

      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);
      expect(session.utilisation).toHaveLength(0);
    });

    it('always returns empty arrays for non-enriched fields', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      expect(session.turns).toHaveLength(0);
      expect(session.fanoutTurns).toHaveLength(0);
      expect(session.assistantMessages).toHaveLength(0);
      expect(session.userMessages).toHaveLength(0);
      expect(session.subagents).toHaveLength(0);
    });

    it('produces the same session when called twice with the same events', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();

      const session1 = projector.project(events);
      const session2 = projector.project(events);

      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.copilotVersion).toBe(session2.copilotVersion);
      expect(session1.toolCalls.length).toBe(session2.toolCalls.length);
      expect(session1.compactions.length).toBe(session2.compactions.length);
    });

    it('handles an empty events array gracefully', () => {
      const projector = new CopilotCliSessionProjector();
      expect(() => projector.project([])).not.toThrow();

      const session = projector.project([]);
      expect(session.sessionId).toBe('');
      expect(session.toolCalls).toHaveLength(0);
    });

    it('preserves toolCall ordinal order', async () => {
      const events = await readAllEvents('valid-session');
      const projector = new CopilotCliSessionProjector();
      const session = projector.project(events);

      const toolResultEvents = events
        .filter((e) => e.category === 'tool_result')
        .sort((a, b) => a.ordinal - b.ordinal);

      for (const [idx, toolCall] of session.toolCalls.entries()) {
        const event = toolResultEvents[idx];
        if (event !== undefined) {
          expect(toolCall.toolCallId).toBe(event.payload['toolCallId']);
        }
      }
    });

    describe('round-trip (source → projector)', () => {
      it('restores the same number of compactions as the original session', async () => {
        const { parseCopilotCliSession } = await import('@agent-profiler/adapters-copilot-cli');
        const original = await parseCopilotCliSession(VALID_SESSION_PATH);

        const events = await readAllEvents('valid-session');
        const projector = new CopilotCliSessionProjector();
        const reconstructed = projector.project(events);

        expect(reconstructed.compactions.length).toBe(original.compactions.length);
      });

      it('restores the same number of toolCalls as the original session', async () => {
        const { parseCopilotCliSession } = await import('@agent-profiler/adapters-copilot-cli');
        const original = await parseCopilotCliSession(VALID_SESSION_PATH);

        const events = await readAllEvents('valid-session');
        const projector = new CopilotCliSessionProjector();
        const reconstructed = projector.project(events);

        expect(reconstructed.toolCalls.length).toBe(original.toolCalls.length);
      });

      it('restores selectedModel correctly', async () => {
        const { parseCopilotCliSession } = await import('@agent-profiler/adapters-copilot-cli');
        const original = await parseCopilotCliSession(VALID_SESSION_PATH);

        const events = await readAllEvents('valid-session');
        const projector = new CopilotCliSessionProjector();
        const reconstructed = projector.project(events);

        expect(reconstructed.selectedModel).toBe(original.selectedModel);
      });

      it('restores success correctly', async () => {
        const { parseCopilotCliSession } = await import('@agent-profiler/adapters-copilot-cli');
        const original = await parseCopilotCliSession(VALID_SESSION_PATH);

        const events = await readAllEvents('valid-session');
        const projector = new CopilotCliSessionProjector();
        const reconstructed = projector.project(events);

        expect(reconstructed.success).toBe(original.success);
      });
    });
  });
});
