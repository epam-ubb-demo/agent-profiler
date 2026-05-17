/**
 * T12.1.2 — VS Code Chat round-trip contract test.
 *
 * Reads events from the golden fixture via {@link VsCodeChatEnrichmentSource}
 * (bypassing filesystem discovery with an override session list), encodes to
 * {@link DcrRow}, decodes back, and verifies field-level fidelity plus
 * successful projection.
 */

import { join } from 'node:path';

import type { DiscoveredSession } from '@agent-profiler/adapters-vscode-chat';
import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';
import { mapDcrRowToEvent, mapEventsToDcrRows } from '@agent-profiler/sink-dcr';
import { VsCodeChatEnrichmentSource, VsCodeChatSessionProjector } from '@agent-profiler/source-vscode-chat';
import { loadVsCodeChatFixture } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

describe('vscode-chat round-trip: EnrichmentEvent → DcrRow → EnrichmentEvent', () => {
  const fixture = loadVsCodeChatFixture();
  const PUSH_TS = '2025-01-01T00:00:00.000Z';

  async function readSourceEvents(): Promise<readonly EnrichmentEvent[]> {
    const override: DiscoveredSession = {
      sessionId: fixture.sessionId,
      filePath: join(fixture.fixtureDir, 'transcript.jsonl'),
      workspaceDir: '',
      variant: 'stable' as const,
    };

    const source = new VsCodeChatEnrichmentSource([override]);
    const events: EnrichmentEvent[] = [];

    for await (const ref of source.discoverSessions()) {
      for await (const event of source.readEvents(ref, {})) {
        events.push(event);
      }
    }

    return events;
  }

  it('preserves all event fields through DcrRow serialisation', async () => {
    const original = await readSourceEvents();
    expect(original.length).toBeGreaterThan(0);

    const rows = mapEventsToDcrRows(original, PUSH_TS);
    const reconstituted = rows.map(mapDcrRowToEvent);

    expect(reconstituted).toHaveLength(original.length);

    for (let i = 0; i < original.length; i++) {
      const orig = original[i]!;
      const recon = reconstituted[i]!;

      expect(recon.schemaVersion).toBe(orig.schemaVersion);
      expect(recon.tool).toBe(orig.tool);
      expect(recon.toolVersion).toBe(orig.toolVersion);
      expect(recon.sourceMachine).toBe(orig.sourceMachine);
      expect(recon.sessionId).toBe(orig.sessionId);
      expect(recon.category).toBe(orig.category);
      expect(recon.ordinal).toBe(orig.ordinal);
      expect(recon.eventId).toBe(orig.eventId);
      expect(recon.eventTs).toBe(orig.eventTs);
      expect(recon.payloadSchema).toBe(orig.payloadSchema);
      expect(recon.payload).toEqual(orig.payload);
    }
  });

  it('projects reconstituted events into a Session with the correct sessionId', async () => {
    const original = await readSourceEvents();
    const rows = mapEventsToDcrRows(original, PUSH_TS);
    const reconstituted = rows.map(mapDcrRowToEvent);

    const projector = new VsCodeChatSessionProjector();
    const session = projector.project(reconstituted);

    expect(session.sessionId).toBe(fixture.sessionId);
  });

  it('produces the same number of DcrRows as events from the source', async () => {
    const original = await readSourceEvents();
    const rows = mapEventsToDcrRows(original, PUSH_TS);
    expect(rows).toHaveLength(original.length);
  });
});
