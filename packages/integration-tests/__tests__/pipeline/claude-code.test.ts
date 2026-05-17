/**
 * T12.2.4 — Claude Code pipeline integration test.
 *
 * Tests the full pipeline: ClaudeCodeEnrichmentSource → DefaultSyncPlanner
 * → DefaultSyncOrchestrator → InMemorySink with real fixture data.
 *
 * Filesystem discovery is bypassed via overrideSessions so we don't depend
 * on the Claude Code installation.
 */

import { join } from 'node:path';

import type { DiscoveredSession } from '@agent-profiler/adapters-claude-code';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import type { SessionRef } from '@agent-profiler/enrichment-core';
import { ClaudeCodeEnrichmentSource } from '@agent-profiler/source-claude-code';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { loadClaudeCodeFixture } from '@agent-profiler/test-fixtures';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

describe('claude-code pipeline integration', () => {
  const fixture = loadClaudeCodeFixture();

  const overrideSession: DiscoveredSession = {
    sessionId: fixture.sessionId,
    filePath: join(fixture.fixtureDir, 'events.jsonl'),
    projectDir: '',
    cwd: null,
  };

  async function collectSessionRefs(
    source: ClaudeCodeEnrichmentSource,
  ): Promise<SessionRef[]> {
    const refs: SessionRef[] = [];
    for await (const ref of source.discoverSessions()) {
      refs.push(ref);
    }
    return refs;
  }

  describe('full incremental sync (first run = full since no cursors)', () => {
    let sink: InMemorySink;
    let markerStore: ReturnType<typeof createFakeMarkerStore>;

    beforeEach(async () => {
      sink = new InMemorySink();
      markerStore = createFakeMarkerStore();

      const source = new ClaudeCodeEnrichmentSource([overrideSession]);
      const planner = new DefaultSyncPlanner(markerStore, source);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const refs = await collectSessionRefs(source);
      expect(refs.length).toBe(1);

      for (const ref of refs) {
        const plan = await planner.planIncremental(ref);
        await orchestrator.runPlan(plan, source, [sink]);
      }
    });

    it('delivers the expected number of events', () => {
      expect(sink.pushedEvents.length).toBe(fixture.expectedEvents.length);
    });

    it('all events carry the correct tool', () => {
      for (const event of sink.pushedEvents) {
        expect(event.tool).toBe('claude-code');
      }
    });

    it('all events carry the expected sessionId', () => {
      for (const event of sink.pushedEvents) {
        expect(event.sessionId).toBe(fixture.sessionId);
      }
    });

    it('events have strictly increasing ordinals per category', () => {
      const byCategory = new Map<string, number[]>();
      for (const event of sink.pushedEvents) {
        const ordinals = byCategory.get(event.category) ?? [];
        ordinals.push(event.ordinal);
        byCategory.set(event.category, ordinals);
      }

      for (const [_cat, ordinals] of byCategory) {
        for (let i = 1; i < ordinals.length; i++) {
          expect(ordinals[i]!).toBeGreaterThan(ordinals[i - 1]!);
        }
      }
    });

    it('covers all expected categories', () => {
      const categories = new Set(sink.pushedEvents.map((e) => e.category));
      expect(categories.has('metadata')).toBe(true);
      expect(categories.has('tool_result')).toBe(true);
      expect(categories.has('user_interaction')).toBe(true);
    });

    it('marker store has cursors for all categories after sync', async () => {
      const source = new ClaudeCodeEnrichmentSource([overrideSession]);
      const refs = await collectSessionRefs(source);
      const ref = refs[0]!;
      const marker = await markerStore.read(ref);

      expect(marker).toBeDefined();
      expect(marker?.cursors['metadata']).toBeDefined();
      expect(marker?.cursors['tool_result']).toBeDefined();
      expect(marker?.cursors['user_interaction']).toBeDefined();
    });
  });
});
