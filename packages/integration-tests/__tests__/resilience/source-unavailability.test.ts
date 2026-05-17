/**
 * T12.3.5 — Source unavailability tests.
 *
 * Verifies orchestrator behaviour when the enrichment source fails to produce
 * events (throws in readEvents). The orchestrator must:
 *   1. NOT throw from runPlan() — the error is captured at category level.
 *   2. NOT advance the marker cursor for the failing category.
 *   3. Report a JobUpdate with state='error'.
 *   4. Leave markers untouched when no batches succeed.
 *
 * Uses an inline SessionEnrichmentSource whose readEvents() throws for all
 * categories, leaving the marker store completely untouched.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  EnrichmentCursor,
  EnrichmentEvent,
  SessionEnrichmentSource,
  SessionRef,
  SessionWatcher,
} from '@agent-profiler/enrichment-core';
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

/** A source whose readEvents() always throws, simulating an unavailable upstream. */
class AlwaysFailingSource implements SessionEnrichmentSource {
  readonly tool = 'copilot-cli' as const;

  async *discoverSessions(): AsyncGenerator<SessionRef> {
    yield { tool: 'copilot-cli', sessionId: 'test-session-1', locationHint: '' };
  }

  async *readEvents(
    _ref: SessionRef,
    _cursors: Readonly<Record<string, EnrichmentCursor | undefined>>,
  ): AsyncGenerator<EnrichmentEvent> {
    throw new Error('Source unavailable');
  }

  watch(_ref: SessionRef): SessionWatcher {
    return {
      on(_event: 'change', _handler: (ref: SessionRef) => void): void {
        // no-op
      },
      close(): void {
        // no-op
      },
    };
  }

  async categoriesFor(_ref: SessionRef): Promise<readonly string[]> {
    return ['metadata'];
  }
}

describe('source unavailability', () => {
  it('orchestrator does not throw when source.readEvents() throws', async () => {
    const markerStore = createFakeMarkerStore();
    const failingSource = new AlwaysFailingSource();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner = new DefaultSyncPlanner(markerStore, failingSource);
    const sink = new InMemorySink();

    for await (const ref of failingSource.discoverSessions()) {
      const plan = await planner.planFull(ref);
      // Must not throw
      await expect(orchestrator.runPlan(plan, failingSource, [sink])).resolves.toBeDefined();
    }
  });

  it('no events are delivered when source throws', async () => {
    const markerStore = createFakeMarkerStore();
    const failingSource = new AlwaysFailingSource();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner = new DefaultSyncPlanner(markerStore, failingSource);
    const sink = new InMemorySink();

    for await (const ref of failingSource.discoverSessions()) {
      const plan = await planner.planFull(ref);
      await orchestrator.runPlan(plan, failingSource, [sink]);
    }

    expect(sink.pushedEvents.length).toBe(0);
  });

  it('marker cursor is not advanced when source throws', async () => {
    const markerStore = createFakeMarkerStore();
    const failingSource = new AlwaysFailingSource();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner = new DefaultSyncPlanner(markerStore, failingSource);
    const sink = new InMemorySink();

    const ref: SessionRef = { tool: 'copilot-cli', sessionId: 'test-session-1', locationHint: '' };
    const plan = await planner.planFull(ref);
    await orchestrator.runPlan(plan, failingSource, [sink]);

    // Marker must remain absent (no successful batch was ever committed)
    const marker = await markerStore.read(ref);
    const metadataCursor = marker?.cursors['metadata'];
    expect(metadataCursor).toBeUndefined();
  });

  it('orchestrator reports error state when all categories fail', async () => {
    const markerStore = createFakeMarkerStore();
    const failingSource = new AlwaysFailingSource();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner = new DefaultSyncPlanner(markerStore, failingSource);
    const sink = new InMemorySink();

    let lastUpdate: Awaited<ReturnType<typeof orchestrator.runPlan>> | undefined;
    for await (const ref of failingSource.discoverSessions()) {
      const plan = await planner.planFull(ref);
      lastUpdate = await orchestrator.runPlan(plan, failingSource, [sink]);
    }

    expect(lastUpdate).toBeDefined();
    expect(lastUpdate!.state).toBe('error');
  });

  it('CopilotCli source delivers all events normally (unaffected by a failing sibling)', async () => {
    // Verify that the orchestrator processes a working source correctly regardless
    // of whether other sources would fail.
    const markerStore = createFakeMarkerStore();
    const workingSource = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const planner = new DefaultSyncPlanner(markerStore, workingSource);
    const sink = new InMemorySink();

    for (const ref of await collectRefs(workingSource)) {
      const plan = await planner.planFull(ref);
      await orchestrator.runPlan(plan, workingSource, [sink]);
    }

    // Working source delivers all events normally
    expect(sink.pushedEvents.length).toBeGreaterThan(0);
  });

  it('working source delivers events when run in the same sync loop as a failing source', async () => {
    // Verifies that a failing source does not prevent a working source from
    // delivering its events when both are processed by the same orchestrator
    // and sink within a single sync cycle.
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });
    const sink = new InMemorySink();

    // Run failing source first — orchestrator must not crash
    const failingSource = new AlwaysFailingSource();
    const failingPlanner = new DefaultSyncPlanner(markerStore, failingSource);
    let failingJobUpdate: Awaited<ReturnType<typeof orchestrator.runPlan>> | undefined;
    for await (const ref of failingSource.discoverSessions()) {
      const plan = await failingPlanner.planFull(ref);
      failingJobUpdate = await orchestrator.runPlan(plan, failingSource, [sink]);
    }

    // Failing source must report error state and deliver no events
    expect(failingJobUpdate?.state).toBe('error');
    expect(sink.pushedEvents.length).toBe(0);

    // Run working source next — same orchestrator, same sink
    const workingSource = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const workingPlanner = new DefaultSyncPlanner(markerStore, workingSource);
    for (const ref of await collectRefs(workingSource)) {
      const plan = await workingPlanner.planFull(ref);
      await orchestrator.runPlan(plan, workingSource, [sink]);
    }

    // Working source delivers its events unaffected by the earlier failure
    expect(sink.pushedEvents.length).toBeGreaterThan(0);
  });
});
