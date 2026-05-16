import { RetriableSinkError } from '@agent-profiler/enrichment-core';
import type { EnrichmentEvent, EnrichmentSink, SessionEnrichmentSource } from '@agent-profiler/enrichment-core';
import {
  createFakeMarkerStore,
  createFakeSink,
  createFakeSource,
  createTestEvent,
  createTestMarker,
  createTestSessionRef,
} from '@agent-profiler/enrichment-core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DefaultSyncOrchestrator } from '../src/sync-orchestrator.js';
import type { JobUpdate } from '../src/sync-orchestrator.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvents(
  count: number,
  category: string,
  startOrdinal = 0,
): EnrichmentEvent[] {
  return Array.from({ length: count }, (_, i) =>
    createTestEvent('copilot-cli', 'session-1', category, startOrdinal + i),
  );
}

function makeSourceWithEvents(events: EnrichmentEvent[]): SessionEnrichmentSource {
  return {
    ...createFakeSource('copilot-cli'),
    async *readEvents() {
      for (const e of events) yield e;
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DefaultSyncOrchestrator', () => {
  const ref = createTestSessionRef('copilot-cli', 'session-1');

  describe('plan modes', () => {
    it('runs an incremental plan and pushes events', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');
      const events = makeEvents(3, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(pushSpy).toHaveBeenCalledOnce();
      expect(result.state).toBe('done');
      expect(result.eventsAccepted).toBe(3);
    });

    it('runs a full plan and sets lastFullReuploadAt on the marker', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const events = makeEvents(2, 'metadata');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'metadata', fromOrdinal: 0, resetCursor: true }], mode: 'full' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.lastFullReuploadAt).toBeDefined();
      expect(typeof marker?.lastFullReuploadAt).toBe('string');
    });

    it('runs a selective plan and only pushes specified categories', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');
      const events = [
        ...makeEvents(2, 'metadata'),
        ...makeEvents(2, 'turns'),
      ];
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = {
        ref,
        categories: [{ category: 'metadata', fromOrdinal: 0, resetCursor: true }],
        mode: 'selective' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      // Only metadata events should be pushed
      const allPushed = pushSpy.mock.calls.flatMap(([batch]) => batch as EnrichmentEvent[]);
      expect(allPushed.every((e) => e.category === 'metadata')).toBe(true);
    });
  });

  describe('batching', () => {
    it('splits events into batches of batchSize', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');
      const events = makeEvents(5, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 2 });

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      // 5 events / batchSize 2 → batches of 2, 2, 1
      expect(pushSpy).toHaveBeenCalledTimes(3);
      expect((pushSpy.mock.calls[0]?.[0] as EnrichmentEvent[]).length).toBe(2);
      expect((pushSpy.mock.calls[1]?.[0] as EnrichmentEvent[]).length).toBe(2);
      expect((pushSpy.mock.calls[2]?.[0] as EnrichmentEvent[]).length).toBe(1);
    });

    it('handles events that exactly fill one batch', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');
      const events = makeEvents(4, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 4 });

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      expect(pushSpy).toHaveBeenCalledOnce();
    });
  });

  describe('cursor advancement', () => {
    it('writes marker with cursor after successful push', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const events = makeEvents(3, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.cursors['turns']?.lastOrdinal).toBe(2); // ordinal of last event (0-indexed)
    });

    it('preserves existing cursors for other categories', async () => {
      const markerStore = createFakeMarkerStore();
      const existingMarker = createTestMarker('copilot-cli', ref.sessionId, {
        metadata: { tool: 'copilot-cli', sessionId: ref.sessionId, category: 'metadata', lastOrdinal: 5, lastEventId: 'e5', lastEventTs: new Date().toISOString(), lastIngestedAt: new Date().toISOString() },
      });
      await markerStore.write(ref, existingMarker);

      const sink = createFakeSink();
      const events = makeEvents(2, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      // metadata cursor should be preserved
      expect(marker?.cursors['metadata']?.lastOrdinal).toBe(5);
      // turns cursor should be updated
      expect(marker?.cursors['turns']?.lastOrdinal).toBe(1);
    });

    it('respects fromOrdinal and skips earlier events', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');
      // Events 0..4, but we want to start from ordinal 3
      const events = makeEvents(5, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 3, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls.flatMap(([batch]) => batch as EnrichmentEvent[]);
      expect(pushed.every((e) => e.ordinal >= 3)).toBe(true);
      expect(pushed.length).toBe(2); // ordinals 3, 4
    });
  });

  describe('retry on RetriableSinkError', () => {
    it('retries up to maxRetries and succeeds on last attempt', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(1, 'turns');
      const source = makeSourceWithEvents(events);

      let callCount = 0;
      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 3) throw new RetriableSinkError('rate limited', 0);
          return { acceptedOrdinals: [0], rejected: [] };
        }),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        maxRetries: 3,
        baseRetryDelayMs: 0,
      });

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(callCount).toBe(3);
      expect(result.state).toBe('done');
    });

    it('fails category after maxRetries exceeded', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(1, 'turns');
      const source = makeSourceWithEvents(events);

      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn().mockRejectedValue(new RetriableSinkError('always fails', 0)),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        maxRetries: 2,
        baseRetryDelayMs: 0,
      });

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(result.state).toBe('error');
      expect(result.error).toContain('always fails');
    });

    it('uses retryAfterMs from the error when provided', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(1, 'turns');
      const source = makeSourceWithEvents(events);

      const sleepTimes: number[] = [];
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms: number) => {
        sleepTimes.push(ms);
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn()
          .mockRejectedValueOnce(new RetriableSinkError('retry', 1500))
          .mockResolvedValue({ acceptedOrdinals: [0], rejected: [] }),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        maxRetries: 2,
        baseRetryDelayMs: 500,
      });

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      expect(sleepTimes).toContain(1500);
      vi.restoreAllMocks();
    });
  });

  describe('non-retriable errors', () => {
    it('stops the failing category but continues with subsequent categories', async () => {
      const markerStore = createFakeMarkerStore();

      const events: EnrichmentEvent[] = [
        createTestEvent('copilot-cli', ref.sessionId, 'turns', 0),
        createTestEvent('copilot-cli', ref.sessionId, 'metadata', 0),
      ];
      const source = makeSourceWithEvents(events);

      let turnsPushed = false;
      let metadataPushed = false;

      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn().mockImplementation(async (batch: readonly EnrichmentEvent[]) => {
          if (batch[0]?.category === 'turns') {
            turnsPushed = true;
            throw new Error('non-retriable');
          }
          metadataPushed = true;
          return { acceptedOrdinals: batch.map((e) => e.ordinal), rejected: [] };
        }),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore, { baseRetryDelayMs: 0 });
      const plan = {
        ref,
        categories: [
          { category: 'turns', fromOrdinal: 0, resetCursor: false },
          { category: 'metadata', fromOrdinal: 0, resetCursor: false },
        ],
        mode: 'incremental' as const,
      };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(turnsPushed).toBe(true);
      expect(metadataPushed).toBe(true);
      expect(result.state).toBe('error');
      expect(result.categoriesDone).toBe(2);
    });
  });

  describe('multi-sink push', () => {
    it('pushes each batch to all sinks that support the category', async () => {
      const markerStore = createFakeMarkerStore();
      const sink1 = createFakeSink({ id: 'sink-1' });
      const sink2 = createFakeSink({ id: 'sink-2' });
      const push1 = vi.spyOn(sink1, 'push');
      const push2 = vi.spyOn(sink2, 'push');
      const events = makeEvents(2, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink1, sink2]);

      expect(push1).toHaveBeenCalledOnce();
      expect(push2).toHaveBeenCalledOnce();
    });
  });

  describe('sink.supportsCategory filtering', () => {
    it('skips sinks that do not support the category', async () => {
      const markerStore = createFakeMarkerStore();
      const sink1 = createFakeSink({ id: 'sink-turns', supportedCategories: ['turns'] });
      const sink2 = createFakeSink({ id: 'sink-metadata', supportedCategories: ['metadata'] });
      const push1 = vi.spyOn(sink1, 'push');
      const push2 = vi.spyOn(sink2, 'push');
      const events = makeEvents(2, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink1, sink2]);

      expect(push1).toHaveBeenCalledOnce();
      expect(push2).not.toHaveBeenCalled();
    });

    it('skips the whole category if no sink supports it', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink({ supportedCategories: ['metadata'] });
      const pushSpy = vi.spyOn(sink, 'push');
      const events = makeEvents(3, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(pushSpy).not.toHaveBeenCalled();
      expect(result.state).toBe('done');
    });
  });

  describe('onUpdate callback', () => {
    it('calls onUpdate with pushing state during push', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const events = makeEvents(2, 'turns');
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const updates: JobUpdate[] = [];
      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink], (u) => updates.push(u));

      const states = updates.map((u) => u.state);
      expect(states).toContain('pushing');
      expect(states).toContain('done');
    });

    it('reports correct categoriesDone and eventsAccepted in final update', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const events = [
        ...makeEvents(2, 'metadata'),
        ...makeEvents(3, 'turns'),
      ];
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = {
        ref,
        categories: [
          { category: 'metadata', fromOrdinal: 0, resetCursor: false },
          { category: 'turns', fromOrdinal: 0, resetCursor: false },
        ],
        mode: 'incremental' as const,
      };

      let finalUpdate: JobUpdate | undefined;
      await orchestrator.runPlan(plan, source, [sink], (u) => {
        finalUpdate = u;
      });

      expect(finalUpdate?.state).toBe('done');
      expect(finalUpdate?.categoriesDone).toBe(2);
      expect(finalUpdate?.eventsAccepted).toBe(5);
    });

    it('calls onUpdate with retrying state on RetriableSinkError', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(1, 'turns');
      const source = makeSourceWithEvents(events);

      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn()
          .mockRejectedValueOnce(new RetriableSinkError('retry', 0))
          .mockResolvedValue({ acceptedOrdinals: [0], rejected: [] }),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        maxRetries: 2,
        baseRetryDelayMs: 0,
      });

      const updates: JobUpdate[] = [];
      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink], (u) => updates.push(u));

      expect(updates.some((u) => u.state === 'retrying')).toBe(true);
    });
  });

  describe('full plan marker update', () => {
    it('sets lastFullReuploadAt even with no events when marker already exists', async () => {
      const markerStore = createFakeMarkerStore();
      const existingMarker = createTestMarker('copilot-cli', ref.sessionId);
      await markerStore.write(ref, existingMarker);

      const source = makeSourceWithEvents([]);
      const sink = createFakeSink();
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: true }], mode: 'full' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.lastFullReuploadAt).toBeDefined();
    });

    it('does not overwrite lastFullReuploadAt on non-full plans', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(1, 'turns');
      const source = makeSourceWithEvents(events);
      const sink = createFakeSink();
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.lastFullReuploadAt).toBeUndefined();
    });
  });

  describe('eventsRejected tracking', () => {
    it('counts rejected events from sink push result', async () => {
      const markerStore = createFakeMarkerStore();
      const events = makeEvents(3, 'turns');
      const source = makeSourceWithEvents(events);

      const sink: EnrichmentSink = {
        ...createFakeSink(),
        push: vi.fn().mockResolvedValue({
          acceptedOrdinals: [0, 2],
          rejected: [{ ordinal: 1, reason: 'schema mismatch' }],
        }),
      };

      const orchestrator = new DefaultSyncOrchestrator(markerStore);
      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(result.eventsAccepted).toBe(2);
      expect(result.eventsRejected).toBe(1);
    });
  });

  describe('empty plan', () => {
    it('returns done with zero counts for a plan with no categories', async () => {
      const markerStore = createFakeMarkerStore();
      const source = makeSourceWithEvents([]);
      const sink = createFakeSink();
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [], mode: 'incremental' as const };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(result.state).toBe('done');
      expect(result.eventsAccepted).toBe(0);
      expect(result.categoriesDone).toBe(0);
    });
  });

  describe('resetCursor behaviour', () => {
    beforeEach(() => {});

    it('passes undefined cursor when resetCursor is true', async () => {
      const markerStore = createFakeMarkerStore();

      const readEventsCursors: Array<Record<string, unknown>> = [];
      const source: SessionEnrichmentSource = {
        ...createFakeSource('copilot-cli'),
        async *readEvents(_ref, cursors) {
          readEventsCursors.push({ ...cursors });
          // yield nothing
        },
      };
      const sink = createFakeSink();
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = { ref, categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: true }], mode: 'full' as const };
      await orchestrator.runPlan(plan, source, [sink]);

      expect(readEventsCursors[0]?.['turns']).toBeUndefined();
    });
  });
});
