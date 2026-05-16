/**
 * Unit tests for CopilotCliEnrichmentSource.
 */

import { join } from 'node:path';

import { runSourceContractTests } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { CopilotCliEnrichmentSource } from '../src/source.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
const VALID_SESSION_PATH = join(FIXTURES_DIR, 'valid-session');

// ── Contract tests ────────────────────────────────────────────────────────────

runSourceContractTests(() => ({
  source: new CopilotCliEnrichmentSource(FIXTURES_DIR),
  fixture: { tool: 'copilot-cli', sessionId: 'valid-session', locationHint: VALID_SESSION_PATH },
}));

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('CopilotCliEnrichmentSource', () => {
  describe('tool', () => {
    it('has tool = copilot-cli', () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      expect(source.tool).toBe('copilot-cli');
    });
  });

  describe('discoverSessions()', () => {
    it('discovers the valid-session fixture', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const sessions = [];
      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const found = sessions.find((s) => s.sessionId === 'valid-session');
      expect(found).toBeDefined();
      expect(found?.tool).toBe('copilot-cli');
      expect(found?.locationHint).toBe(VALID_SESSION_PATH);
    });

    it('yields nothing when rootDir does not exist', async () => {
      const source = new CopilotCliEnrichmentSource('/nonexistent/path/xyz');
      const sessions = [];
      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }
      expect(sessions).toHaveLength(0);
    });

    it('skips directories without events files', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const sessions = [];
      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }
      // All discovered sessions must have a valid sessionId (not an empty directory)
      for (const s of sessions) {
        expect(s.sessionId).toBeTruthy();
      }
    });
  });

  describe('readEvents()', () => {
    it('yields a metadata event as the first event', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const events = [];
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }

      const first = events[0];
      expect(first).toBeDefined();
      expect(first?.category).toBe('metadata');
      expect(first?.ordinal).toBe(0);
    });

    it('yields events in category order: metadata → utilisation → compaction → tool_result', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const events = [];
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }

      const categories = events.map((e) => e.category);
      const categoryOrder = ['metadata', 'utilisation', 'compaction', 'tool_result'];
      let lastIndex = -1;
      for (const cat of categories) {
        const idx = categoryOrder.indexOf(cat);
        expect(idx).toBeGreaterThanOrEqual(lastIndex);
        lastIndex = idx;
      }
    });

    it('populates required envelope fields on every event', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      for await (const event of source.readEvents(ref, {})) {
        expect(event.schemaVersion).toBe(1);
        expect(event.tool).toBe('copilot-cli');
        expect(event.sessionId).toBe('valid-session');
        expect(typeof event.eventId).toBe('string');
        expect(event.eventId.length).toBeGreaterThan(0);
        expect(typeof event.eventTs).toBe('string');
      }
    });

    it('yields compaction events with correct payload fields', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const events = [];
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }

      const compactions = events.filter((e) => e.category === 'compaction');
      expect(compactions.length).toBeGreaterThan(0);
      const c = compactions[0]!;
      expect(c.payload).toHaveProperty('inputTokens');
      expect(c.payload).toHaveProperty('outputTokens');
      expect(c.payload).toHaveProperty('cacheRead');
      expect(c.payload).toHaveProperty('cacheWrite');
    });

    it('yields tool_result events with correct payload fields', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const events = [];
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }

      const toolResults = events.filter((e) => e.category === 'tool_result');
      expect(toolResults.length).toBeGreaterThan(0);
      const t = toolResults[0]!;
      expect(t.payload).toHaveProperty('toolCallId');
      expect(t.payload).toHaveProperty('toolName');
    });

    it('skips events at or below cursor lastOrdinal (metadata)', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };

      const cursor = {
        tool: 'copilot-cli' as const,
        sessionId: 'valid-session',
        category: 'metadata',
        lastOrdinal: 0,
        lastEventId: ':valid-session:metadata:0',
        lastEventTs: new Date().toISOString(),
        lastIngestedAt: new Date().toISOString(),
      };

      const events = [];
      for await (const event of source.readEvents(ref, { metadata: cursor })) {
        events.push(event);
      }

      const metadataEvents = events.filter((e) => e.category === 'metadata');
      expect(metadataEvents).toHaveLength(0);
    });

    it('skips tool_result events at or below cursor lastOrdinal', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };

      // First read to find how many tool_result events there are
      const allEvents = [];
      for await (const event of source.readEvents(ref, {})) {
        allEvents.push(event);
      }

      const allToolResults = allEvents.filter((e) => e.category === 'tool_result');
      expect(allToolResults.length).toBeGreaterThan(1);

      // Create cursor at ordinal 0 — should skip event at ordinal 0
      const firstToolResult = allToolResults[0]!;
      const cursor = {
        tool: 'copilot-cli' as const,
        sessionId: 'valid-session',
        category: 'tool_result',
        lastOrdinal: firstToolResult.ordinal,
        lastEventId: firstToolResult.eventId,
        lastEventTs: firstToolResult.eventTs,
        lastIngestedAt: new Date().toISOString(),
      };

      const resumed = [];
      for await (const event of source.readEvents(ref, { tool_result: cursor })) {
        resumed.push(event);
      }

      const resumedToolResults = resumed.filter((e) => e.category === 'tool_result');
      expect(resumedToolResults.length).toBe(allToolResults.length - 1);
      for (const e of resumedToolResults) {
        expect(e.ordinal).toBeGreaterThan(firstToolResult.ordinal);
      }
    });

    it('produces deterministic event IDs across two reads', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };

      const firstIds: string[] = [];
      for await (const event of source.readEvents(ref, {})) {
        firstIds.push(event.eventId);
      }

      const secondIds: string[] = [];
      for await (const event of source.readEvents(ref, {})) {
        secondIds.push(event.eventId);
      }

      expect(firstIds).toEqual(secondIds);
    });
  });

  describe('categoriesFor()', () => {
    it('returns the 4 expected categories', async () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const categories = await source.categoriesFor(ref);

      expect(categories).toEqual(['metadata', 'utilisation', 'compaction', 'tool_result']);
    });
  });

  describe('watch()', () => {
    it('returns a watcher with on() and close() methods', () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'valid-session', locationHint: VALID_SESSION_PATH };
      const watcher = source.watch(ref);

      expect(typeof watcher.on).toBe('function');
      expect(typeof watcher.close).toBe('function');

      watcher.close();
    });

    it('returns a no-op watcher for a nonexistent directory', () => {
      const source = new CopilotCliEnrichmentSource(FIXTURES_DIR);
      const ref = { tool: 'copilot-cli' as const, sessionId: 'ghost', locationHint: '/nonexistent/ghost' };
      expect(() => {
        const watcher = source.watch(ref);
        watcher.close();
      }).not.toThrow();
    });
  });
});
