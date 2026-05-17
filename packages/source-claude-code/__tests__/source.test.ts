/**
 * Unit tests for ClaudeCodeEnrichmentSource.
 */

import { join } from 'node:path';

import { runSourceContractTests } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { ClaudeCodeEnrichmentSource } from '../src/source.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const FIXTURE_FILE = join(FIXTURES_DIR, 'cc-test-session-001.jsonl');
const SESSION_ID = 'cc-test-session-001';

/** Helper: create a source with a single override session pointing at the fixture. */
function makeSource() {
  return new ClaudeCodeEnrichmentSource([
    { filePath: FIXTURE_FILE, sessionId: SESSION_ID, projectDir: '/test/project', cwd: '/home/user/my-project' },
  ]);
}

/** Shared fixture SessionRef used in contract and unit tests. */
const FIXTURE_REF = { tool: 'claude-code' as const, sessionId: SESSION_ID, locationHint: FIXTURE_FILE };

// ── Contract tests ────────────────────────────────────────────────────────────

runSourceContractTests(() => ({
  source: makeSource(),
  fixture: FIXTURE_REF,
}));

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('ClaudeCodeEnrichmentSource', () => {
  describe('tool', () => {
    it('has tool = claude-code', () => {
      expect(makeSource().tool).toBe('claude-code');
    });
  });

  describe('discoverSessions()', () => {
    it('discovers the fixture session via override list', async () => {
      const source = makeSource();
      const sessions = [];
      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }

      expect(sessions).toHaveLength(1);
      const found = sessions[0];
      expect(found?.tool).toBe('claude-code');
      expect(found?.sessionId).toBe(SESSION_ID);
      expect(found?.locationHint).toBe(FIXTURE_FILE);
    });

    it('yields nothing when override list is empty', async () => {
      const source = new ClaudeCodeEnrichmentSource([]);
      const sessions = [];
      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }
      expect(sessions).toHaveLength(0);
    });
  });

  describe('readEvents()', () => {
    it('yields a metadata event as the first event', async () => {
      const source = makeSource();
      const events = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        events.push(event);
      }

      const first = events[0];
      expect(first).toBeDefined();
      expect(first?.category).toBe('metadata');
      expect(first?.ordinal).toBe(0);
    });

    it('yields events in category order: metadata → tool_result → user_interaction', async () => {
      const source = makeSource();
      const events = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        events.push(event);
      }

      const categoryOrder = ['metadata', 'tool_result', 'user_interaction'];
      const categories = events.map((e) => e.category);
      let lastIndex = -1;
      for (const cat of categories) {
        const idx = categoryOrder.indexOf(cat);
        expect(idx).toBeGreaterThanOrEqual(lastIndex);
        lastIndex = idx;
      }
    });

    it('populates required envelope fields on every event', async () => {
      const source = makeSource();
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        expect(event.schemaVersion).toBe(1);
        expect(event.tool).toBe('claude-code');
        expect(event.sessionId).toBe(SESSION_ID);
        expect(typeof event.eventId).toBe('string');
        expect(event.eventId.length).toBeGreaterThan(0);
        expect(typeof event.eventTs).toBe('string');
      }
    });

    it('yields at least one tool_result event', async () => {
      const source = makeSource();
      const events = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        events.push(event);
      }

      const toolResults = events.filter((e) => e.category === 'tool_result');
      expect(toolResults.length).toBeGreaterThan(0);
      const t = toolResults[0]!;
      expect(t.payload).toHaveProperty('toolCallId');
      expect(t.payload).toHaveProperty('toolName');
    });

    it('yields at least one user_interaction event', async () => {
      const source = makeSource();
      const events = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        events.push(event);
      }

      const interactions = events.filter((e) => e.category === 'user_interaction');
      expect(interactions.length).toBeGreaterThan(0);
      const ui = interactions[0]!;
      expect(ui.payload).toHaveProperty('turnId');
      expect(ui.payload).toHaveProperty('assistantMessages');
    });

    it('skips metadata event when cursor covers it', async () => {
      const source = makeSource();
      const cursor = {
        tool: 'claude-code' as const,
        sessionId: SESSION_ID,
        category: 'metadata',
        lastOrdinal: 0,
        lastEventId: ':claude-code:metadata:0',
        lastEventTs: new Date().toISOString(),
        lastIngestedAt: new Date().toISOString(),
      };

      const events = [];
      for await (const event of source.readEvents(FIXTURE_REF, { metadata: cursor })) {
        events.push(event);
      }

      const metadataEvents = events.filter((e) => e.category === 'metadata');
      expect(metadataEvents).toHaveLength(0);
    });

    it('skips tool_result events at or below cursor lastOrdinal', async () => {
      const source = makeSource();

      const allEvents = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        allEvents.push(event);
      }

      const allToolResults = allEvents.filter((e) => e.category === 'tool_result');
      expect(allToolResults.length).toBeGreaterThanOrEqual(1);

      const firstToolResult = allToolResults[0]!;
      const cursor = {
        tool: 'claude-code' as const,
        sessionId: SESSION_ID,
        category: 'tool_result',
        lastOrdinal: firstToolResult.ordinal,
        lastEventId: firstToolResult.eventId,
        lastEventTs: firstToolResult.eventTs,
        lastIngestedAt: new Date().toISOString(),
      };

      const resumed = [];
      for await (const event of source.readEvents(FIXTURE_REF, { tool_result: cursor })) {
        resumed.push(event);
      }

      const resumedToolResults = resumed.filter((e) => e.category === 'tool_result');
      for (const e of resumedToolResults) {
        expect(e.ordinal).toBeGreaterThan(firstToolResult.ordinal);
      }
    });

    it('produces deterministic event IDs across two reads', async () => {
      const source = makeSource();

      const firstIds: string[] = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        firstIds.push(event.eventId);
      }

      const secondIds: string[] = [];
      for await (const event of source.readEvents(FIXTURE_REF, {})) {
        secondIds.push(event.eventId);
      }

      expect(firstIds).toEqual(secondIds);
    });
  });

  describe('categoriesFor()', () => {
    it('returns the 3 expected categories', async () => {
      const categories = await makeSource().categoriesFor(FIXTURE_REF);
      expect(categories).toEqual(['metadata', 'tool_result', 'user_interaction']);
    });
  });

  describe('watch()', () => {
    it('returns a watcher with on() and close() methods', () => {
      const watcher = makeSource().watch(FIXTURE_REF);
      expect(typeof watcher.on).toBe('function');
      expect(typeof watcher.close).toBe('function');
      watcher.close();
    });

    it('returns a no-op watcher for a nonexistent file', () => {
      const ref = { tool: 'claude-code' as const, sessionId: 'ghost', locationHint: '/nonexistent/ghost.jsonl' };
      expect(() => {
        const watcher = makeSource().watch(ref);
        watcher.close();
      }).not.toThrow();
    });
  });
});
