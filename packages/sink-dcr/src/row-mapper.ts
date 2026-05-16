import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

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
