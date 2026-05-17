/**
 * T12.3.4 — Marker corruption tests.
 *
 * Verifies orchestrator behaviour when the marker file on disk is corrupt:
 *   1. FileMarkerStore.read() throws for corrupt JSON (not silently returns undefined).
 *   2. runPlan() propagates the corruption error — corrupt markers are a hard failure,
 *      not a silent fallback.
 *   3. planFull on a fresh store (no prior marker) succeeds and delivers all events.
 *   4. After a planFull writes a valid marker, a subsequent incremental run delivers
 *      0 events — confirming the marker written by planFull is valid.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SessionRef } from '@agent-profiler/enrichment-core';
import { CopilotCliEnrichmentSource } from '@agent-profiler/source-copilot-cli';
import { DefaultSyncOrchestrator, DefaultSyncPlanner, FileMarkerStore } from '@agent-profiler/sync-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemorySink } from '../../src/in-memory-sink.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COPILOT_SESSIONS_ROOT = join(__dirname, '..', '..', 'fixtures', 'copilot-cli-sessions');

/** Marker file name produced by FileMarkerStore for the golden-copilot-001 session. */
const MARKER_FILE_NAME = 'copilot-cli--golden-copilot-001.marker.json';

async function collectRefs(source: CopilotCliEnrichmentSource): Promise<SessionRef[]> {
  const refs: SessionRef[] = [];
  for await (const ref of source.discoverSessions()) {
    refs.push(ref);
  }
  return refs;
}

describe('marker corruption', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'resilience-corrupt-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('FileMarkerStore.read() throws on corrupt JSON', async () => {
    const markerStore = new FileMarkerStore(tmpDir);
    const markerPath = join(tmpDir, MARKER_FILE_NAME);

    // Write corrupt JSON directly to the expected marker path
    await writeFile(markerPath, '{not valid json', 'utf8');

    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const refs = await collectRefs(source);
    expect(refs.length).toBeGreaterThan(0);

    await expect(markerStore.read(refs[0]!)).rejects.toThrow();
  });

  it('runPlan() throws when the marker file is corrupt', async () => {
    const markerPath = join(tmpDir, MARKER_FILE_NAME);

    // Pre-write corrupt marker so runPlan throws when it tries to read it
    await writeFile(markerPath, '{not valid json', 'utf8');

    const markerStore = new FileMarkerStore(tmpDir);
    const source = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 1 });
    const planner = new DefaultSyncPlanner(markerStore, source);
    const sink = new InMemorySink();

    const refs = await collectRefs(source);
    expect(refs.length).toBeGreaterThan(0);
    const ref = refs[0]!;
    const plan = await planner.planFull(ref);

    // The orchestrator reads the marker per category; a corrupt file throws
    await expect(orchestrator.runPlan(plan, source, [sink])).rejects.toThrow();
  });

  it('planFull on a fresh store (no prior marker) delivers all events', async () => {
    // Empty tmpDir — no marker file at all
    const markerStore = new FileMarkerStore(tmpDir);
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

  it('incremental run after planFull (fresh store) delivers 0 events', async () => {
    const markerStore = new FileMarkerStore(tmpDir);
    const orchestrator = new DefaultSyncOrchestrator(markerStore, { batchSize: 10 });

    // planFull run — writes a valid marker
    const source1 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner1 = new DefaultSyncPlanner(markerStore, source1);
    const sink1 = new InMemorySink();

    for (const ref of await collectRefs(source1)) {
      const plan = await planner1.planFull(ref);
      await orchestrator.runPlan(plan, source1, [sink1]);
    }

    expect(sink1.pushedEvents.length).toBeGreaterThan(0);

    // Incremental run — marker written by planFull is valid; nothing new to deliver
    const source2 = new CopilotCliEnrichmentSource(COPILOT_SESSIONS_ROOT);
    const planner2 = new DefaultSyncPlanner(markerStore, source2);
    const sink2 = new InMemorySink();

    for (const ref of await collectRefs(source2)) {
      const plan = await planner2.planIncremental(ref);
      await orchestrator.runPlan(plan, source2, [sink2]);
    }

    expect(sink2.pushedEvents.length).toBe(0);
  });
});
