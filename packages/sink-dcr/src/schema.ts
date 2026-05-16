/**
 * Shape of a single row written to the AgentSessionEvents_CL custom table
 * via the DCR Logs Ingestion API.
 *
 * All columns are required (no optional properties) so the SDK can serialize
 * them without special-casing undefined values.
 *
 * Column-type mapping for Azure Monitor custom table:
 *   TimeGenerated  → datetime  (ingest timestamp; must be ≤ 2 days old)
 *   EventTs        → datetime  (original event timestamp)
 *   EventId        → string
 *   SessionId      → string
 *   Tool           → string
 *   ToolVersion    → string
 *   Category       → string
 *   Ordinal        → long
 *   PayloadSchema  → string
 *   SchemaVersion  → int
 *   SourceMachine  → string
 *   SourceUser     → string
 *   TenantId       → string
 *   Payload        → string    (JSON-serialised payload — dynamic columns are not
 *                                supported for DCR custom log ingestion)
 *   PushedAt       → datetime  (same as TimeGenerated; retained for explicit queries)
 */
export interface DcrRow {
  /** Timestamp used by Azure Monitor to ingest the row. Set to the push time. */
  TimeGenerated: string;
  /** Original event timestamp (eventTs from EnrichmentEvent). */
  EventTs: string;
  /** Unique identifier for this event. */
  EventId: string;
  /** Session identifier. */
  SessionId: string;
  /** Tool that emitted the event. */
  Tool: string;
  /** Tool version string. */
  ToolVersion: string;
  /** Event category. */
  Category: string;
  /** Ordinal position within the session. */
  Ordinal: number;
  /** Payload schema identifier. */
  PayloadSchema: string;
  /** Schema version (always 1 currently). */
  SchemaVersion: number;
  /** Source machine identifier. */
  SourceMachine: string;
  /** User identifier (empty string if not provided). */
  SourceUser: string;
  /** Tenant identifier (empty string if not provided). */
  TenantId: string;
  /** JSON-serialised event payload. */
  Payload: string;
  /** Timestamp when the batch was pushed to this sink (ISO 8601). */
  PushedAt: string;
}
