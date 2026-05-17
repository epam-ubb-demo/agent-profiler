/**
 * T12.3.6 — Full re-upload tests.
 *
 * Verifies that planFull always triggers a complete re-delivery from ordinal 0,
 * regardless of the existing marker state:
 *   1. After a complete incremental sync, planFull re-delivers all events.
 *   2. planFull run count == incremental run count (same total events).
 *   3. Event IDs from planFull match those from the original incremental run.
 *   4. planFull works correctly even when no prior marker exists.
 *   5. After planFull, a subsequent incremental run delivers 0 events.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SessionRef } from '@agent-profiler/enrichment-core';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { DefaultSyncOrchestrator, DefaultSyncPlanner, FileMarkerStore } from '@agent-profiler/sync-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('full re-upload', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'resilience-reupload-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('planFull delivers same event IDs as the original incremental run', async () => {
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // Run 1 — incremental baseline
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const sink1 = new InMemorySink();

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBeGreaterThan(0);

    // Run 2 — planFull forces full re-upload
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    const sink2 = new InMemorySink();

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planFull(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // Same total count
    expect(sink2.pushedEvents.length).toBe(sink1.pushedEvents.length);

    // Same event IDs in the same delivery order — planFull preserves ordinal order
    const ids1 = sink1.pushedEvents.map((e) => e.eventId);
    const ids2 = sink2.pushedEvents.map((e) => e.eventId);
    expect(ids2).toEqual(ids1);
  });

  it('planFull works correctly when no prior marker exists', async () => {
    const markerStore = new FileMarkerStore(tmpDir); // empty directory — no markers
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const planner = new DefaultSyncPlanner(markerStore, source);
    const sink = new InMemorySink();

    for (const ref of await collectRefs(source)) {
      const plan = await planner.planFull(ref);
      await expect(orchestrator.runPlan(plan, source, [sink])).resolves.toBeDefined();
    }

    expect(sink.pushedEvents.length).toBeGreaterThan(0);
  });

  it('incremental run after planFull delivers 0 events', async () => {
    const markerStore = new FileMarkerStore(tmpDir);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // planFull run — writes fresh cursors
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const sink1 = new InMemorySink();

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planFull(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBeGreaterThan(0);

    // Incremental run — marker is now up-to-date; nothing new to deliver
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    const sink2 = new InMemorySink();

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBe(0);
  });

  it('planFull always ignores the existing marker and starts from ordinal 0', async () => {
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // Run 1 — incremental to advance cursors
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const sink1 = new InMemorySink();

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    // Confirm cursors were advanced
    const refs = await collectRefs(source1);
    const ref = refs[0];
    expect(ref).toBeDefined();
    const markerAfterIncremental = await markerStore.read(ref!);
    expect(markerAfterIncremental).toBeDefined();
    expect(Object.keys(markerAfterIncremental!.cursors).length).toBeGreaterThan(0);

    // Run 2 — planFull should deliver everything again, ignoring advanced cursors
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    const sink2 = new InMemorySink();

    for (const ref2 of await collectRefs(source2)) {
      const plan = await planner2.planFull(ref2);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // Full re-upload delivers all events from ordinal 0
    expect(sink2.pushedEvents.length).toBe(sink1.pushedEvents.length);
  });

  it('resetAll() on a FileMarkerStore forces complete re-delivery with a fresh sink', async () => {
    // Verifies the resetAll() recovery path: all category cursors are wiped,
    // a subsequent incremental run behaves like a planFull (re-delivers everything).
    const markerStore = new FileMarkerStore(tmpDir);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // Run 1 — full incremental sync, cursors committed to disk
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const sink1 = new InMemorySink();
    const refs = await collectRefs(source1);

    for (const ref of refs) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBeGreaterThan(0);
    const baselineIds = sink1.pushedEvents.map((e) => e.eventId);

    // Reset all markers for each discovered ref
    for (const ref of refs) {
      await markerStore.resetAll(ref);
    }

    // Run 2 — new sink, same store (now reset) → full re-delivery
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    const sink2 = new InMemorySink();

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    // All events re-delivered in the same order as the original run
    expect(sink2.pushedEvents.length).toBe(sink1.pushedEvents.length);
    const redeliveredIds = sink2.pushedEvents.map((e) => e.eventId);
    expect(redeliveredIds).toEqual(baselineIds);
  });
});
