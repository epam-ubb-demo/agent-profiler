/**
 * T12.3.3 — Deduplication tests.
 *
 * Verifies that running a full sync twice does NOT re-deliver already-synced events:
 *   1. After a complete sync, an incremental plan delivers 0 events.
 *   2. After resetting a single category's cursor, only that category is replayed.
 *   3. After a full plan reset (planFull), all events are delivered from scratch.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SessionRef } from '@agent-profiler/enrichment-core';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COPILOT_SESSIONS_ROOT = join(__dirname, '..', '..', 'fixtures', 'copilot-cli-sessions');

async function collectRefs(source: CopilotCliEnrichmentSource): Promise<SessionRef[]> {
  const refs: SessionRef[] = [];
  for await (const ref of source.discoverSessions()) {
    refs.push(ref);
  }
  return refs;
}

describe('deduplication', () => {
  it('delivers 0 events on a second incremental run after a complete first run', async () => {
    const markerStore = createFakeMarkerStore();

    // Run 1 — complete full sync
    const sink1 = new InMemorySink();
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const planner = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBeGreaterThan(0);

    // Run 2 — incremental, nothing new
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBe(0);
  });

  it('replays only the reset category after resetCategories', async () => {
    const markerStore = createFakeMarkerStore();
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const planner = new DefaultSyncPlanner(markerStore, source);

    // Full sync — commits all category cursors
    const sink1 = new InMemorySink();
    for (const ref of await collectRefs(source)) {
      const plan = await planner.planIncremental(ref);
      await orchestrator.runPlan(plan, source, [sink1]);
    }

    const totalRun1 = sink1.pushedEvents.length;
    expect(totalRun1).toBeGreaterThan(0);

    // Reset only 'metadata' cursor (1 event, ordinal 0)
    const refs = await collectRefs(source);
    const ref = refs[0];
    expect(ref).toBeDefined();
    await markerStore.resetCategories(ref!, ['metadata']);

    // Run 2 — should deliver only the metadata event again
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref2 of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref2);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // Only metadata re-delivered (exactly 1 event for the fixture)
    expect(sink2.pushedEvents.length).toBe(1);
    expect(sink2.pushedEvents[0]?.category).toBe('metadata');
  });

  it('re-delivers all events after a planFull reset', async () => {
    const markerStore = createFakeMarkerStore();
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    // Run 1 — full sync
    const sink1 = new InMemorySink();
    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    const totalRun1 = sink1.pushedEvents.length;

    // Run 2 — planFull forces full re-delivery
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planFull(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // All events delivered again
    expect(sink2.pushedEvents.length).toBe(totalRun1);

    // Same event IDs as run 1
    const ids1 = sink1.pushedEvents.map((e) => e.eventId).sort();
    const ids2 = sink2.pushedEvents.map((e) => e.eventId).sort();
    expect(ids2).toEqual(ids1);
  });

  it('each eventId is delivered exactly twice when resetAll is called between runs with the same sink', async () => {
    // Note: this test demonstrates that the orchestrator re-delivers events
    // faithfully after resetAll(). Deduplication of re-delivered events is
    // the responsibility of the sink layer, not the orchestrator.
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // Use a single sink across both runs to collect all deliveries
    const sink = new InMemorySink();
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const refs = await collectRefs(source1);

    // Run 1 — full sync, cursors committed
    for (const ref of refs) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink]);
    }

    const firstRunCount = sink.pushedEvents.length;
    expect(firstRunCount).toBeGreaterThan(0);

    // Reset all markers so the next run re-delivers from ordinal 0
    for (const ref of refs) {
      await markerStore.resetAll(ref);
    }

    // Run 2 — same sink, markers reset → full re-delivery
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink]);
    }

    // Each event was delivered exactly twice (once per run)
    expect(sink.pushedEvents.length).toBe(firstRunCount * 2);
    const idCounts = new Map<string, number>();
    for (const event of sink.pushedEvents) {
      idCounts.set(event.eventId, (idCounts.get(event.eventId) ?? 0) + 1);
    }
    for (const [, count] of idCounts) {
      expect(count).toBe(2);
    }
  });
});
