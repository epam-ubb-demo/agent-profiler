import type { EnrichmentEvent, ToolId } from '@agent-profiler/enrichment-core';

import type { DcrRow } from './schema.js';

/**
 * Maps a single {@link EnrichmentEvent} to a {@link DcrRow}.
 *
 * @param event - The enrichment event to map.
 * @param pushTimestamp - ISO 8601 timestamp representing when the batch was
 *   pushed.  Used for both `TimeGenerated` (required by Azure Monitor) and
 *   `PushedAt` (retained for query convenience).
 */
export function mapEventToDcrRow(event: EnrichmentEvent, pushTimestamp: string): DcrRow {
  return {
    TimeGenerated: pushTimestamp,
    EventTs: event.eventTs,
    EventId: event.eventId,
    SessionId: event.sessionId,
    Tool: event.tool,
    ToolVersion: event.toolVersion,
    Category: event.category,
    Ordinal: event.ordinal,
    PayloadSchema: event.payloadSchema,
    SchemaVersion: event.schemaVersion,
    SourceMachine: event.sourceMachine,
    SourceUser: event.userId ?? '',
    TenantId: event.tenantId ?? '',
    Payload: JSON.stringify(event.payload),
    PushedAt: pushTimestamp,
  };
}

/**
 * Maps an array of {@link EnrichmentEvent}s to {@link DcrRow}s, all sharing
 * the same push timestamp.
 */
export function mapEventsToDcrRows(
  events: readonly EnrichmentEvent[],
  pushTimestamp: string,
): DcrRow[] {
  return events.map(event => mapEventToDcrRow(event, pushTimestamp));
}

/**
 * Reverse-maps a single {@link DcrRow} back to an {@link EnrichmentEvent}.
 *
 * `TimeGenerated` and `PushedAt` are sink-level columns (not present on
 * {@link EnrichmentEvent}) and are intentionally dropped. `TenantId` and
 * `SourceUser` use empty string as a sentinel for "not set"; they are omitted
 * from the result to honour `exactOptionalPropertyTypes`.
 *
 * @param row - The DCR row to reverse-map.
 */
export function mapDcrRowToEvent(row: DcrRow): EnrichmentEvent {
  return {
    schemaVersion: row.SchemaVersion as 1,
    ...(row.TenantId !== '' ? { tenantId: row.TenantId } : {}),
    ...(row.SourceUser !== '' ? { userId: row.SourceUser } : {}),
    tool: row.Tool as ToolId,
    toolVersion: row.ToolVersion,
    sourceMachine: row.SourceMachine,
    sessionId: row.SessionId,
    category: row.Category,
    ordinal: row.Ordinal,
    eventId: row.EventId,
    eventTs: row.EventTs,
    payloadSchema: row.PayloadSchema,
    payload: JSON.parse(row.Payload) as Record<string, unknown>,
  };
}
