/**
 * Zod schema for the {@link DcrRow} interface.
 *
 * Mirrors the column types defined in {@link DcrRow} and documented in
 * `packages/sink-dcr/src/schema.ts`. Used at schema-contract boundaries to
 * validate that serialised rows conform to the expected shape.
 */

import { z } from 'zod';

export const dcrRowSchema = z.object({
  /** Timestamp used by Azure Monitor to ingest the row. */
  TimeGenerated: z.string().datetime(),
  /** Original event timestamp (ISO 8601). */
  EventTs: z.string().datetime(),
  /** Unique identifier for this event. */
  EventId: z.string(),
  /** Session identifier. */
  SessionId: z.string(),
  /** Tool that emitted the event. */
  Tool: z.string(),
  /** Tool version string. */
  ToolVersion: z.string(),
  /** Event category. */
  Category: z.string(),
  /** Ordinal position within the session (non-negative integer). */
  Ordinal: z.number().int().nonnegative(),
  /** Payload schema identifier. */
  PayloadSchema: z.string(),
  /** Schema version of the envelope (currently always 1). */
  SchemaVersion: z.literal(1),
  /** Source machine identifier. */
  SourceMachine: z.string(),
  /** User identifier (empty string when not set). */
  SourceUser: z.string(),
  /** Tenant identifier (empty string when not set). */
  TenantId: z.string(),
  /** JSON-serialised event payload. */
  Payload: z.string(),
  /** Timestamp when the batch was pushed to this sink (ISO 8601). */
  PushedAt: z.string().datetime(),
});

export type DcrRowParsed = z.infer<typeof dcrRowSchema>;
