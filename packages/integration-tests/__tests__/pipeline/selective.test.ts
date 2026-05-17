/**
 * T12.2.7 — Selective sync pipeline integration test.
 *
 * Verifies that planSelective(ref, ['metadata']) causes only 'metadata'
 * events to flow through the pipeline, and that other categories are not
 * delivered to the sink.
 *
 * Uses Claude Code as the test source because it has predictable category
 * coverage: metadata, tool_result, user_interaction.
 */

import { join } from 'node:path';

import type { DiscoveredSession } from '@agent-profiler/adapters-claude-code';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import type { EnrichmentEvent, SessionRef } from '@agent-profiler/enrichment-core';
import { ClaudeCodeEnrichmentSource } from '@agent-profiler/source-claude-code';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { loadClaudeCodeFixture } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

describe('selective sync', () => {
  const fixture = loadClaudeCodeFixture();

  const overrideSession: DiscoveredSession = {
    sessionId: fixture.sessionId,
    filePath: join(fixture.fixtureDir, 'events.jsonl'),
    projectDir: '',
    cwd: null,
  };

  async function collectRefs(source: ClaudeCodeEnrichmentSource): Promise<SessionRef[]> {
    const refs: SessionRef[] = [];
    for await (const ref of source.discoverSessions()) {
      refs.push(ref);
    }
    return refs;
  }

  /**
   * Read all events from the source directly (bypassing the orchestrator)
   * to establish the ground-truth event count for pipeline assertions.
   */
  async function readAllSourceEvents(): Promise<EnrichmentEvent[]> {
    const source = new ClaudeCodeEnrichmentSource([overrideSession]);
    const events: EnrichmentEvent[] = [];
    for await (const ref of source.discoverSessions()) {
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }
    }
    return events;
  }

  it('planSelective with ["metadata"] only delivers metadata events', async () => {
    const markerStore = createFakeMarkerStore();
    const sink = new InMemorySink();
    const source = new ClaudeCodeEnrichmentSource([overrideSession]);
    const planner = new DefaultSyncPlanner(markerStore, source);
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    for (const ref of await collectRefs(source)) {
      const plan = await planner.planSelective(ref, ['metadata']);
      await orchestrator.runPlan(plan, source, [sink]);
    }

    expect(sink.pushedEvents.length).toBeGreaterThan(0);
    for (const event of sink.pushedEvents) {
      expect(event.category).toBe('metadata');
    }
  });

  it('planSelective with ["tool_result"] only delivers tool_result events', async () => {
    const markerStore = createFakeMarkerStore();
    const sink = new InMemorySink();
    const source = new ClaudeCodeEnrichmentSource([overrideSession]);
    const planner = new DefaultSyncPlanner(markerStore, source);
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    for (const ref of await collectRefs(source)) {
      const plan = await planner.planSelective(ref, ['tool_result']);
      await orchestrator.runPlan(plan, source, [sink]);
    }

    expect(sink.pushedEvents.length).toBeGreaterThan(0);
    for (const event of sink.pushedEvents) {
      expect(event.category).toBe('tool_result');
    }
  });

  it('planSelective with multiple categories limits delivery to those categories', async () => {
    const markerStore = createFakeMarkerStore();
    const sink = new InMemorySink();
    const source = new ClaudeCodeEnrichmentSource([overrideSession]);
    const planner = new DefaultSyncPlanner(markerStore, source);
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    const selectedCategories = ['metadata', 'tool_result'];

    for (const ref of await collectRefs(source)) {
      const plan = await planner.planSelective(ref, selectedCategories);
      await orchestrator.runPlan(plan, source, [sink]);
    }

    expect(sink.pushedEvents.length).toBeGreaterThan(0);
    for (const event of sink.pushedEvents) {
      expect(selectedCategories).toContain(event.category);
    }
    // user_interaction should NOT appear
    const hasUserInteraction = sink.pushedEvents.some((e) => e.category === 'user_interaction');
    expect(hasUserInteraction).toBe(false);
  });

  it('selective and then full sync re-delivers all events', async () => {
    const markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    // Establish ground-truth count from direct source read
    const totalSourceCount = (await readAllSourceEvents()).length;
    expect(totalSourceCount).toBeGreaterThan(0);

    // First: selective metadata-only sync
    const sink1 = new InMemorySink();
    const source1 = new ClaudeCodeEnrichmentSource([overrideSession]);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planSelective(ref, ['metadata']);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    const metadataCount = sink1.pushedEvents.length;
    expect(metadataCount).toBeGreaterThan(0);

    // Second: full sync should deliver ALL events (resets all cursors)
    const sink2 = new InMemorySink();
    const source2 = new ClaudeCodeEnrichmentSource([overrideSession]);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planFull(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBe(totalSourceCount);
  });
});
