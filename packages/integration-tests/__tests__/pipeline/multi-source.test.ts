/**
 * T12.2.5 — Multi-source pipeline integration test.
 *
 * Verifies that syncing all three sources (copilot-cli, vscode-chat, claude-code)
 * sequentially into a single shared InMemorySink produces the correct aggregate
 * event count and that events are correctly partitioned by tool. Sources are run
 * in sequence (not concurrently) — the orchestrator processes one source at a
 * time — and each session's events are keyed by (tool, sessionId) without
 * bleeding into each other.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DiscoveredSession as ClaudeDiscoveredSession } from '@agent-profiler/adapters-claude-code';
import type { DiscoveredSession as VsCodeDiscoveredSession } from '@agent-profiler/adapters-vscode-chat';
import type { EnrichmentEvent, SessionRef } from '@agent-profiler/enrichment-core';
import { createFakeMarkerStore } from '@agent-profiler/enrichment-core/testing';
import { ClaudeCodeEnrichmentSource } from '@agent-profiler/source-claude-code';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { VsCodeChatEnrichmentSource } from '@agent-profiler/source-vscode-chat';
import { DefaultSyncOrchestrator, DefaultSyncPlanner } from '@agent-profiler/sync-engine';
import { loadVsCodeChatFixture, loadClaudeCodeFixture } from '@agent-profiler/test-fixtures';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COPILOT_SESSIONS_ROOT = join(__dirname, '..', '..', 'fixtures', 'copilot-cli-sessions');

describe('multi-source pipeline integration', () => {
  const vsCodeFixture = loadVsCodeChatFixture();
  const claudeFixture = loadClaudeCodeFixture();

  const vsCodeOverride: VsCodeDiscoveredSession = {
    sessionId: vsCodeFixture.sessionId,
    filePath: join(vsCodeFixture.fixtureDir, 'transcript.jsonl'),
    workspaceDir: '',
    variant: 'stable' as const,
  };

  const claudeOverride: ClaudeDiscoveredSession = {
    sessionId: claudeFixture.sessionId,
    filePath: join(claudeFixture.fixtureDir, 'events.jsonl'),
    projectDir: '',
    cwd: null,
  };

  async function collectRefs(source: { discoverSessions(): AsyncGenerator<SessionRef> }): Promise<SessionRef[]> {
    const refs: SessionRef[] = [];
    for await (const ref of source.discoverSessions()) {
      refs.push(ref);
    }
    return refs;
  }

  /** Read all events from a source directly for count baseline. */
  async function readAll(source: {
    discoverSessions(): AsyncGenerator<SessionRef>;
    readEvents(ref: SessionRef, cursors: Record<string, unknown>): AsyncGenerator<EnrichmentEvent>;
  }): Promise<EnrichmentEvent[]> {
    const events: EnrichmentEvent[] = [];
    for await (const ref of source.discoverSessions()) {
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }
    }
    return events;
  }

  let sink: InMemorySink;
  let markerStore: ReturnType<typeof createFakeMarkerStore>;
  let cliSourceCount: number;
  let vsCodeSourceCount: number;
  let claudeSourceCount: number;

  beforeEach(async () => {
    sink = new InMemorySink();
    markerStore = createFakeMarkerStore();
    const orchestrator = new DefaultSyncOrchestrator(markerStore);

    // Establish ground-truth counts from direct source reads
    cliSourceCount = (await readAll(new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT))).length;
    vsCodeSourceCount = (await readAll(new VsCodeChatEnrichmentSource([vsCodeOverride]))).length;
    claudeSourceCount = (await readAll(new ClaudeCodeEnrichmentSource([claudeOverride]))).length;

    // Sync copilot-cli
    const cliSource = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const cliPlanner = new DefaultSyncPlanner(markerStore, cliSource);
    for (const ref of await collectRefs(cliSource)) {
      const plan = await cliPlanner.planIncremental(ref);
      await orchestrator.runPlan(plan, cliSource, [sink]);
    }

    // Sync vscode-chat
    const vsSource = new VsCodeChatEnrichmentSource([vsCodeOverride]);
    const vsPlanner = new DefaultSyncPlanner(markerStore, vsSource);
    for (const ref of await collectRefs(vsSource)) {
      const plan = await vsPlanner.planIncremental(ref);
      await orchestrator.runPlan(plan, vsSource, [sink]);
    }

    // Sync claude-code
    const claudeSource = new ClaudeCodeEnrichmentSource([claudeOverride]);
    const claudePlanner = new DefaultSyncPlanner(markerStore, claudeSource);
    for (const ref of await collectRefs(claudeSource)) {
      const plan = await claudePlanner.planIncremental(ref);
      await orchestrator.runPlan(plan, claudeSource, [sink]);
    }
  });

  it('total event count equals sum of all three sources', () => {
    const expected = cliSourceCount + vsCodeSourceCount + claudeSourceCount;
    expect(expected).toBeGreaterThan(0);
    expect(sink.pushedEvents.length).toBe(expected);
  });

  it('copilot-cli events are tagged correctly', () => {
    const cliEvents = sink.pushedEvents.filter((e) => e.tool === 'copilot-cli');
    expect(cliEvents.length).toBe(cliSourceCount);
    for (const event of cliEvents) {
      expect(event.tool).toBe('copilot-cli');
    }
  });

  it('vscode-chat events are tagged correctly', () => {
    const vsEvents = sink.pushedEvents.filter((e) => e.tool === 'vscode-chat');
    expect(vsEvents.length).toBe(vsCodeSourceCount);
    for (const event of vsEvents) {
      expect(event.sessionId).toBe(vsCodeFixture.sessionId);
    }
  });

  it('claude-code events are tagged correctly', () => {
    const claudeEvents = sink.pushedEvents.filter((e) => e.tool === 'claude-code');
    expect(claudeEvents.length).toBe(claudeSourceCount);
    for (const event of claudeEvents) {
      expect(event.sessionId).toBe(claudeFixture.sessionId);
    }
  });

  it('no events are shared between tool buckets', () => {
    const tools = new Set(sink.pushedEvents.map((e) => e.tool));
    expect(tools).toEqual(new Set(['copilot-cli', 'vscode-chat', 'claude-code']));
  });

  it('marker store has written markers for all three tools after sync', async () => {
    // copilot-cli — verify at least one session has a marker with cursor entries
    const cliSource = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const cliRefs = await collectRefs(cliSource);
    expect(cliRefs.length).toBeGreaterThan(0);
    for (const ref of cliRefs) {
      const marker = await markerStore.read(ref);
      expect(marker).toBeDefined();
      expect(Object.keys(marker!.cursors).length).toBeGreaterThan(0);
    }

    // vscode-chat
    const vsSource = new VsCodeChatEnrichmentSource([vsCodeOverride]);
    const vsRefs = await collectRefs(vsSource);
    expect(vsRefs.length).toBeGreaterThan(0);
    for (const ref of vsRefs) {
      const marker = await markerStore.read(ref);
      expect(marker).toBeDefined();
      expect(Object.keys(marker!.cursors).length).toBeGreaterThan(0);
    }

    // claude-code
    const claudeSource = new ClaudeCodeEnrichmentSource([claudeOverride]);
    const claudeRefs = await collectRefs(claudeSource);
    expect(claudeRefs.length).toBeGreaterThan(0);
    for (const ref of claudeRefs) {
      const marker = await markerStore.read(ref);
      expect(marker).toBeDefined();
      expect(Object.keys(marker!.cursors).length).toBeGreaterThan(0);
    }
  });
});
