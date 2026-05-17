import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';
import {
  createFakeMarkerStore,
  createFakeSink,
  createFakeSource,
  createTestEvent,
  createTestSessionRef,
} from '@agent-profiler/enrichment-core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DefaultSyncOrchestrator } from '../src/sync-orchestrator.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSourceWithEvents(events: EnrichmentEvent[]) {
  return {
    ...createFakeSource('copilot-cli'),
    async *readEvents() {
      for (const e of events) yield e;
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DefaultSyncOrchestrator — TenantConfig enrichment', () => {
  const ref = createTestSessionRef('copilot-cli', 'session-tenant-1');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('event enrichment', () => {
    it('enriches events with both tenantId and userId when tenantConfig is provided', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'acme-corp', userId: 'alice@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      expect(pushSpy).toHaveBeenCalledOnce();
      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      expect(pushed).toHaveLength(1);
      expect(pushed[0]?.tenantId).toBe('acme-corp');
      expect(pushed[0]?.userId).toBe('alice@example.com');
    });

    it('enriches events with only tenantId when only tenantId is provided', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'acme-corp' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      expect(pushed[0]?.tenantId).toBe('acme-corp');
      expect(pushed[0]?.userId).toBeUndefined();
    });

    it('enriches events with only userId when only userId is provided', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { userId: 'alice@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      expect(pushed[0]?.tenantId).toBeUndefined();
      expect(pushed[0]?.userId).toBe('alice@example.com');
    });

    it('does NOT modify events when tenantConfig is undefined', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore); // no options

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      expect(pushed[0]?.tenantId).toBeUndefined();
      expect(pushed[0]?.userId).toBeUndefined();
      // The pushed event should be reference-equal to the original (no copy created)
      expect(pushed[0]).toBe(rawEvent);
    });

    it('does NOT modify events when tenantConfig has no fields set', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: {}, // empty — no tenantId, no userId
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      expect(pushed[0]?.tenantId).toBeUndefined();
      expect(pushed[0]?.userId).toBeUndefined();
      expect(pushed[0]).toBe(rawEvent);
    });

    it('updates the eventId of enriched events to include tenant/user', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'acme-corp', userId: 'alice@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const pushed = pushSpy.mock.calls[0]?.[0] as readonly EnrichmentEvent[];
      // The enriched eventId should include the tenantId and userId segments
      expect(pushed[0]?.eventId).toContain('acme-corp');
      expect(pushed[0]?.eventId).toContain('alice@example.com');
      // The original event's eventId should NOT have been mutated
      expect(rawEvent.eventId).not.toContain('acme-corp');
    });

    it('does not mutate the original events', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const originalEventId = rawEvent.eventId;
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'acme-corp', userId: 'alice@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      // Original event must be unchanged
      expect(rawEvent.tenantId).toBeUndefined();
      expect(rawEvent.userId).toBeUndefined();
      expect(rawEvent.eventId).toBe(originalEventId);
    });
  });

  describe('marker storage', () => {
    it('stores tenantId and userId from enriched events in the marker', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'acme-corp', userId: 'alice@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.tenantId).toBe('acme-corp');
      expect(marker?.userId).toBe('alice@example.com');
    });

    it('does not set tenantId/userId on marker when tenantConfig is absent', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();

      const rawEvent = createTestEvent('copilot-cli', ref.sessionId, 'turns', 0);
      const source = makeSourceWithEvents([rawEvent]);
      const orchestrator = new DefaultSyncOrchestrator(markerStore);

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      await orchestrator.runPlan(plan, source, [sink]);

      const marker = await markerStore.read(ref);
      expect(marker?.tenantId).toBeUndefined();
      expect(marker?.userId).toBeUndefined();
    });
  });

  describe('plan mode compatibility', () => {
    it('enriches events in incremental plan mode', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const events = [
        createTestEvent('copilot-cli', ref.sessionId, 'turns', 0),
        createTestEvent('copilot-cli', ref.sessionId, 'turns', 1),
      ];
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'team-x' },
      });

      const plan = {
        ref,
        categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: false }],
        mode: 'incremental' as const,
      };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(result.state).toBe('done');
      const pushed = (pushSpy.mock.calls[0]?.[0] ?? []) as readonly EnrichmentEvent[];
      expect(pushed.every((e) => e.tenantId === 'team-x')).toBe(true);
    });

    it('enriches events in full plan mode and stamps lastFullReuploadAt', async () => {
      const markerStore = createFakeMarkerStore();
      const sink = createFakeSink();
      const pushSpy = vi.spyOn(sink, 'push');

      const events = [createTestEvent('copilot-cli', ref.sessionId, 'metadata', 0)];
      const source = makeSourceWithEvents(events);
      const orchestrator = new DefaultSyncOrchestrator(markerStore, {
        tenantConfig: { tenantId: 'team-full', userId: 'bob@example.com' },
      });

      const plan = {
        ref,
        categories: [{ category: 'metadata', fromOrdinal: 0, resetCursor: true }],
        mode: 'full' as const,
      };
      const result = await orchestrator.runPlan(plan, source, [sink]);

      expect(result.state).toBe('done');

      // Enrichment applied
      const pushed = (pushSpy.mock.calls[0]?.[0] ?? []) as readonly EnrichmentEvent[];
      expect(pushed[0]?.tenantId).toBe('team-full');
      expect(pushed[0]?.userId).toBe('bob@example.com');

      // Full plan metadata preserved
      const marker = await markerStore.read(ref);
      expect(marker?.lastFullReuploadAt).toBeDefined();
      expect(marker?.tenantId).toBe('team-full');
      expect(marker?.userId).toBe('bob@example.com');
    });
  });
});
