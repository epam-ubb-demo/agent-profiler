/**
 * Unit tests for mapEventToDcrRow and mapEventsToDcrRows.
 */

import { createTestEvent } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { mapEventToDcrRow, mapEventsToDcrRows } from '../src/row-mapper.js';

const PUSH_TS = '2024-01-15T12:00:00.000Z';

describe('mapEventToDcrRow', () => {
  it('sets TimeGenerated and PushedAt to the push timestamp', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(row.TimeGenerated).toBe(PUSH_TS);
    expect(row.PushedAt).toBe(PUSH_TS);
  });

  it('preserves the original EventTs from the event', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(row.EventTs).toBe(event.eventTs);
    expect(row.EventTs).not.toBe(PUSH_TS);
  });

  it('maps identity and session fields correctly', () => {
    const event = createTestEvent('copilot-cli', 'session-abc', 'metadata', 3);
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(row.EventId).toBe(event.eventId);
    expect(row.SessionId).toBe(event.sessionId);
    expect(row.Tool).toBe(event.tool);
    expect(row.ToolVersion).toBe(event.toolVersion);
    expect(row.Category).toBe(event.category);
    expect(row.Ordinal).toBe(event.ordinal);
    expect(row.PayloadSchema).toBe(event.payloadSchema);
    expect(row.SchemaVersion).toBe(event.schemaVersion);
    expect(row.SourceMachine).toBe(event.sourceMachine);
  });

  it('defaults SourceUser to empty string when userId is absent', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    // createTestEvent does not set userId by default
    expect(event.userId).toBeUndefined();

    const row = mapEventToDcrRow(event, PUSH_TS);
    expect(row.SourceUser).toBe('');
  });

  it('defaults TenantId to empty string when tenantId is absent', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0);
    expect(event.tenantId).toBeUndefined();

    const row = mapEventToDcrRow(event, PUSH_TS);
    expect(row.TenantId).toBe('');
  });

  it('JSON-stringifies the payload object', () => {
    const payload = { nested: { array: [1, 2, 3], flag: true } };
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, payload);
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(row.Payload).toBe(JSON.stringify(payload));
  });

  it('JSON-stringifies an empty payload object', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, {});
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(row.Payload).toBe('{}');
  });

  it('produces a Payload string (not an object)', () => {
    const event = createTestEvent('copilot-cli', 'session-1', 'metadata', 0, { x: 1 });
    const row = mapEventToDcrRow(event, PUSH_TS);

    expect(typeof row.Payload).toBe('string');
  });
});

describe('mapEventsToDcrRows', () => {
  it('returns an empty array for an empty input', () => {
    const rows = mapEventsToDcrRows([], PUSH_TS);
    expect(rows).toHaveLength(0);
  });

  it('returns one row per event', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'utilisation', 1),
      createTestEvent('copilot-cli', 'session-1', 'compaction', 2),
    ];
    const rows = mapEventsToDcrRows(events, PUSH_TS);

    expect(rows).toHaveLength(3);
  });

  it('uses the same push timestamp for every row', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 0),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 1),
    ];
    const rows = mapEventsToDcrRows(events, PUSH_TS);

    for (const row of rows) {
      expect(row.TimeGenerated).toBe(PUSH_TS);
      expect(row.PushedAt).toBe(PUSH_TS);
    }
  });

  it('preserves ordinal ordering', () => {
    const events = [
      createTestEvent('copilot-cli', 'session-1', 'metadata', 7),
      createTestEvent('copilot-cli', 'session-1', 'metadata', 3),
    ];
    const rows = mapEventsToDcrRows(events, PUSH_TS);

    expect(rows[0]!.Ordinal).toBe(7);
    expect(rows[1]!.Ordinal).toBe(3);
  });
});
