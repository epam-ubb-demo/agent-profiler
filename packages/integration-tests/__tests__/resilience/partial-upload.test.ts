/**
 * T12.3.2 — Partial upload tests.
 *
 * Verifies that when one category fails mid-sync:
 *   1. Successfully processed categories have their cursors written to the marker.
 *   2. The failed category's cursor is NOT advanced (events will be replayed on retry).
 *   3. A subsequent run without failure completes only the outstanding events.
 *
 * "Partial upload" means some — but not all — categories complete successfully.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnrichmentEvent, EnrichmentSink, PushResult, SessionRef } from '@agent-profiler/enrichment-core';
import { RetriableSinkError } from '@agent-profiler/enrichment-core';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { DefaultSyncOrchestrator, DefaultSyncPlanner, FileMarkerStore } from '@agent-profiler/sync-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('partial upload', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'resilience-partial-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('commits cursors only for categories that completed successfully', async () => {
    const markerStore = new FileMarkerStore(tmpDir);

    // Fail after 1 event so that 'metadata' (ordinal 0, 1 event) completes
    // but the subsequent category is interrupted.
    const sink = new InMemorySink({ failAfterPushCount: 1 });
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1, maxRetries: 0 });
    const planner = new DefaultSyncPlanner(markerStore, source);

    const refs = await collectRefs(source);
    for (const ref of refs) {
      const plan = await planner.planIncremental(ref);
      await orchestrator.runPlan(plan, source, [sink]);
    }

    expect(sink.pushedEvents.length).toBe(1);

    // Exactly the 'metadata' cursor (1 event → ordinal 0) should be present
    const ref = refs[0];
    expect(ref).toBeDefined();
    const marker = await markerStore.read(ref!);
    expect(marker).toBeDefined();
    expect(marker!.cursors['metadata']).toBeDefined();
    expect(marker!.cursors['metadata']!.lastOrdinal).toBe(0);
  });

  it('completes remaining events on the next run', async () => {
    const markerStore = new FileMarkerStore(tmpDir);

    // Run 1: partial — only metadata category finishes (1 event)
    const sink1 = new InMemorySink({ failAfterPushCount: 1 });
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator1 = new DefaultSyncOrchestrator(markerStore, { batchSize: 1, maxRetries: 0 });
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planIncremental(ref);
      await orchestrator1.runPlan(plan, source1, [sink1]);
    }

    const run1Count = sink1.pushedEvents.length;
    expect(run1Count).toBe(1);

    // Run 2: no failure — must deliver only the remaining events (not repeat metadata)
    const sink2 = new InMemorySink();
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator2 = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator2.runPlan(plan, source2, [sink2]);
    }

    // metadata was already committed in run 1 — run 2 must NOT re-deliver it
    const run2Ids = new Set(sink2.pushedEvents.map((e) => e.eventId));
    const run1Ids = new Set(sink1.pushedEvents.map((e) => e.eventId));
    for (const id of run1Ids) {
      expect(run2Ids.has(id)).toBe(false);
    }

    // And run 2 must still deliver something (the un-committed categories)
    expect(sink2.pushedEvents.length).toBeGreaterThan(0);
  });

  it('orchestrator retries and accepts events when sink throws RetriableSinkError transiently', async () => {
    // Uses a vi.fn() push that throws RetriableSinkError on its very first
    // invocation then succeeds on all subsequent calls. Verifies that the
    // orchestrator's retry logic kicks in and events are ultimately accepted.
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, {
      batchSize: 10,
      maxRetries: 3,
      baseRetryDelayMs: 0,
    });
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner = new DefaultSyncPlanner(markerStore, source);

    let invocationCount = 0;
    const pushFn = vi.fn(async (batch: readonly EnrichmentEvent[]): Promise<PushResult> => {
      if (invocationCount++ === 0) {
        throw new RetriableSinkError('Transient failure', 0);
      }
      return { acceptedOrdinals: batch.map((e) => e.ordinal), rejected: [] };
    });

    const retrySink: EnrichmentSink = {
      id: 'retry-test-sink',
      availability: async () => true,
      supportsCategory: () => true,
      push: pushFn,
    };

    let lastUpdate: Awaited<ReturnType<typeof orchestrator.runPlan>> | undefined;
    for (const ref of await collectRefs(source)) {
      const plan = await planner.planFull(ref);
      lastUpdate = await orchestrator.runPlan(plan, source, [retrySink]);
    }

    // push was called more than once — at least one retry occurred
    expect(pushFn.mock.calls.length).toBeGreaterThan(1);
    // Events were eventually accepted despite the initial transient failure
    expect(lastUpdate?.eventsAccepted).toBeGreaterThan(0);
  });
});
