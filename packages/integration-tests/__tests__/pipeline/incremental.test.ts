/**
 * T12.2.6 — Incremental sync pipeline integration test.
 *
 * Verifies that on a second sync run after a marker has been written, no
 * duplicate events are delivered to the sink (because planIncremental reads
 * cursors and starts from lastOrdinal + 1).
 *
 * Uses VS Code Chat as the test source (any source would work, but vscode-chat
 * uses overrideSessions for determinism without OS-specific paths).
 */

import { join } from 'node:path';

import type { DiscoveredSession } from '@agent-profiler/adapters-vscode-chat';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import type { EnrichmentEvent, SessionRef } from '@agent-profiler/enrichment-core';
import { VsCodeChatEnrichmentSource } from '@agent-profiler/source-vscode-chat';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { loadVsCodeChatFixture } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

describe('incremental sync deduplication', () => {
  const fixture = loadVsCodeChatFixture();

  const overrideSession: DiscoveredSession = {
    sessionId: fixture.sessionId,
    filePath: join(fixture.fixtureDir, 'transcript.jsonl'),
    workspaceDir: '',
    variant: 'stable' as const,
  };

  async function collectRefs(source: VsCodeChatEnrichmentSource): Promise<SessionRef[]> {
    const refs: SessionRef[] = [];
    for await (const ref of source.discoverSessions()) {
      refs.push(ref);
    }
    return refs;
  }

  /** Read events directly from the source to establish ground-truth count. */
  async function readAllSourceEvents(): Promise<EnrichmentEvent[]> {
    const source = new VsCodeChatEnrichmentSource([overrideSession]);
    const events: EnrichmentEvent[] = [];
    for await (const ref of source.discoverSessions()) {
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }
    }
    return events;
  }

  it('second incremental run delivers zero events (no new data)', async () => {
    // Establish ground-truth count
    const allSourceEvents = await readAllSourceEvents();
    const totalSourceCount = allSourceEvents.length;
    expect(totalSourceCount).toBeGreaterThan(0);

    // Shared state: same marker store across both runs
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    // --- First run ---
    const sink1 = new InMemorySink();
    const source1 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBe(totalSourceCount);

    // --- Second run (same data, same marker store with cursors already written) ---
    const sink2 = new InMemorySink();
    const source2 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // No new events should have been delivered on the second pass
    expect(sink2.pushedEvents.length).toBe(0);
  });

  it('planFull re-delivers all events even after prior sync', async () => {
    // Establish ground-truth count
    const totalSourceCount = (await readAllSourceEvents()).length;
    expect(totalSourceCount).toBeGreaterThan(0);

    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    // --- First run (incremental) ---
    const sink1 = new InMemorySink();
    const source1 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBe(totalSourceCount);

    // --- Second run: planFull should reset cursors and re-deliver everything ---
    const sink2 = new InMemorySink();
    const source2 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planFull(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBe(totalSourceCount);
  });

  it('resetting a category cursor causes only that category to be re-delivered on next incremental run', async () => {
    // Establish ground-truth count
    const allSourceEvents = await readAllSourceEvents();
    expect(allSourceEvents.length).toBeGreaterThan(0);

    // Shared state across all runs
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    // --- First run: full incremental sync (delivers everything) ---
    const sink1 = new InMemorySink();
    const source1 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const refs = await collectRefs(source1);

    for (const ref of refs) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBe(allSourceEvents.length);

    // --- Simulate new data arriving: reset the 'metadata' cursor so the next
    //     incremental run re-delivers only 'metadata' events. This mimics the
    //     scenario where the marker is behind the source (new data appended). ---
    for (const ref of refs) {
      await markerStore.resetCategories(ref, ['metadata']);
    }

    // --- Second run: incremental after cursor reset ---
    const sink2 = new InMemorySink();
    const source2 = new VsCodeChatEnrichmentSource([overrideSession]);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // Only 'metadata' events should have been re-delivered (delta delivery)
    expect(sink2.pushedEvents.length).toBeGreaterThan(0);
    expect(sink2.pushedEvents.length).toBeLessThan(allSourceEvents.length);
    for (const event of sink2.pushedEvents) {
      expect(event.category).toBe('metadata');
    }
  });
});
