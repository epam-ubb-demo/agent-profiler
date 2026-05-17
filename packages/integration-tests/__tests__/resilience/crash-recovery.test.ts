/**
 * T12.3.1 — Crash recovery tests.
 *
 * Simulates an orchestrator crash mid-batch and verifies that:
 *   1. A second run resumes from the last committed marker (no gaps, no duplicates).
 *   2. Markers only reflect successfully committed batches, not the crash point.
 *
 * Uses a real FileMarkerStore so that marker persistence survives across
 * orchestrator instances (matching real-world crash recovery semantics).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnrichmentEvent, SessionRef } from '@agent-profiler/enrichment-core';
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

describe('crash recovery', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'resilience-crash-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('resumes from last committed marker after crash', async () => {
    const allSourceEvents = await readAllSourceEvents();
    const totalSourceCount = allSourceEvents.length;
    expect(totalSourceCount).toBeGreaterThan(0);

    const markerStore = new FileMarkerStore(tmpDir);

    // --- Run 1: crash after accepting some events ---
    // Default batchSize means each category is processed as one batch.
    // failAfterPushCount:2 causes a throw at the start of the third category's
    // push (once ≥2 events have already been accepted across prior batches).
    // The first two categories' cursors are committed; the rest are not.
    const sink1 = new InMemorySink({ failAfterPushCount: 2 });
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator1 = new DefaultSyncOrchestrator(markerStore, { maxRetries: 0 });
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator1.runPlan(plan, source1, [sink1]);
    }

    // Some events were committed before the simulated crash
    expect(sink1.pushedEvents.length).toBeGreaterThan(0);
    expect(sink1.pushedEvents.length).toBeLessThan(totalSourceCount);

    // --- Run 2: fresh sink, same FileMarkerStore — recovery ---
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator2 = new DefaultSyncOrchestrator(markerStore);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator2.runPlan(plan, source2, [sink2]);
    }

    // Together the two runs cover every source event exactly once
    const totalDelivered = sink1.pushedEvents.length + sink2.pushedEvents.length;
    expect(totalDelivered).toBe(totalSourceCount);

    // No duplicate eventIds across the two runs
    const allEventIds = new Set([
      ...sink1.pushedEvents.map((e) => e.eventId),
      ...sink2.pushedEvents.map((e) => e.eventId),
    ]);
    expect(allEventIds.size).toBe(totalSourceCount);
  });

  it('markers reflect only committed batches after crash', async () => {
    const markerStore = new FileMarkerStore(tmpDir);

    // --- Run 1: crash after committed events ---
    const sink1 = new InMemorySink({ failAfterPushCount: 2 });
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator1 = new DefaultSyncOrchestrator(markerStore, { maxRetries: 0 });
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    const refs = await collectRefs(source1);
    for (const ref of refs) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator1.runPlan(plan, source1, [sink1]);
    }

    // Marker must exist and reflect at least one committed category cursor
    const ref = refs[0];
    expect(ref).toBeDefined();
    const markerAfterCrash = await markerStore.read(ref!);

    expect(markerAfterCrash).toBeDefined();
    expect(Object.keys(markerAfterCrash!.cursors).length).toBeGreaterThan(0);

    // A recovery run must still deliver events — confirming the marker did not
    // advance all the way to the end of the source (it stopped at the crash point).
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator2 = new DefaultSyncOrchestrator(markerStore);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref2 of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref2);
      await orchestrator2.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBeGreaterThan(0);
  });
});
