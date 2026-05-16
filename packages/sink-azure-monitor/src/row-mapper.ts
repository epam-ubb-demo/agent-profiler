import type { EnrichmentRow } from '@agent-profiler/core';
import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

/**
 * Converts an EnrichmentEvent envelope to an EnrichmentRow suitable for
 * Azure Monitor ingestion (DCR custom table).
 *
 * Key mapping rules:
 * - TimeGenerated = current push time (Azure silently rejects >2-day-old logs)
 * - EventId = event.eventId (deterministic, for dedup)
 * - SessionId = event.sessionId
 * - Category = event.category (must be one of the enrichment-row schema values)
 * - Payload = event.payload
 * - SchemaVersion = event.schemaVersion
 * - SourceUser = event.userId ?? '' (empty string when no user)
 * - SourceMachine = event.sourceMachine
 * - PushedAt = push timestamp (same as TimeGenerated in practice)
 */
export function mapEventToRow(event: EnrichmentEvent, pushTimestamp: string): EnrichmentRow {
  return {
    TimeGenerated: pushTimestamp,
    EventId: event.eventId,
    SessionId: event.sessionId,
    Category: event.category as EnrichmentRow['Category'],
    Payload: event.payload,
    SchemaVersion: event.schemaVersion,
    SourceUser: event.userId ?? '',
    SourceMachine: event.sourceMachine,
    PushedAt: pushTimestamp,
  };
}

export function mapEventsToRows(
  events: readonly EnrichmentEvent[],
  pushTimestamp: string,
): EnrichmentRow[] {
  return events.map(e => mapEventToRow(e, pushTimestamp));
}
