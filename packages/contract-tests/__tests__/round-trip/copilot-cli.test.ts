/**
 * T12.1.1 — Copilot CLI round-trip contract test.
 *
 * Verifies that encoding a golden {@link EnrichmentEvent} set to {@link DcrRow}
 * (via {@link mapEventsToDcrRows}) and decoding it back (via
 * {@link mapDcrRowToEvent}) produces an identical set of events, and that the
 * reconstituted events can be projected into a valid Session.
 */

import { mapDcrRowToEvent, mapEventsToDcrRows } from '@agent-profiler/sink-dcr';
import { CopilotCliSessionProjector } from '@agent-profiler/source-copilot-cli';
import { loadCopilotCliFixture } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

describe('copilot-cli round-trip: EnrichmentEvent → DcrRow → EnrichmentEvent', () => {
  const fixture = loadCopilotCliFixture();
  const PUSH_TS = '2025-01-01T00:00:00.000Z';

  it('preserves all event fields through DcrRow serialisation', () => {
    const rows = mapEventsToDcrRows(fixture.expectedEvents, PUSH_TS);
    const reconstituted = rows.map(mapDcrRowToEvent);

    expect(reconstituted).toHaveLength(fixture.expectedEvents.length);

    for (let i = 0; i < fixture.expectedEvents.length; i++) {
      const orig = fixture.expectedEvents[i]!;
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
      expect(recon.tenantId).toBe(orig.tenantId);
      expect(recon.userId).toBe(orig.userId);
    }
  });

  it('optional tenantId and userId survive the round-trip as undefined when absent', () => {
    const eventWithoutOptionals = fixture.expectedEvents[0]!;
    // Copilot CLI golden events do not set tenantId or userId
    expect(eventWithoutOptionals.tenantId).toBeUndefined();
    expect(eventWithoutOptionals.userId).toBeUndefined();

    const [row] = mapEventsToDcrRows([eventWithoutOptionals], PUSH_TS);
    const recon = mapDcrRowToEvent(row!);

    expect(recon.tenantId).toBeUndefined();
    expect(recon.userId).toBeUndefined();
  });

  it('projects reconstituted events into a Session with the correct sessionId', () => {
    const rows = mapEventsToDcrRows(fixture.expectedEvents, PUSH_TS);
    const reconstituted = rows.map(mapDcrRowToEvent);

    const projector = new CopilotCliSessionProjector();
    const session = projector.project(reconstituted);

    expect(session.sessionId).toBe(fixture.sessionId);
  });

  it('produces the same number of DcrRows as input events', () => {
    const rows = mapEventsToDcrRows(fixture.expectedEvents, PUSH_TS);
    expect(rows).toHaveLength(fixture.expectedEvents.length);
  });
});
