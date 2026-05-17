/**
 * T12.2.2 — Copilot CLI pipeline integration test.
 *
 * Tests the full pipeline: CopilotCliEnrichmentSource → DefaultSyncPlanner
 * → DefaultSyncOrchestrator → InMemorySink with real fixture data.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnrichmentEvent, SessionRef } from '@agent-profiler/enrichment-core';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The integration-tests package ships its own fixture directory so that
 * CopilotCliEnrichmentSource.discoverSessions() finds exactly one session,
 * with no cross-contamination from other fixture types.
 */
const COPILOT_SESSIONS_ROOT = join(__dirname, '..', '..', 'fixtures', 'copilot-cli-sessions');

describe('copilot-cli pipeline integration', () => {
  async function collectSessionRefs(source: CopilotCliEnrichmentSource): Promise<SessionRef[]> {
    const refs: SessionRef[] = [];
    for await (const ref of source.discoverSessions()) {
      refs.push(ref);
    }
    return refs;
  }

  /** Read all events from source directly for a ground-truth count. */
  async function readAllSourceEvents(): Promise<EnrichmentEvent[]> {
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const events: EnrichmentEvent[] = [];
    for await (const ref of source.discoverSessions()) {
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }
    }
    return events;
  }

  describe('full incremental sync (first run = full since no cursors)', () => {
    let sink: InMemorySink;
    let markerStore: ReturnType<typeof createFakeMarkerStore>;
    let sourceEventCount: number;

    beforeEach(async () => {
      sink = new InMemorySink();
      markerStore = createFakeMarkerStore();

      // Establish ground-truth count from direct source read
      sourceEventCount = (await readAllSourceEvents()).length;

      const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
      const planner = new DefaultSyncPlanner(markerStore, source);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const refs = await collectSessionRefs(source);
      expect(refs.length).toBeGreaterThan(0);

      for (const ref of refs) {
        const plan = await planner.planIncremental(ref);
        await orchestrator.runPlan(plan, source, [sink]);
      }
    });

    it('delivers events to the sink', () => {
      expect(sink.pushedEvents.length).toBeGreaterThan(0);
    });

    it('delivers the expected number of events', () => {
      expect(sourceEventCount).toBeGreaterThan(0);
      expect(sink.pushedEvents.length).toBe(sourceEventCount);
    });

    it('all events carry the correct tool', () => {
      for (const event of sink.pushedEvents) {
        expect(event.tool).toBe('copilot-cli');
      }
    });

    it('events have strictly increasing ordinals per (sessionId, category)', () => {
      const byKey = new Map<string, number[]>();
      for (const event of sink.pushedEvents) {
        const key = `${event.sessionId}:${event.category}`;
        const ordinals = byKey.get(key) ?? [];
        ordinals.push(event.ordinal);
        byKey.set(key, ordinals);
      }

      for (const [_key, ordinals] of byKey) {
        for (let i = 1; i < ordinals.length; i++) {
          expect(ordinals[i]!).toBeGreaterThan(ordinals[i - 1]!);
        }
      }
    });

    it('covers all expected categories', () => {
      const categories = new Set(sink.pushedEvents.map((e) => e.category));
      expect(categories.has('metadata')).toBe(true);
      expect(categories.has('compaction')).toBe(true);
      expect(categories.has('tool_result')).toBe(true);
    });

    it('marker store has cursors for all synced categories after sync', async () => {
      const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
      const refs = await collectSessionRefs(source);
      const ref = refs.find((r) => r.sessionId === 'golden-copilot-001') ?? refs[0]!;
      const marker = await markerStore.read(ref);

      expect(marker).toBeDefined();
      // Verify at least metadata cursor exists; categories depend on fixture content
      expect(marker?.cursors['metadata']).toBeDefined();
      expect(marker?.cursors['compaction']).toBeDefined();
      expect(marker?.cursors['tool_result']).toBeDefined();
    });
  });
});
