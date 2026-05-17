/**
 * Unit tests for VsCodeChatSessionProjector.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { VsCodeChatSessionProjector } from '../src/projector.js';
import { VsCodeChatEnrichmentSource } from '../src/source.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const FIXTURE_FILE = join(FIXTURES_DIR, 'test-session-001.jsonl');
const SESSION_ID = 'test-session-001';

async function readAllEvents() {
  const source = new VsCodeChatEnrichmentSource([
    { filePath: FIXTURE_FILE, sessionId: SESSION_ID, workspaceDir: 'test-workspace', variant: 'stable' },
  ]);
  const ref = { tool: 'vscode-chat' as const, sessionId: SESSION_ID, locationHint: FIXTURE_FILE };
  const events = [];
  for await (const event of source.readEvents(ref, {})) {
    events.push(event);
  }
  return events;
}

describe('VsCodeChatSessionProjector', () => {
  describe('tool', () => {
    it('has tool = vscode-chat', () => {
      const projector = new VsCodeChatSessionProjector();
      expect(projector.tool).toBe('vscode-chat');
    });
  });

  describe('project()', () => {
    it('returns a Session with the sessionId from metadata event', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);
      expect(session.sessionId).toBe(SESSION_ID);
    });

    it('restores copilotVersion from metadata payload', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);
      expect(typeof session.copilotVersion).toBe('string');
      expect(session.copilotVersion).toBe('0.46.2026042704');
    });

    it('restores startTs from metadata payload', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);
      expect(session.startTs).toBeTruthy();
      expect(typeof session.startTs).toBe('string');
    });

    it('restores toolCalls array with correct fields', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);

      expect(Array.isArray(session.toolCalls)).toBe(true);
      expect(session.toolCalls.length).toBeGreaterThan(0);

      const t = session.toolCalls[0]!;
      expect(typeof t.toolCallId).toBe('string');
      expect(typeof t.toolName).toBe('string');
      expect(t.toolName).toBe('run_in_terminal');
    });

    it('restores turns from user_interaction events', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);

      expect(Array.isArray(session.turns)).toBe(true);
      expect(session.turns.length).toBeGreaterThan(0);
    });

    it('restores userMessages from turn payloads', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);

      // The fixture has 2 user messages (turns 0 and 2 have user messages)
      expect(session.userMessages.length).toBeGreaterThan(0);
      expect(typeof session.userMessages[0]!.content).toBe('string');
    });

    it('restores assistantMessages from turn payloads', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);

      expect(session.assistantMessages.length).toBeGreaterThan(0);
      expect(typeof session.assistantMessages[0]!.content).toBe('string');
    });

    it('always returns empty arrays for non-enriched fields', async () => {
      const events = await readAllEvents();
      const session = new VsCodeChatSessionProjector().project(events);

      expect(session.compactions).toHaveLength(0);
      expect(session.subagents).toHaveLength(0);
      expect(session.fanoutTurns).toHaveLength(0);
      expect(session.utilisation).toHaveLength(0);
      expect(session.modelChanges).toHaveLength(0);
    });

    it('handles an empty events array gracefully', () => {
      const projector = new VsCodeChatSessionProjector();
      expect(() => projector.project([])).not.toThrow();

      const session = projector.project([]);
      expect(session.sessionId).toBe('');
      expect(session.toolCalls).toHaveLength(0);
      expect(session.turns).toHaveLength(0);
    });

    it('produces the same session when called twice with the same events', async () => {
      const events = await readAllEvents();
      const projector = new VsCodeChatSessionProjector();

      const session1 = projector.project(events);
      const session2 = projector.project(events);

      expect(session1.sessionId).toBe(session2.sessionId);
      expect(session1.copilotVersion).toBe(session2.copilotVersion);
      expect(session1.toolCalls.length).toBe(session2.toolCalls.length);
      expect(session1.turns.length).toBe(session2.turns.length);
    });

    it('preserves tool_result ordinal order in toolCalls', async () => {
      const events = await readAllEvents();
      const projector = new VsCodeChatSessionProjector();
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
      it('restores the same number of toolCalls as the original session', async () => {
        const { parseVsCodeChatSession } = await import('@agent-profiler/adapters-vscode-chat');
        const original = await parseVsCodeChatSession(FIXTURE_FILE);

        const events = await readAllEvents();
        const reconstructed = new VsCodeChatSessionProjector().project(events);

        expect(reconstructed.toolCalls.length).toBe(original.toolCalls.length);
      });

      it('restores the same number of turns as the original session', async () => {
        const { parseVsCodeChatSession } = await import('@agent-profiler/adapters-vscode-chat');
        const original = await parseVsCodeChatSession(FIXTURE_FILE);

        const events = await readAllEvents();
        const reconstructed = new VsCodeChatSessionProjector().project(events);

        expect(reconstructed.turns.length).toBe(original.turns.length);
      });

      it('restores the same number of toolCalls per turn as the original session', async () => {
        const { parseVsCodeChatSession } = await import('@agent-profiler/adapters-vscode-chat');
        const original = await parseVsCodeChatSession(FIXTURE_FILE);

        const events = await readAllEvents();
        const reconstructed = new VsCodeChatSessionProjector().project(events);

        for (const [i, origTurn] of original.turns.entries()) {
          const reconTurn = reconstructed.turns[i];
          if (reconTurn !== undefined) {
            expect(reconTurn.toolCalls.length).toBe(origTurn.toolCalls.length);
          }
        }
      });
    });
  });
});
