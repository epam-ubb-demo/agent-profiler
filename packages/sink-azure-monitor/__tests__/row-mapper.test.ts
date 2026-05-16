/**
 * Unit tests for row-mapper.ts
 */

import { createTestEvent } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { mapEventToRow, mapEventsToRows } from '../src/row-mapper.js';

describe('mapEventToRow', () => {
  const pushTimestamp = '2024-01-15T10:00:00.000Z';

  it('maps all fields correctly from EnrichmentEvent to EnrichmentRow', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, {
      key: 'value',
    });
    const row = mapEventToRow(event, pushTimestamp);

    expect(row.TimeGenerated).toBe(pushTimestamp);
    expect(row.EventId).toBe(event.eventId);
    expect(row.SessionId).toBe(event.sessionId);
    expect(row.Category).toBe(event.category);
    expect(row.Payload).toEqual(event.payload);
    expect(row.SchemaVersion).toBe(event.schemaVersion);
    expect(row.SourceMachine).toBe(event.sourceMachine);
    expect(row.PushedAt).toBe(pushTimestamp);
  });

  it('uses pushTimestamp for both TimeGenerated and PushedAt', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    const row = mapEventToRow(event, pushTimestamp);

    expect(row.TimeGenerated).toBe(pushTimestamp);
    expect(row.PushedAt).toBe(pushTimestamp);
  });

  it('sets SourceUser to empty string when userId is absent', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    // createTestEvent does not set userId, so it should be absent
    expect(event.userId).toBeUndefined();

    const row = mapEventToRow(event, pushTimestamp);
    expect(row.SourceUser).toBe('');
  });

  it('sets SourceUser to the userId when present', () => {
    const event = {
      ...createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      userId: 'user@example.com',
    };

    const row = mapEventToRow(event, pushTimestamp);
    expect(row.SourceUser).toBe('user@example.com');
  });

  it('casts category to EnrichmentRow Category type', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'utilisation', 0);
    const row = mapEventToRow(event, pushTimestamp);
    expect(row.Category).toBe('utilisation');
  });

  it('preserves the payload object as-is', () => {
    const payload = { nested: { count: 42 }, items: [1, 2, 3] };
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, payload);
    const row = mapEventToRow(event, pushTimestamp);

    expect(row.Payload).toEqual(payload);
  });

  it('maps schemaVersion from event', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    const row = mapEventToRow(event, pushTimestamp);

    expect(row.SchemaVersion).toBe(1);
  });

  it('maps sourceMachine from event', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    const row = mapEventToRow(event, pushTimestamp);

    // createTestEvent sets sourceMachine to 'test-machine'
    expect(row.SourceMachine).toBe('test-machine');
  });
});

describe('mapEventsToRows', () => {
  const pushTimestamp = '2024-01-15T10:00:00.000Z';

  it('returns an empty array for an empty input', () => {
    const rows = mapEventsToRows([], pushTimestamp);
    expect(rows).toEqual([]);
  });

  it('maps each event to a row using the same pushTimestamp', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 2),
    ];

    const rows = mapEventsToRows(events, pushTimestamp);

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.TimeGenerated).toBe(pushTimestamp);
      expect(row.PushedAt).toBe(pushTimestamp);
    }
  });

  it('produces rows whose EventIds match their source events', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];

    const rows = mapEventsToRows(events, pushTimestamp);

    expect(rows[0]!.EventId).toBe(events[0]!.eventId);
    expect(rows[1]!.EventId).toBe(events[1]!.eventId);
  });

  it('preserves the order of input events', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 10),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 5),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 20),
    ];

    const rows = mapEventsToRows(events, pushTimestamp);

    // The row order must match event order, not be sorted
    expect(rows[0]!.EventId).toBe(events[0]!.eventId);
    expect(rows[1]!.EventId).toBe(events[1]!.eventId);
    expect(rows[2]!.EventId).toBe(events[2]!.eventId);
  });
});
